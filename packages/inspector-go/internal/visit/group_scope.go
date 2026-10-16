package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-scope.ts. applyDeclaredScopes runs in finalize.

const (
	scopeSeparator = ":"
	scopeWildcard  = "*"
)

func init() {
	Register(Visitor{Name: "addScope", Phase: PhaseRoutes, Order: OrderAddScope, Visit: (*Context).addScope})
}

// literalKeyName is the text of an identifier or string-literal property name.
func literalKeyName(name *ast.Node) (string, bool) {
	if name != nil && (ast.IsIdentifier(name) || ast.IsStringLiteral(name)) {
		return name.Text(), true
	}
	return "", false
}

// scopesObject is the object-literal initializer of an identifier-named
// `scopes` property assignment.
func scopesObject(obj *ast.Node) *ast.Node {
	if p := tsutil.FindPropertyAssignment(obj, "scopes"); p != nil && ast.IsObjectLiteralExpression(p.Initializer()) {
		return p.Initializer()
	}
	return nil
}

func (s *Context) isValidScopeSegment(segment, scopeName string) bool {
	switch {
	case segment == "":
		s.Log.Critical(diag.InvalidValue, "Scope '"+scopeName+"' contains an empty segment.")
		return false
	case strings.Contains(segment, scopeSeparator):
		s.Log.Critical(diag.InvalidValue, "Scope segment '"+segment+"' in '"+scopeName+"' contains the '"+scopeSeparator+"' separator. "+
			"Nest scopes with the 'scopes' property instead of embedding '"+scopeSeparator+"' in a name.")
		return false
	case segment == scopeWildcard:
		s.Log.Critical(diag.InvalidValue, "Scope segment '"+segment+"' in '"+scopeName+"' is the wildcard. "+
			"'"+scopeWildcard+"' is reserved for granting a scope and its descendants, and cannot be declared.")
		return false
	}
	return true
}

// extractScopeNodes returns nil when no node was extracted.
func (s *Context) extractScopeNodes(obj *ast.Node, scopeName string) *state.Record[state.Raw] {
	nodes := state.NewRecord[state.Raw]()
	for _, prop := range obj.Properties() {
		if !ast.IsPropertyAssignment(prop) {
			continue
		}
		segment, ok := literalKeyName(prop.Name())
		if !ok {
			s.Log.Critical(diag.NonLiteralWireName, "Scope '"+scopeName+"' has a nested scope whose key is not a literal.")
			continue
		}
		if !s.isValidScopeSegment(segment, scopeName) {
			continue
		}
		init := prop.Initializer()
		if !ast.IsObjectLiteralExpression(init) {
			s.Log.Critical(diag.InvalidValue, "Nested scope '"+segment+"' in '"+scopeName+"' must be an object literal.")
			continue
		}
		var node jsObject
		node.set("displayName", orUndefined(tsutil.GetPropertyValue(init, "displayName")))
		node.set("description", orUndefined(tsutil.GetPropertyValue(init, "description")))
		if nested := scopesObject(init); nested != nil {
			if n := s.extractScopeNodes(nested, scopeName); n != nil {
				node.set("scopes", n)
			}
		}
		nodes.Set(segment, node.raw())
	}
	if nodes.Len() == 0 {
		return nil
	}
	return nodes
}

func (s *Context) addDeclareScopes(node *ast.Node) {
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	arg := tsutil.UnwrapAs(args[0])
	if !ast.IsArrayLiteralExpression(arg) {
		return
	}
	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	sc := &s.State.Scopes
	for _, el := range arg.Elements() {
		if !ast.IsStringLiteralLike(el) {
			s.Log.Critical(diag.NonLiteralWireName, "declareScopes takes string literal scope ids.")
			continue
		}
		id := el.Text()
		valid := true
		for _, seg := range strings.Split(id, scopeSeparator) {
			if !s.isValidScopeSegment(seg, id) {
				valid = false
				break
			}
		}
		if !valid {
			continue
		}
		if sc.Declared == nil {
			sc.Declared = state.NewMap[string]()
		}
		if !sc.Declared.Has(id) {
			sc.Declared.Set(id, sourceFile)
		}
	}
	sc.Files.Add(sourceFile)
}

func (s *Context) addScope(node *ast.Node) {
	if !ast.IsCallExpression(node) {
		return
	}
	expr := node.Expression()
	if !ast.IsIdentifier(expr) {
		return
	}
	switch expr.Text() {
	case "declareScopes":
		s.addDeclareScopes(node)
		return
	case "defineScope":
	default:
		return
	}
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	obj := tsutil.UnwrapAs(args[0])
	if !ast.IsObjectLiteralExpression(obj) {
		return
	}

	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	origin := state.Raw(`{"kind":"app"}`)
	if strings.HasSuffix(sourceFile, ".gen.ts") {
		origin = state.Raw(`{"kind":"generated"}`)
	}

	for _, prop := range obj.Properties() {
		if !ast.IsPropertyAssignment(prop) {
			continue
		}
		name, ok := literalKeyName(prop.Name())
		if !ok {
			s.Log.Critical(diag.NonLiteralWireName, "A scope is declared with a key that is not a literal.")
			continue
		}
		if !s.isValidScopeSegment(name, name) {
			continue
		}
		root := prop.Initializer()
		if !ast.IsObjectLiteralExpression(root) {
			s.Log.Critical(diag.InvalidValue, "Scope '"+name+"' must be an object literal.")
			continue
		}
		displayName := tsutil.GetPropertyValue(root, "displayName")
		description := tsutil.GetPropertyValue(root, "description")
		var scopes *state.Record[state.Raw]
		if nested := scopesObject(root); nested != nil {
			scopes = s.extractScopeNodes(nested, name)
		}

		s.State.Scopes.Files.Add(sourceFile)
		var o jsObject
		o.set("name", name)
		o.set("displayName", orUndefined(displayName))
		o.set("description", orUndefined(description))
		if scopes != nil {
			o.set("scopes", scopes)
		}
		o.set("sourceFile", sourceFile)
		o.set("origin", origin)
		s.State.Scopes.Definitions = append(s.State.Scopes.Definitions, o.raw())
	}
}
