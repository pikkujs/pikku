package visit

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Ports of utils/addon-resolution.ts and the package lookups in
// utils/resolve-addon-package.ts and load-addon-functions-meta.ts: Node's
// require.resolve for `<package>/<subpath>`, enough of it for the files an
// addon publishes.

func nearestPackageDir(file string) string {
	for dir := filepath.Dir(file); dir != "/" && dir != "."; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		if parent := filepath.Dir(dir); parent == dir {
			break
		}
	}
	return ""
}

// addonResolutionDirs: the declaring package first, then the root.
func addonResolutionDirs(rootDir, declFile string) []string {
	root, _ := filepath.Abs(rootDir)
	if declFile != "" {
		abs, _ := filepath.Abs(declFile)
		if d := nearestPackageDir(abs); d != "" && d != root {
			return []string{d, root}
		}
	}
	return []string{root}
}

// errNotResolved stands for require.resolve's MODULE_NOT_FOUND /
// ERR_PACKAGE_PATH_NOT_EXPORTED.
var errNotResolved = errors.New("module not resolved")

// addonResolver is createAddonResolver: try each directory in turn.
type addonResolver []string

func (r addonResolver) resolve(id string) (string, error) {
	pkg, sub := splitPackageSpecifier(id)
	for _, dir := range r {
		if p := resolvePackageSubpath(dir, pkg, sub); p != "" {
			return p, nil
		}
	}
	return "", errNotResolved
}

func splitPackageSpecifier(id string) (pkg, subpath string) {
	parts := strings.SplitN(id, "/", 3)
	if strings.HasPrefix(id, "@") && len(parts) >= 2 {
		pkg = parts[0] + "/" + parts[1]
		if len(parts) == 3 {
			subpath = parts[2]
		}
		return
	}
	i := strings.Index(id, "/")
	if i < 0 {
		return id, ""
	}
	return id[:i], id[i+1:]
}

// findInstalledPackageDir walks node_modules up from each dir.
func findInstalledPackageDir(dirs []string, pkg string) string {
	for _, start := range dirs {
		for dir := start; ; {
			candidate := filepath.Join(dir, "node_modules", pkg)
			if _, err := os.Stat(filepath.Join(candidate, "package.json")); err == nil {
				return candidate
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return ""
}

// requireConditions are the conditions createRequire's resolve matches.
var requireConditions = map[string]bool{"require": true, "node": true, "node-addons": true, "default": true, "module-sync": true}

// resolveExportTarget is PACKAGE_TARGET_RESOLVE for a string, a conditions
// object (in key order) or a fallback array. It returns "" for a target that
// resolves to nothing.
func resolveExportTarget(target *ojson, star string) string {
	switch {
	case target == nil:
		return ""
	case target.isArr:
		for _, t := range target.arr {
			if r := resolveExportTarget(t, star); r != "" {
				return r
			}
		}
		return ""
	case target.isObject():
		for _, k := range target.obj.Keys() {
			if requireConditions[k] {
				if r := resolveExportTarget(target.obj.At(k), star); r != "" {
					return r
				}
			}
		}
		return ""
	}
	s, ok := target.str()
	if !ok || !strings.HasPrefix(s, "./") {
		return ""
	}
	return strings.ReplaceAll(s, "*", star)
}

// resolveExports maps a "./subpath" through package.json exports: an exact
// key first, then the pattern with the longest prefix before its "*".
func resolveExports(exports *ojson, target string) (string, bool) {
	if !exports.isObject() {
		if target == "." {
			return resolveExportTarget(exports, ""), true
		}
		return "", true
	}
	keys := exports.obj.Keys()
	if len(keys) > 0 && !strings.HasPrefix(keys[0], ".") {
		if target == "." {
			return resolveExportTarget(exports, ""), true
		}
		return "", true
	}
	if t, ok := exports.obj.Get(target); ok && !strings.Contains(target, "*") {
		return resolveExportTarget(t, ""), true
	}
	type match struct{ key, star string }
	var matches []match
	for _, k := range keys {
		star := strings.Index(k, "*")
		if star < 0 || strings.Contains(k[star+1:], "*") {
			continue
		}
		prefix, suffix := k[:star], k[star+1:]
		if len(target) >= len(prefix)+len(suffix) && strings.HasPrefix(target, prefix) && strings.HasSuffix(target, suffix) && target != prefix {
			matches = append(matches, match{k, target[len(prefix) : len(target)-len(suffix)]})
		}
	}
	if len(matches) == 0 {
		return "", true
	}
	sort.SliceStable(matches, func(i, j int) bool {
		a, b := matches[i].key, matches[j].key
		ai, bi := strings.Index(a, "*"), strings.Index(b, "*")
		if ai != bi {
			return ai > bi
		}
		return len(a) > len(b)
	})
	return resolveExportTarget(exports.obj.At(matches[0].key), matches[0].star), true
}

// resolvePackageSubpath finds node_modules/<pkg> walking up from dir, maps
// the subpath through its exports (or uses it as-is when there are none), and
// returns the realpath of an existing file, or "".
func resolvePackageSubpath(dir, pkg, subpath string) string {
	for d := dir; ; d = filepath.Dir(d) {
		pkgDir := filepath.Join(d, "node_modules", pkg)
		if raw, err := os.ReadFile(filepath.Join(pkgDir, "package.json")); err == nil {
			target := "./" + subpath
			if subpath == "" {
				target = "."
			}
			pj, _ := parseOJSON(raw)
			if exports := pj.get("exports"); exports != nil && (exports.isObject() || exports.isArr || exports.scalar != nil) {
				mapped, _ := resolveExports(exports, target)
				if mapped == "" {
					return ""
				}
				target = mapped
			}
			p := filepath.Join(pkgDir, target)
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				if real, err := filepath.EvalSymlinks(p); err == nil {
					return filepath.ToSlash(real)
				}
				return filepath.ToSlash(p)
			}
			return ""
		}
		if parent := filepath.Dir(d); parent == d {
			return ""
		}
	}
}

func findPackageNameForFile(file string) string {
	dir := nearestPackageDir(file)
	if dir == "" {
		return ""
	}
	raw, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return ""
	}
	var pj struct {
		Name any `json:"name"`
	}
	if json.Unmarshal(raw, &pj) != nil {
		return ""
	}
	name, _ := pj.Name.(string)
	return name
}

// resolveFunctionMeta is utils/resolve-function-meta.ts.
func (s *Context) resolveFunctionMeta(id string) *FunctionMeta {
	if m := s.State.Functions.Meta.At(id); m != nil {
		return m
	}
	if i := strings.Index(id, ":"); i >= 0 {
		if fns, ok := s.State.AddonFunctions.Get(id[:i]); ok && fns != nil {
			return fns.At(id[i+1:])
		}
	}
	return nil
}

// resolveAddonName is utils/resolve-addon-package.ts.
func (s *Context) resolveAddonName(ident *ast.Node) string {
	if len(s.addons) == 0 {
		return ""
	}
	decl := tsutil.FirstDecl(s.Checker.GetSymbolAtLocation(ident))
	if decl == nil {
		return ""
	}
	if decl.Kind == ast.KindImportSpecifier {
		if imp := decl.Parent.Parent.Parent; imp != nil && imp.Kind == ast.KindImportDeclaration {
			if spec := imp.AsImportDeclaration().ModuleSpecifier; spec != nil && ast.IsStringLiteral(spec) && !strings.HasPrefix(spec.Text(), ".") {
				c := spec.Text()
				for _, ns := range s.addonOrder {
					if p := s.addons[ns].pkg; p == c || strings.HasPrefix(c, p+"/") {
						return p
					}
				}
			}
		}
	}
	if name := findPackageNameForFile(ast.GetSourceFileOfNode(decl).FileName()); name != "" {
		for _, ns := range s.addonOrder {
			if s.addons[ns].pkg == name {
				return name
			}
		}
	}
	return ""
}
