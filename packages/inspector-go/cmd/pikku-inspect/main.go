// Command pikku-inspect is a prototype Go port of one slice of @pikku/inspector:
// function discovery (visitFunctions / addFunctions). It builds a typescript-go
// program over the same root files the TS CLI uses and prints a JSON object
// shaped like `state.functions.meta`.
//
// usage: pikku-inspect [-timing] [-files out.txt] <projectDir>
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
)

type pikkuConfig struct {
	RootDir        string   `json:"rootDir"`
	Tsconfig       string   `json:"tsconfig"`
	SrcDirectories []string `json:"srcDirectories"`
	IgnoreFiles    []string `json:"ignoreFiles"`
}

func main() {
	timing := flag.Bool("timing", false, "print phase timings to stderr")
	filesOut := flag.String("files", "", "write the root file list here")
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: pikku-inspect [-timing] <projectDir>")
		os.Exit(2)
	}
	start := time.Now()
	projectDir, _ := filepath.Abs(flag.Arg(0))

	raw, err := os.ReadFile(filepath.Join(projectDir, "pikku.config.json"))
	must(err)
	var cfg pikkuConfig
	must(json.Unmarshal(raw, &cfg))
	if cfg.RootDir == "" {
		cfg.RootDir = "."
	}
	rootDir := filepath.ToSlash(filepath.Join(projectDir, cfg.RootDir))
	if len(cfg.IgnoreFiles) > 0 {
		fmt.Fprintln(os.Stderr, "warning: custom ignoreFiles are not supported by the prototype; using defaults")
	}

	files := findSourceFiles(rootDir, cfg.SrcDirectories)
	if *filesOut != "" {
		sorted := append([]string(nil), files...)
		sort.Strings(sorted)
		must(os.WriteFile(*filesOut, []byte(strings.Join(sorted, "\n")), 0o644))
	}

	tProgram := time.Now()
	fsys := bundled.WrapFS(osvfs.FS())
	host := compiler.NewCompilerHost(projectDir, fsys, bundled.LibPath(), nil, nil)
	opts := &core.CompilerOptions{
		Target:              core.ScriptTargetESNext,
		Module:              core.ModuleKindNode16,
		ModuleResolution:    core.ModuleResolutionKindNode16,
		SkipLibCheck:        core.TSTrue,
		SkipDefaultLibCheck: core.TSTrue,
		Types:               []string{},
		AllowJs:             core.TSFalse,
		CheckJs:             core.TSFalse,
	}
	// readProjectPathMappings: only the resolution keys are copied from the
	// project's tsconfig.
	if cfg.Tsconfig != "" {
		tsconfigPath := tspath.NormalizePath(filepath.Join(projectDir, cfg.Tsconfig))
		parsed, errs := tsoptions.GetParsedCommandLineOfConfigFile(tsconfigPath, &core.CompilerOptions{}, nil, host, nil)
		if len(errs) == 0 && parsed != nil {
			po := parsed.CompilerOptions()
			opts.Paths = po.Paths
			opts.BaseUrl = po.BaseUrl
			opts.RootDirs = po.RootDirs
			opts.PathsBasePath = po.PathsBasePath
		}
	}
	parsedCmd := tsoptions.NewParsedCommandLine(opts, files, tspath.ComparePathsOptions{
		UseCaseSensitiveFileNames: fsys.UseCaseSensitiveFileNames(),
		CurrentDirectory:          projectDir,
	})
	program := compiler.NewProgram(compiler.ProgramOptions{Config: parsedCmd, Host: host})
	program.BindSourceFiles()
	programDur := time.Since(tProgram)

	tChecker := time.Now()
	ctx := context.Background()
	checker, release := program.GetTypeChecker(ctx)
	defer release()
	checkerDur := time.Since(tChecker)

	tVisit := time.Now()
	isNested := nestedProjectFilter(rootDir)
	var sourceFiles []*ast.SourceFile
	for _, sf := range program.GetSourceFiles() {
		name := sf.FileName()
		if strings.HasPrefix(name, rootDir) && !strings.Contains(name, "/node_modules/") && !isNested(name) {
			sourceFiles = append(sourceFiles, sf)
		}
	}
	sort.Slice(sourceFiles, func(i, j int) bool { return sourceFiles[i].FileName() < sourceFiles[j].FileName() })

	st := newState(rootDir, checker)
	// Minimal stand-in for the setup sweep: only what addFunctions reads back
	// (middleware / permission definitions and tag middleware).
	for _, sf := range sourceFiles {
		walk(sf.AsNode(), st.visitSetup)
	}
	for _, sf := range sourceFiles {
		walk(sf.AsNode(), st.addFunctions)
	}
	visitDur := time.Since(tVisit)

	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	must(enc.Encode(st.meta))

	if *timing {
		fmt.Fprintf(os.Stderr, `{"files":%d,"programFiles":%d,"projectFiles":%d,"functions":%d,"programMs":%d,"checkerMs":%d,"visitMs":%d,"totalMs":%d}`+"\n",
			len(files), len(program.GetSourceFiles()), len(sourceFiles), len(st.meta),
			programDur.Milliseconds(), checkerDur.Milliseconds(), visitDur.Milliseconds(), time.Since(start).Milliseconds())
	}
}

// walk visits node's descendants in pre-order (ts.forEachChild recursion).
func walk(node *ast.Node, visit func(*ast.Node)) {
	node.ForEachChild(func(child *ast.Node) bool {
		visit(child)
		walk(child, visit)
		return false
	})
}

// findSourceFiles mirrors packages/cli/src/utils/find-source-files.ts with the
// default ignoreFiles: every *.ts under each srcDirectory (tinyglobby skips
// dot-files/dirs by default), minus *.test.ts, *.spec.ts, node_modules, dist.
func findSourceFiles(rootDir string, srcDirs []string) []string {
	var out []string
	for _, dir := range srcDirs {
		base := filepath.Join(rootDir, dir)
		_ = filepath.WalkDir(base, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			name := d.Name()
			if d.IsDir() {
				if p != base && (strings.HasPrefix(name, ".") || name == "node_modules" || name == "dist") {
					return filepath.SkipDir
				}
				return nil
			}
			if strings.HasPrefix(name, ".") || !strings.HasSuffix(name, ".ts") ||
				strings.HasSuffix(name, ".test.ts") || strings.HasSuffix(name, ".spec.ts") {
				return nil
			}
			out = append(out, filepath.ToSlash(p))
			return nil
		})
	}
	return out
}

func nestedProjectFilter(rootDir string) func(string) bool {
	cache := map[string]bool{}
	return func(fileName string) bool {
		var pending []string
		dir := path.Dir(fileName)
		nested := false
		for strings.HasPrefix(dir, rootDir) && dir != rootDir {
			if v, ok := cache[dir]; ok {
				nested = v
				break
			}
			pending = append(pending, dir)
			if _, err := os.Stat(filepath.Join(dir, "pikku.config.json")); err == nil {
				nested = true
				break
			}
			parent := path.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
		for _, d := range pending {
			cache[d] = nested
		}
		return nested
	}
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
