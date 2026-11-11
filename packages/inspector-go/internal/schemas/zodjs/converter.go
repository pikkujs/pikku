// Package zodjs converts Zod schemas to JSON Schema without Node. esbuild
// bundles the modules that declare them, with the project's own zod, into one
// script, and QuickJS (compiled to WebAssembly, run by wazero) runs it inside
// pikku-inspect. A schema that cannot be converted that way goes to the Node
// converter when there is one.
package zodjs

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
	"github.com/fastschema/qjs"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/schemas"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

//go:embed runner.js
var runnerJS string

const (
	helpersModule = "pikku:zod-helpers"
	runnerModule  = "pikku:zod-runner"
	stubNamespace = "pikku-stub"
)

// Converter is a schemas.VendorSchemaConverter that needs no Node.
type Converter struct {
	// Dir is the project root: zod and the project's imports resolve from it.
	Dir string
	// Tsconfig is the project's tsconfig, for its paths and JSX settings.
	Tsconfig string
	// CacheDir keeps wazero's compiled QuickJS between runs; compiling it
	// takes a few hundred milliseconds. Empty compiles it on every run.
	CacheDir string
	// Fallback converts what QuickJS cannot: a module that does not load
	// without Node, or a schema built from an import that was stubbed. Nil
	// when Node is not available, and those schemas are reported as errors.
	Fallback schemas.VendorSchemaConverter
}

type runResult struct {
	Schemas  [][2]json.RawMessage `json:"schemas"`
	Errors   []string             `json:"errors"`
	Fallback [][2]string          `json:"fallback"`
}

func (c Converter) Convert(ctx context.Context, refs []schemas.VendorRef) (schemas.VendorResult, error) {
	out, err := c.run(ctx, refs)
	if err != nil {
		if c.Fallback != nil {
			return c.Fallback.Convert(ctx, refs)
		}
		return schemas.VendorResult{}, fmt.Errorf("converting Zod schemas without Node: %w", err)
	}

	converted := map[string]schemas.VendorSchema{}
	for _, pair := range out.Schemas {
		s, err := decodeSchema(pair)
		if err != nil {
			return schemas.VendorResult{}, err
		}
		converted[s.Name] = s
	}
	res := schemas.VendorResult{Errors: out.Errors}

	if len(out.Fallback) > 0 {
		reasons := map[string]string{}
		for _, f := range out.Fallback {
			reasons[f[0]] = f[1]
		}
		var pending []schemas.VendorRef
		for _, ref := range refs {
			if _, ok := reasons[ref.Name]; ok {
				pending = append(pending, ref)
			}
		}
		if c.Fallback == nil {
			for _, ref := range pending {
				res.Errors = append(res.Errors, fmt.Sprintf(
					"Could not convert Zod schema '%s' without Node: %s. Install Node, or build the schema from values the module declares itself.",
					ref.Name, reasons[ref.Name]))
			}
		} else {
			viaNode, err := c.Fallback.Convert(ctx, pending)
			if err != nil {
				return schemas.VendorResult{}, err
			}
			for _, s := range viaNode.Schemas {
				converted[s.Name] = s
			}
			res.Errors = append(res.Errors, viaNode.Errors...)
		}
	}

	for _, ref := range refs {
		if s, ok := converted[ref.Name]; ok {
			res.Schemas = append(res.Schemas, s)
		}
	}
	return res, nil
}

func decodeSchema(pair [2]json.RawMessage) (schemas.VendorSchema, error) {
	var name string
	var body struct {
		Schema   json.RawMessage `json:"schema"`
		TypeText string          `json:"typeText"`
	}
	if err := json.Unmarshal(pair[0], &name); err != nil {
		return schemas.VendorSchema{}, err
	}
	if err := json.Unmarshal(pair[1], &body); err != nil {
		return schemas.VendorSchema{}, err
	}
	return schemas.VendorSchema{Name: name, Schema: state.Raw(body.Schema), TypeText: body.TypeText}, nil
}

func (c Converter) run(ctx context.Context, refs []schemas.VendorRef) (runResult, error) {
	bundle, err := c.bundle(refs)
	if err != nil {
		return runResult{}, err
	}
	rt, err := qjs.New(qjs.Option{
		Context:  ctx,
		CacheDir: c.cacheDir(),
		// A module that logs while it loads must not write into the
		// protocol on stdout.
		Stdout: io.Discard,
		Stderr: io.Discard,
	})
	if err != nil {
		return runResult{}, fmt.Errorf("starting QuickJS: %w", err)
	}
	defer rt.Close()
	value, err := rt.Context().Eval("zod-schemas.js", qjs.Code(bundle+"\nglobalThis.__pikkuResult"))
	if err != nil {
		return runResult{}, err
	}
	defer value.Free()
	var out runResult
	if err := json.Unmarshal([]byte(value.String()), &out); err != nil {
		return runResult{}, fmt.Errorf("reading the QuickJS result: %w", err)
	}
	return out, nil
}

// tsconfig is c.Tsconfig when it exists: esbuild fails a build whose
// tsconfig is missing, and the paths it adds are only a convenience here.
func (c Converter) tsconfig() string {
	if _, err := os.Stat(c.Tsconfig); err != nil {
		return ""
	}
	return c.Tsconfig
}

func (c Converter) cacheDir() string {
	if c.CacheDir == "" {
		return ""
	}
	return filepath.Join(c.CacheDir, "quickjs")
}

// runtimeFile is vendor-schemas.mjs's schemaRuntimeFile: a schema declared in
// a .d.ts is loaded from the .js emitted beside it, when there is one.
var declarationFile = regexp.MustCompile(`\.d\.([cm]?)ts$`)

func runtimeFile(sourceFile string) string {
	if !declarationFile.MatchString(sourceFile) {
		return sourceFile
	}
	emitted := declarationFile.ReplaceAllString(sourceFile, ".${1}js")
	if _, err := os.Stat(emitted); err == nil {
		return emitted
	}
	return sourceFile
}

// bundle writes the script QuickJS runs: every module declaring a schema,
// loaded on demand so that one which throws costs only its own schemas.
func (c Converter) bundle(refs []schemas.VendorRef) (string, error) {
	index := map[string]int{}
	var files, lookup []string
	for _, ref := range refs {
		file := runtimeFile(ref.SourceFile)
		i, ok := index[file]
		if !ok {
			i = len(index)
			index[file] = i
			files = append(files, fmt.Sprintf("{ file: %s, load: () => require(%s) }", quote(file), quote(file)))
		}
		r, err := json.Marshal(ref.SchemaRef)
		if err != nil {
			return "", err
		}
		lookup = append(lookup, fmt.Sprintf("[%s, %s, %d]", quote(ref.Name), r, i))
	}
	entry := "import * as z from 'zod'\n" +
		"import { zodToTypeText, findZodTransform } from '" + helpersModule + "'\n" +
		"import { run } from '" + runnerModule + "'\n" +
		"globalThis.__pikkuResult = JSON.stringify(run({ z, zodToTypeText, findZodTransform,\n" +
		"  files: [" + strings.Join(files, ",\n") + "],\n" +
		"  lookup: [" + strings.Join(lookup, ",\n") + "] }))\n"

	res := api.Build(api.BuildOptions{
		Stdin:      &api.StdinOptions{Contents: entry, ResolveDir: c.Dir, Loader: api.LoaderJS, Sourcefile: "zod-schemas-entry.js"},
		Bundle:     true,
		Format:     api.FormatIIFE,
		Platform:   api.PlatformNeutral,
		MainFields: []string{"module", "main"},
		Conditions: []string{"import", "default"},
		Target:     api.ES2020,
		Tsconfig:   c.tsconfig(),
		Banner:     map[string]string{"js": c.prelude()},
		Loader:     assetLoaders,
		LogLevel:   api.LogLevelSilent,
		Plugins:    []api.Plugin{c.plugin()},
	})
	if len(res.Errors) > 0 {
		msg := res.Errors[0].Text
		if loc := res.Errors[0].Location; loc != nil {
			msg = fmt.Sprintf("%s:%d: %s", loc.File, loc.Line, msg)
		}
		return "", fmt.Errorf("bundling the modules that declare Zod schemas: %s", msg)
	}
	return string(res.OutputFiles[0].Contents), nil
}

// assetLoaders keep a module that imports a stylesheet or an image loadable:
// none of them can hold a schema.
var assetLoaders = func() map[string]api.Loader {
	m := map[string]api.Loader{}
	for _, ext := range []string{".css", ".scss", ".sass", ".less", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".md", ".html", ".txt", ".sql", ".wasm", ".node"} {
		m[ext] = api.LoaderEmpty
	}
	return m
}()

// prelude stands in for the parts of Node a module reads while it loads.
func (c Converter) prelude() string {
	env := map[string]string{}
	for _, kv := range os.Environ() {
		if k, v, ok := strings.Cut(kv, "="); ok {
			env[k] = v
		}
	}
	envJSON, _ := json.Marshal(env)
	platform := runtime.GOOS
	if platform == "windows" {
		platform = "win32"
	}
	return fmt.Sprintf("globalThis.global = globalThis;\n"+
		"globalThis.process = { env: %s, argv: [], platform: %s, versions: {}, cwd: () => %s };",
		envJSON, quote(platform), quote(c.Dir))
}

const skipResolve = "pikku-zodjs-resolving"

// plugin serves the embedded modules and stubs every import that is not
// zod, not part of the project and not resolvable at all.
func (c Converter) plugin() api.Plugin {
	return api.Plugin{Name: "pikku-zodjs", Setup: func(b api.PluginBuild) {
		b.OnResolve(api.OnResolveOptions{Filter: `^pikku:`}, func(a api.OnResolveArgs) (api.OnResolveResult, error) {
			return api.OnResolveResult{Path: a.Path, Namespace: "pikku"}, nil
		})
		b.OnLoad(api.OnLoadOptions{Filter: `.*`, Namespace: "pikku"}, func(a api.OnLoadArgs) (api.OnLoadResult, error) {
			contents := runnerJS
			if a.Path == helpersModule {
				contents = helpersJS
			}
			return api.OnLoadResult{Contents: &contents, Loader: api.LoaderJS, ResolveDir: c.Dir}, nil
		})
		b.OnResolve(api.OnResolveOptions{Filter: `^[^./]`}, func(a api.OnResolveArgs) (api.OnResolveResult, error) {
			if a.PluginData == skipResolve || isZod(a.Path) || filepath.IsAbs(a.Path) {
				return api.OnResolveResult{}, nil
			}
			r := b.Resolve(a.Path, api.ResolveOptions{Importer: a.Importer, ResolveDir: a.ResolveDir, Kind: a.Kind, PluginData: skipResolve})
			if len(r.Errors) == 0 && r.Path != "" && !r.External && !inNodeModules(r.Path) {
				return api.OnResolveResult{Path: r.Path, Namespace: r.Namespace}, nil
			}
			return api.OnResolveResult{Path: a.Path, Namespace: stubNamespace}, nil
		})
		b.OnLoad(api.OnLoadOptions{Filter: `.*`, Namespace: stubNamespace}, func(a api.OnLoadArgs) (api.OnLoadResult, error) {
			contents := fmt.Sprintf("module.exports = require(%s).createStub(%s)", quote(runnerModule), quote(a.Path))
			return api.OnLoadResult{Contents: &contents, Loader: api.LoaderJS, ResolveDir: c.Dir}, nil
		})
	}}
}

func isZod(path string) bool {
	return path == "zod" || strings.HasPrefix(path, "zod/")
}

func inNodeModules(path string) bool {
	return strings.Contains(filepath.ToSlash(path), "/node_modules/")
}

func quote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
