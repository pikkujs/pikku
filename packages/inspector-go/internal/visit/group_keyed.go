package visit

import (
	"regexp"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// keyedWiring is add-keyed-wiring.ts KeyedWiringConfig; target is getState.
type keyedWiring struct {
	functionName, idField, label, schemaPrefix, flagField string
	target                                                func(*state.State) (*state.List[state.Raw], *state.Set)
}

var (
	secretWiring = keyedWiring{"defineSecret", "secretId", "Secret", "SecretSchema", "optional",
		func(st *state.State) (*state.List[state.Raw], *state.Set) {
			return &st.Secrets.Definitions, &st.Secrets.Files
		}}
	variableWiring = keyedWiring{"defineVariable", "variableId", "Variable", "VariableSchema", "optional",
		func(st *state.State) (*state.List[state.Raw], *state.Set) {
			return &st.Variables.Definitions, &st.Variables.Files
		}}
)

func init() {
	Register(Visitor{Name: "addSecret", Phase: PhaseRoutes, Order: OrderAddSecret,
		Visit: func(s *Context, n *ast.Node) { s.visitKeyedWiring(n, secretWiring) }})
	Register(Visitor{Name: "addCredential", Phase: PhaseRoutes, Order: OrderAddCredential, Visit: (*Context).visitCredential})
	Register(Visitor{Name: "addVariable", Phase: PhaseRoutes, Order: OrderAddVariable,
		Visit: func(s *Context, n *ast.Node) { s.visitKeyedWiring(n, variableWiring) }})
}

// definitionCall returns the object-literal first argument of `fnName({...})`.
func definitionCall(node *ast.Node, fnName string) *ast.Node {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != fnName {
		return nil
	}
	args := node.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return nil
	}
	return args[0]
}

// jsObject builds a JSON object in insertion order, dropping undefined
// (nil) values as JSON.stringify does.
type jsObject struct{ rec state.Record[state.Raw] }

func (o *jsObject) set(k string, v any) {
	if v == nil {
		return
	}
	o.rec.Set(k, state.Raw(jsjson.MustMarshal(v)))
}

func (o *jsObject) raw() state.Raw { return state.Raw(jsjson.MustMarshal(&o.rec)) }

// orUndefined is `value || undefined` for a string-valued property.
func orUndefined(v tsutil.PropValue) any {
	if !v.Truthy() {
		return nil
	}
	if v.Str != nil {
		return *v.Str
	}
	if v.Num != nil {
		return *v.Num
	}
	if v.Bool != nil {
		return *v.Bool
	}
	return v.Strs
}

// assertStringLiteralProperty is get-property-value.ts's helper.
func (s *Context) assertStringLiteralProperty(obj *ast.Node, name, wiringType string) {
	p := tsutil.FindPropertyAssignment(obj, name)
	if p == nil {
		return
	}
	init := p.Initializer()
	if ast.IsStringLiteral(init) || ast.IsNoSubstitutionTemplateLiteral(init) || ast.IsNumericLiteral(init) {
		return
	}
	s.Log.Critical(diag.NonLiteralWireName, wiringType+" has a non-literal '"+name+"': `"+tsutil.NodeText(init)+
		"`. Wiring identity fields must be inline string literals — the inspector reads them statically from source, "+
		"so a const or variable reference is keyed by its identifier text and the wiring is silently skipped at runtime. "+
		"Inline the literal instead, e.g. "+name+": 'my-wiring-name'.")
}

// schemaProperty finds `schema: <identifier>` and the file declaring it
// (through an import); file is "" when it cannot be resolved.
func (s *Context) schemaProperty(obj *ast.Node) (ident *ast.Node, file string) {
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) || p.Name().Text() != "schema" {
			continue
		}
		init := p.Initializer()
		if !ast.IsIdentifier(init) {
			return nil, ""
		}
		sym := s.Checker.GetSymbolAtLocation(init)
		if sym == nil {
			return init, ""
		}
		decl := symbolDecl(sym)
		if decl != nil && ast.IsImportSpecifier(decl) {
			decl = nil
			if aliased := s.Checker.GetAliasedSymbol(sym); aliased != nil {
				decl = symbolDecl(aliased)
			}
		}
		if decl == nil {
			return init, ""
		}
		return init, ast.GetSourceFileOfNode(decl).FileName()
	}
	return nil, ""
}

var durationRe = regexp.MustCompile(`^(\d+)(ms|milliseconds?|s|sec|seconds?|m|min|minutes?|h|hour|hours?|d|day|days?|w|week|weeks?|y|year|years?)$`)

// visitKeyedWiring ports createAddKeyedWiring.
func (s *Context) visitKeyedWiring(node *ast.Node, cfg keyedWiring) {
	obj := definitionCall(node, cfg.functionName)
	if obj == nil {
		return
	}
	s.assertStringLiteralProperty(obj, "name", cfg.label)
	s.assertStringLiteralProperty(obj, cfg.idField, cfg.label)

	name := tsutil.GetPropertyValue(obj, "name")
	displayName := tsutil.GetPropertyValue(obj, "displayName")
	description := tsutil.GetPropertyValue(obj, "description")
	rotation := tsutil.GetPropertyValue(obj, "rotationPeriod")
	docsUrl := tsutil.GetPropertyValue(obj, "docsUrl")
	allowedHosts, hasHosts := tsutil.GetArrayPropertyValue(obj, "allowedHosts")
	id := tsutil.GetPropertyValue(obj, cfg.idField)
	flag := tsutil.GetPropertyValue(obj, cfg.flagField)
	schemaIdent, schemaFile := s.schemaProperty(obj)

	nameValue := name.AsString()
	if !name.Truthy() {
		s.Log.Critical(diag.MissingName, cfg.label+" is missing the required 'name' property.")
		return
	}
	if !displayName.Truthy() {
		s.Log.Critical(diag.MissingName, cfg.label+" '"+nameValue+"' is missing the required 'displayName' property.")
		return
	}
	if !id.Truthy() {
		s.Log.Critical(diag.MissingName, cfg.label+" '"+nameValue+"' is missing the required '"+cfg.idField+"' property.")
		return
	}
	if schemaIdent == nil || schemaFile == "" {
		s.Log.Critical(diag.MissingName, cfg.label+" '"+nameValue+"' is missing the required 'schema' property or schema is not a variable reference.")
		return
	}
	if rotation.Truthy() && !durationRe.MatchString(rotation.AsString()) {
		s.Log.Critical(diag.InvalidValue, cfg.label+" '"+nameValue+"' has an invalid 'rotationPeriod': '"+rotation.AsString()+
			"'. Use a duration like '1d', '30day', or '1w'.")
		return
	}

	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	defs, files := cfg.target(s.State)
	files.Add(sourceFile)

	vendor := s.detectSchemaVendorOrError(schemaIdent, cfg.label+" '"+nameValue+"'", schemaFile)
	if vendor == "" {
		return
	}
	lookupName := cfg.schemaPrefix + "_" + nameValue
	s.State.SchemaLookup.Set(lookupName, state.SchemaRef{VariableName: schemaIdent.Text(), SourceFile: schemaFile, Vendor: vendor})

	var o jsObject
	o.set("name", orUndefined(name))
	o.set("displayName", orUndefined(displayName))
	o.set("description", orUndefined(description))
	o.set("rotationPeriod", orUndefined(rotation))
	o.set("docsUrl", orUndefined(docsUrl))
	if hasHosts {
		o.set("allowedHosts", state.Strings(allowedHosts))
	}
	o.set(cfg.idField, orUndefined(id))
	if flag.Bool != nil && *flag.Bool {
		o.set(cfg.flagField, true)
	}
	o.set("schema", lookupName)
	o.set("sourceFile", sourceFile)
	*defs = append(*defs, o.raw())
}

// visitCredential ports add-credential.ts.
func (s *Context) visitCredential(node *ast.Node) {
	obj := definitionCall(node, "defineCredential")
	if obj == nil {
		return
	}
	s.assertStringLiteralProperty(obj, "name", "Credential")
	name := tsutil.GetPropertyValue(obj, "name")
	displayName := tsutil.GetPropertyValue(obj, "displayName")
	description := tsutil.GetPropertyValue(obj, "description")
	typ := tsutil.GetPropertyValue(obj, "type")
	docsUrl := tsutil.GetPropertyValue(obj, "docsUrl")

	nameValue := name.AsString()
	if !name.Truthy() {
		s.Log.Critical(diag.MissingName, "Credential is missing the required 'name' property.")
		return
	}
	if !displayName.Truthy() {
		s.Log.Critical(diag.MissingName, "Credential '"+nameValue+"' is missing the required 'displayName' property.")
		return
	}
	if t := typ.AsString(); t != "singleton" && t != "wire" {
		s.Log.Critical(diag.MissingName, "Credential '"+nameValue+"' is missing or has invalid 'type' property. Must be 'singleton' or 'wire'.")
		return
	}
	schemaIdent, schemaFile := s.schemaProperty(obj)

	var oauth2 any
	if p := tsutil.FindPropertyAssignment(obj, "oauth2"); p != nil && ast.IsObjectLiteralExpression(p.Initializer()) {
		o2 := p.Initializer()
		appSecret := tsutil.GetPropertyValue(o2, "appCredentialSecretId")
		authURL := tsutil.GetPropertyValue(o2, "authorizationUrl")
		tokenURL := tsutil.GetPropertyValue(o2, "tokenUrl")
		scopes, hasScopes := tsutil.GetArrayPropertyValue(o2, "scopes")
		if appSecret.Truthy() && authURL.Truthy() && tokenURL.Truthy() && hasScopes {
			var o jsObject
			o.set("appCredentialSecretId", orUndefined(appSecret))
			o.set("tokenSecretId", orUndefined(tsutil.GetPropertyValue(o2, "tokenSecretId")))
			o.set("authorizationUrl", orUndefined(authURL))
			o.set("tokenUrl", orUndefined(tokenURL))
			o.set("scopes", state.Strings(scopes))
			o.set("scopeSeparator", orUndefined(tsutil.GetPropertyValue(o2, "scopeSeparator")))
			o.set("pkce", orUndefined(tsutil.GetPropertyValue(o2, "pkce")))
			if rec := recordPropertyValue(o2, "additionalParams"); rec != nil {
				o.set("additionalParams", rec)
			}
			oauth2 = o.raw()
		}
	}

	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	s.State.Credentials.Files.Add(sourceFile)

	var lookupName any
	if schemaIdent != nil && schemaFile != "" {
		if vendor := s.detectSchemaVendorOrError(schemaIdent, "Credential '"+nameValue+"'", schemaFile); vendor != "" {
			n := "CredentialSchema_" + nameValue
			s.State.SchemaLookup.Set(n, state.SchemaRef{VariableName: schemaIdent.Text(), SourceFile: schemaFile, Vendor: vendor})
			lookupName = n
		}
	}

	var o jsObject
	o.set("name", orUndefined(name))
	o.set("displayName", orUndefined(displayName))
	o.set("description", orUndefined(description))
	o.set("type", typ.AsString())
	o.set("docsUrl", orUndefined(docsUrl))
	o.set("schema", lookupName)
	o.set("oauth2", oauth2)
	o.set("sourceFile", sourceFile)
	s.State.Credentials.Definitions = append(s.State.Credentials.Definitions, o.raw())
}

// recordPropertyValue is getRecordPropertyValue: the string-valued entries
// of an object-literal property, or nil when there are none.
func recordPropertyValue(obj *ast.Node, name string) *state.Record[string] {
	p := tsutil.FindPropertyAssignment(obj, name)
	if p == nil || !ast.IsObjectLiteralExpression(p.Initializer()) {
		return nil
	}
	rec := state.NewRecord[string]()
	for _, prop := range p.Initializer().Properties() {
		if !ast.IsPropertyAssignment(prop) {
			continue
		}
		key := prop.Name()
		if !ast.IsIdentifier(key) && !ast.IsStringLiteral(key) {
			continue
		}
		if init := prop.Initializer(); ast.IsStringLiteral(init) || ast.IsNoSubstitutionTemplateLiteral(init) {
			rec.Set(key.Text(), init.Text())
		}
	}
	if rec.Len() == 0 {
		return nil
	}
	return rec
}
