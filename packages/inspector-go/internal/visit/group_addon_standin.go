package visit

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of the parts of add-wire-addon.ts / load-addon-functions-meta.ts that
// HTTP and queue wirings read: which addons exist, their function metadata,
// and the typesMap entries for addon schema names.

type addonDecl struct {
	pkg    string
	file   string
	auth   *bool
	scopes []string
	// secretOverrides / variableOverrides / credentialOverrides
	overrides map[string]*state.Record[string]
}

func init() {
	Register(Visitor{Name: "addWireAddon (stand-in)", Phase: PhaseSetup, Order: OrderAddWireAddon, Visit: (*Context).visitWireAddonStandin})
}

// visitWireAddonStandin covers wireAddon.
func (s *Context) visitWireAddonStandin(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	args := node.Arguments()
	switch node.Expression().Text() {
	case "wireAddon":
		if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
			return
		}
		name := tsutil.GetPropertyValue(args[0], "name").AsString()
		pkg := tsutil.GetPropertyValue(args[0], "package").AsString()
		if name == "" || pkg == "" {
			return
		}
		if _, ok := s.addons[name]; !ok {
			s.addonOrder = append(s.addonOrder, name)
		}
		scopes, _ := tsutil.GetArrayPropertyValue(args[0], "scopes")
		s.addons[name] = &addonDecl{
			pkg: pkg, file: ast.GetSourceFileOfNode(node).FileName(),
			auth: tsutil.GetPropertyValue(args[0], "auth").Bool, scopes: scopes,
			overrides: map[string]*state.Record[string]{
				"secret":     recordPropertyValue(args[0], "secretOverrides"),
				"variable":   recordPropertyValue(args[0], "variableOverrides"),
				"credential": recordPropertyValue(args[0], "credentialOverrides"),
			},
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

// LoadAddonFunctionsMeta ports load-addon-functions-meta.ts.
func (s *Context) LoadAddonFunctionsMeta() {
	for _, ns := range s.addonOrder {
		decl := s.addons[ns]
		for _, dir := range addonResolutionDirs(s.RootDir, decl.file) {
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
			meta := state.NewRecord[*FunctionMeta]()
			if json.Unmarshal(raw, meta) != nil {
				break
			}
			s.State.AddonFunctions.Set(ns, meta)
			// registerAddonTypes, in the meta file's key order.
			typesPath := filepath.ToSlash(filepath.Join(filepath.Dir(metaPath), "..", "rpc", "pikku-rpc-wirings-map.internal.gen.d.ts"))
			if _, err := os.Stat(typesPath); err == nil {
				meta.Each(func(_ string, m *FunctionMeta) {
					for _, n := range []*string{m.InputSchemaName, m.OutputSchemaName} {
						if n != nil && *n != "" && s.TypesMap().Exists(*n, typesPath) == "" {
							s.TypesMap().AddType(*n, typesPath)
						}
					}
				})
			}
			s.loadAddonKeyedMeta(decl, dir)
			break
		}
	}
}

// loadAddonKeyedMeta merges an addon's secrets, variables and credentials
// meta into the project's definitions, remapped through the wireAddon
// overrides, as load-addon-functions-meta.ts does, and its scopes.
func (s *Context) loadAddonKeyedMeta(decl *addonDecl, dir string) {
	merge := func(sub, kind, idField string, defs *state.List[state.Raw]) {
		path := resolvePackageSubpath(dir, decl.pkg, sub)
		if path == "" {
			return
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return
		}
		var meta state.Record[state.Raw]
		if json.Unmarshal(raw, &meta) != nil {
			return
		}
		overrides := decl.overrides[kind]
		meta.Each(func(key string, defRaw state.Raw) {
			var def state.Record[state.Raw]
			if json.Unmarshal(defRaw, &def) != nil {
				return
			}
			id := key
			if idField != "" {
				var v string
				if r, ok := def.Get(idField); ok && json.Unmarshal(r, &v) == nil {
					id = v
				}
			}
			if overrides != nil {
				if o, ok := overrides.Get(id); ok {
					id = o
				}
			}
			for _, existing := range *defs {
				var d struct {
					Name     string  `json:"name"`
					SecretID *string `json:"secretId"`
					VarID    *string `json:"variableId"`
				}
				_ = json.Unmarshal(existing, &d)
				have := d.Name
				if idField == "secretId" && d.SecretID != nil {
					have = *d.SecretID
				} else if idField == "variableId" && d.VarID != nil {
					have = *d.VarID
				}
				if have == id {
					return
				}
			}
			field := idField
			if field == "" {
				field = "name"
			}
			def.Set(field, state.Raw(jsjson.MustMarshal(id)))
			*defs = append(*defs, state.Raw(jsjson.MustMarshal(&def)))
		})
	}
	merge(".pikku/secrets/pikku-secrets-meta.gen.json", "secret", "secretId", &s.State.Secrets.Definitions)
	s.loadAddonScopes(decl, dir)
	merge(".pikku/variables/pikku-variables-meta.gen.json", "variable", "variableId", &s.State.Variables.Definitions)
	merge(".pikku/credentials/pikku-credentials-meta.gen.json", "credential", "", &s.State.Credentials.Definitions)
}

func (s *Context) resolveFunctionMeta(id string) *FunctionMeta {
	if m := s.State.Functions.Meta.At(id); m != nil {
		return m
	}
	if i := strings.Index(id, ":"); i > 0 {
		if fns, ok := s.State.AddonFunctions.Get(id[:i]); ok && fns != nil {
			return fns.At(id[i+1:])
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
