package finalize

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// LoadAddonSchemas ports load-addon-functions-meta.ts loadAddonSchemas: each
// local addon's generated `schemas/schemas/*.schema.json` is merged into
// state.schemas, without overwriting a schema the project already has.
func LoadAddonSchemas(_ *diag.Logger, st *state.State) {
	decls := &st.RPC.WireAddonDeclarations
	if decls.Len() == 0 {
		return
	}
	decls.Each(func(_ string, raw state.Raw) {
		var decl struct {
			Package string `json:"package"`
			File    string `json:"file"`
			Remote  any    `json:"remote"`
		}
		if json.Unmarshal(raw, &decl) != nil {
			return
		}
		if Truthy(decl.Remote) {
			return
		}
		var metaPath string
		for _, dir := range addonDirs(st.RootDir, decl.File) {
			if metaPath = resolveAddonSubpath(dir, decl.Package, ".pikku/function/pikku-functions-meta.gen.json"); metaPath != "" {
				break
			}
		}
		if metaPath == "" {
			// MODULE_NOT_FOUND / ERR_PACKAGE_PATH_NOT_EXPORTED: skipped silently.
			return
		}
		schemasDir := filepath.Join(filepath.Dir(metaPath), "..", "schemas", "schemas")
		entries, err := os.ReadDir(schemasDir)
		if err != nil {
			return
		}
		for _, e := range entries {
			file := e.Name()
			if !strings.HasSuffix(file, ".schema.json") {
				continue
			}
			name := strings.Replace(file, ".schema.json", "", 1)
			if existing, ok := st.Schemas.Get(name); ok && Truthy(rawTruthy(existing)) {
				continue
			}
			b, err := os.ReadFile(filepath.Join(schemasDir, file))
			if err != nil {
				return
			}
			v, err := Parse(b)
			if err != nil {
				// The TS inner try/catch swallows a bad file as "no schemas".
				return
			}
			st.Schemas.Set(name, ToRaw(v))
		}
	})
}

func rawTruthy(r state.Raw) any {
	v, err := ParseRaw(r)
	if err != nil {
		return true
	}
	return v
}

func addonPackageDir(file string) string {
	for dir := filepath.Dir(file); dir != "/" && dir != "."; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
	}
	return ""
}

// addonDirs is addon-resolution.ts addonResolutionDirs.
func addonDirs(rootDir, declFile string) []string {
	root, _ := filepath.Abs(rootDir)
	if declFile != "" {
		abs, _ := filepath.Abs(declFile)
		if d := addonPackageDir(abs); d != "" && d != root {
			return []string{d, root}
		}
	}
	return []string{root}
}

// resolveAddonSubpath is require.resolve(`${pkg}/${subpath}`) from dir: find
// node_modules/<pkg> walking up, map the subpath through the package's
// exports (exact or `*` pattern), and return the realpath of the file.
func resolveAddonSubpath(dir, pkg, subpath string) string {
	for d := dir; ; d = filepath.Dir(d) {
		pkgDir := filepath.Join(d, "node_modules", pkg)
		if raw, err := os.ReadFile(filepath.Join(pkgDir, "package.json")); err == nil {
			var pj struct {
				Exports map[string]json.RawMessage `json:"exports"`
			}
			_ = json.Unmarshal(raw, &pj)
			target := "./" + subpath
			for k, v := range pj.Exports {
				var to string
				if json.Unmarshal(v, &to) != nil {
					continue
				}
				if k == target {
					target = to
					break
				}
				if star := strings.Index(k, "*"); star >= 0 && strings.HasPrefix(target, k[:star]) && strings.HasSuffix(target, k[star+1:]) {
					mid := target[star : len(target)-len(k)+star+1]
					target = strings.Replace(to, "*", mid, 1)
					break
				}
			}
			p := filepath.Join(pkgDir, target)
			if _, err := os.Stat(p); err == nil {
				if real, err := filepath.EvalSymlinks(p); err == nil {
					return real
				}
				return p
			}
			return ""
		}
		if parent := filepath.Dir(d); parent == d {
			return ""
		}
	}
}
