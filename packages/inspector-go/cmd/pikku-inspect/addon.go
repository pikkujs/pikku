package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
)

// Port of the parts of add-wire-addon.ts / load-addon-functions-meta.ts that
// HTTP and queue wirings read: which addons exist, their function metadata,
// and the typesMap entries for addon schema names.

type addonDecl struct {
	pkg    string
	file   string
	auth   *bool
	scopes []string
}

func (s *state) visitSetupWirings(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	args := node.Arguments()
	switch node.Expression().Text() {
	case "wireAddon":
		if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
			return
		}
		name := getPropertyValue(args[0], "name").asString()
		pkg := getPropertyValue(args[0], "package").asString()
		if name == "" || pkg == "" {
			return
		}
		if _, ok := s.addons[name]; !ok {
			s.addonOrder = append(s.addonOrder, name)
		}
		scopes, _ := getArrayPropertyValue(args[0], "scopes")
		s.addons[name] = &addonDecl{
			pkg: pkg, file: ast.GetSourceFileOfNode(node).FileName(),
			auth: getPropertyValue(args[0], "auth").boolean, scopes: scopes,
		}
	case "addHTTPMiddleware":
		if len(args) >= 2 && ast.IsStringLiteral(args[0]) && ast.IsArrayLiteralExpression(args[1]) {
			p := args[0].Text()
			for _, existing := range s.httpRouteMiddleware {
				if existing == p {
					return
				}
			}
			s.httpRouteMiddleware = append(s.httpRouteMiddleware, p)
		}
	}
}

func nearestPackageDir(file string) string {
	for dir := filepath.Dir(file); dir != "/" && dir != "."; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
	}
	return ""
}

func addonResolutionDirs(rootDir, declFile string) []string {
	root, _ := filepath.Abs(rootDir)
	if d := nearestPackageDir(declFile); d != "" && d != root {
		return []string{d, root}
	}
	return []string{root}
}

// resolvePackageSubpath is a small node resolver: find node_modules/<pkg>
// walking up from dir, then map the subpath through a `./x/*` exports
// pattern (or use it as-is), returning the realpath of an existing file.
func resolvePackageSubpath(dir, pkg, subpath string) string {
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

func (s *state) loadAddonFunctionsMeta() {
	for _, ns := range s.addonOrder {
		decl := s.addons[ns]
		for _, dir := range addonResolutionDirs(s.rootDir, decl.file) {
			var metaPath string
			for _, suffix := range []string{"-verbose.gen.json", ".gen.json"} {
				if metaPath = resolvePackageSubpath(dir, decl.pkg, ".pikku/function/pikku-functions-meta"+suffix); metaPath != "" {
					break
				}
			}
			if metaPath == "" {
				continue
			}
			raw, err := os.ReadFile(metaPath)
			if err != nil {
				break
			}
			meta := map[string]*FunctionMeta{}
			if json.Unmarshal(raw, &meta) != nil {
				break
			}
			s.addonFunctions[ns] = meta
			// registerAddonTypes, in the meta file's key order.
			typesPath := filepath.ToSlash(filepath.Join(filepath.Dir(metaPath), "..", "rpc", "pikku-rpc-wirings-map.internal.gen.d.ts"))
			if _, err := os.Stat(typesPath); err == nil {
				for _, k := range jsonObjectKeys(raw) {
					m := meta[k]
					for _, n := range []*string{m.InputSchemaName, m.OutputSchemaName} {
						if n != nil && *n != "" && s.typesMap.exists(*n, typesPath) == "" {
							s.typesMap.addType(*n, typesPath)
						}
					}
				}
			}
			break
		}
	}
}

func jsonObjectKeys(raw []byte) []string {
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	if t, err := dec.Token(); err != nil || t != json.Delim('{') {
		return nil
	}
	var keys []string
	for dec.More() {
		t, err := dec.Token()
		if err != nil {
			return keys
		}
		keys = append(keys, t.(string))
		var skip json.RawMessage
		if dec.Decode(&skip) != nil {
			return keys
		}
	}
	return keys
}

func (s *state) resolveFunctionMeta(id string) *FunctionMeta {
	if m := s.meta[id]; m != nil {
		return m
	}
	if i := strings.Index(id, ":"); i > 0 {
		if fns := s.addonFunctions[id[:i]]; fns != nil {
			return fns[id[i+1:]]
		}
	}
	return nil
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
		Name string `json:"name"`
	}
	_ = json.Unmarshal(raw, &pj)
	return pj.Name
}

func (s *state) resolveAddonName(ident *ast.Node) string {
	if len(s.addons) == 0 {
		return ""
	}
	decl := firstDecl(s.c.GetSymbolAtLocation(ident))
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
