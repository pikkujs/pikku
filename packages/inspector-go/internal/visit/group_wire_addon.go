package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-wire-addon.ts.

// addonDecl is a state.rpc.wireAddonDeclarations entry, typed for the readers
// in the analysis (the addon loader, resolveAddonName); raw is what the state
// serializes.
type addonDecl struct {
	pkg    string
	file   string
	remote bool
	ui     bool
	// mcp and expose are nil (unset), a bool, or a []string.
	mcp, expose any
	// mcpEndpoint is nil, a bool or a string.
	mcpEndpoint any
	auth        *bool
	scopes      []string
	uses        *state.Record[string]
	// secretOverrides / variableOverrides / credentialOverrides. A
	// credential override is a string or an object { name?, mode? }.
	overrides map[string]*state.Record[*ojson]
}

func init() {
	Register(Visitor{Name: "addWireAddon", Phase: PhaseSetup, Order: OrderAddWireAddon, Visit: (*Context).addWireAddon})
}

func propKey(p *ast.Node) (string, bool) {
	if !ast.IsPropertyAssignment(p) {
		return "", false
	}
	if n := p.Name(); ast.IsIdentifier(n) || ast.IsStringLiteral(n) {
		return n.Text(), true
	}
	return "", false
}

// parseStringArray: an array of string literals, or nil, false.
func parseStringArray(n *ast.Node) ([]string, bool) {
	if !ast.IsArrayLiteralExpression(n) {
		return nil, false
	}
	out := []string{}
	for _, e := range n.Elements() {
		if !ast.IsStringLiteral(e) {
			return nil, false
		}
		out = append(out, e.Text())
	}
	return out, true
}

func parseStringRecord(obj *ast.Node) *state.Record[string] {
	rec := state.NewRecord[string]()
	for _, p := range obj.Properties() {
		key, ok := propKey(p)
		if ok && ast.IsStringLiteral(p.Initializer()) {
			rec.Set(key, p.Initializer().Text())
		}
	}
	return rec
}

func stringRecordToOJSON(rec *state.Record[string]) *state.Record[*ojson] {
	if rec == nil {
		return nil
	}
	out := state.NewRecord[*ojson]()
	rec.Each(func(k, v string) { out.Set(k, ojsonString(v)) })
	return out
}

func parseCredentialOverrideRecord(obj *ast.Node) *state.Record[*ojson] {
	rec := state.NewRecord[*ojson]()
	for _, p := range obj.Properties() {
		key, ok := propKey(p)
		if !ok || key == "" {
			continue
		}
		init := p.Initializer()
		if ast.IsStringLiteral(init) {
			rec.Set(key, ojsonString(init.Text()))
			continue
		}
		if !ast.IsObjectLiteralExpression(init) {
			continue
		}
		override := &ojson{obj: state.NewRecord[*ojson]()}
		for _, m := range init.Properties() {
			mk, ok := propKey(m)
			if !ok || mk == "" || !ast.IsStringLiteral(m.Initializer()) {
				continue
			}
			v := m.Initializer().Text()
			if mk == "name" {
				override.set("name", ojsonString(v))
			} else if mk == "mode" && (v == "wire" || v == "singleton") {
				override.set("mode", ojsonString(v))
			}
		}
		rec.Set(key, override)
	}
	return rec
}

func boolKeyword(n *ast.Node) (bool, bool) {
	switch n.Kind {
	case ast.KindTrueKeyword:
		return true, true
	case ast.KindFalseKeyword:
		return false, true
	}
	return false, false
}

// boolOrStringArray is `true | false | parseStringArray(...)`.
func boolOrStringArray(n *ast.Node) any {
	if b, ok := boolKeyword(n); ok {
		return b
	}
	if arr, ok := parseStringArray(n); ok {
		return arr
	}
	return nil
}

// literalOrText is a string literal's text, else the expression's source.
func literalOrText(n *ast.Node) string {
	if ast.IsStringLiteral(n) {
		return n.Text()
	}
	return tsutil.NodeText(n)
}

func (s *Context) addWireAddon(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != "wireAddon" {
		return
	}
	args := node.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return
	}
	var (
		name, pkg                                    string
		rpcEndpoint, contentBucket                   *string
		globalSecrets, globalCredentials, globalCont *string
		tags, scopes, secretGrants, credentialGrants any
		uses, secretOv, variableOv, contentGrants    *state.Record[string]
		credentialOv                                 *state.Record[*ojson]
	)
	decl := &addonDecl{}
	strp := func(v string) *string { return &v }
	arrOrNil := func(n *ast.Node) any {
		if arr, ok := parseStringArray(n); ok {
			return arr
		}
		return nil
	}
	for _, p := range args[0].Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		init := p.Initializer()
		_, isBool := boolKeyword(init)
		switch key := p.Name().Text(); {
		case key == "name" && ast.IsStringLiteral(init):
			name = init.Text()
		case key == "package" && ast.IsStringLiteral(init):
			pkg = init.Text()
		case key == "rpcEndpoint" && ast.IsStringLiteral(init):
			rpcEndpoint = strp(init.Text())
		case key == "mcp":
			decl.mcp = boolOrStringArray(init)
		case key == "expose":
			decl.expose = boolOrStringArray(init)
			if decl.expose == nil {
				s.Log.Critical(diag.AddonExposeNotStatic, "wireAddon's expose must be true, false or an array of string literals, got: "+tsutil.NodeText(init))
			}
		case key == "mcpEndpoint":
			if ast.IsStringLiteral(init) {
				decl.mcpEndpoint = init.Text()
			} else if b, ok := boolKeyword(init); ok {
				decl.mcpEndpoint = b
			}
		case key == "auth" && isBool:
			b, _ := boolKeyword(init)
			decl.auth = &b
		case key == "ui" && isBool:
			decl.ui, _ = boolKeyword(init)
		case key == "tags":
			tags = arrOrNil(init)
		case key == "scopes":
			scopes = arrOrNil(init)
			decl.scopes, _ = parseStringArray(init)
		case key == "uses":
			if ast.IsObjectLiteralExpression(init) {
				uses = parseStringRecord(init)
			} else {
				s.Log.Critical(diag.AddonExposeNotStatic, "wireAddon's uses must be an object literal, got: "+tsutil.NodeText(init))
			}
		case key == "secretOverrides" && ast.IsObjectLiteralExpression(init):
			secretOv = parseStringRecord(init)
		case key == "variableOverrides" && ast.IsObjectLiteralExpression(init):
			variableOv = parseStringRecord(init)
		case key == "credentialOverrides" && ast.IsObjectLiteralExpression(init):
			credentialOv = parseCredentialOverrideRecord(init)
		case key == "secretGrants":
			secretGrants = arrOrNil(init)
		case key == "credentialGrants":
			credentialGrants = arrOrNil(init)
		case key == "globalSecrets":
			globalSecrets = strp(literalOrText(init))
		case key == "globalCredentials":
			globalCredentials = strp(literalOrText(init))
		case key == "contentBucket" && ast.IsStringLiteral(init):
			contentBucket = strp(init.Text())
		case key == "contentGrants" && ast.IsObjectLiteralExpression(init):
			contentGrants = parseStringRecord(init)
		case key == "globalContent":
			globalCont = strp(literalOrText(init))
		}
	}
	if name == "" || pkg == "" {
		return
	}
	file := ast.GetSourceFileOfNode(node).FileName()
	s.Log.Debugf("• Found wireAddon: %s → %s", name, pkg)

	decl.pkg, decl.file, decl.uses = pkg, file, uses
	decl.overrides = map[string]*state.Record[*ojson]{
		"secret":     stringRecordToOJSON(secretOv),
		"variable":   stringRecordToOJSON(variableOv),
		"credential": credentialOv,
	}

	var o jsObject
	o.set("package", pkg)
	if decl.ui {
		o.set("ui", true)
	}
	o.set("file", file)
	o.set("rpcEndpoint", nilIfNil(rpcEndpoint))
	o.set("mcp", decl.mcp)
	o.set("mcpEndpoint", decl.mcpEndpoint)
	o.set("expose", decl.expose)
	o.set("auth", nilIfNil(decl.auth))
	o.set("tags", tags)
	o.set("scopes", scopes)
	o.set("uses", nilIfNil(uses))
	o.set("secretOverrides", nilIfNil(secretOv))
	o.set("variableOverrides", nilIfNil(variableOv))
	o.set("credentialOverrides", nilIfNil(credentialOv))
	o.set("secretGrants", secretGrants)
	o.set("credentialGrants", credentialGrants)
	o.set("globalSecrets", nilIfNil(globalSecrets))
	o.set("globalCredentials", nilIfNil(globalCredentials))
	o.set("contentBucket", nilIfNil(contentBucket))
	o.set("contentGrants", nilIfNil(contentGrants))
	o.set("globalContent", nilIfNil(globalCont))
	s.declareAddon(name, decl, o.raw())
}

// declareAddon is `wireAddonDeclarations.set(name, …)` plus the usedAddons
// and wireAddonFiles bookkeeping both addon wirings do.
func (s *Context) declareAddon(name string, decl *addonDecl, raw state.Raw) {
	if _, ok := s.addons[name]; !ok {
		s.addonOrder = append(s.addonOrder, name)
	}
	s.addons[name] = decl
	s.State.RPC.WireAddonDeclarations.Set(name, raw)
	s.State.RPC.UsedAddons.Add(name)
	s.State.RPC.WireAddonFiles.Add(decl.file)
}

// nilIfNil turns a typed nil pointer into an untyped nil, so jsObject.set
// drops it as JSON.stringify drops undefined.
func nilIfNil[T any](p *T) any {
	if p == nil {
		return nil
	}
	return p
}
