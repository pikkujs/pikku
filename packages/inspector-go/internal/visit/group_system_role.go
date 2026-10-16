package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-system-role.ts.

func init() {
	Register(Visitor{Name: "addSystemRole", Phase: PhaseRoutes, Order: OrderAddSystemRole, Visit: (*Context).addSystemRole})
}

// literalNamedProperty finds a property assignment whose identifier or
// string-literal name is `name`.
func literalNamedProperty(obj *ast.Node, name string) *ast.Node {
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		if k, ok := literalKeyName(p.Name()); ok && k == name {
			return p
		}
	}
	return nil
}

// stringLiteralList reads an array literal of (as-unwrapped) string literals,
// reporting each element that is not one with notLiteral.
func (s *Context) stringLiteralList(arr *ast.Node, notLiteral string) state.Strings {
	out := state.Strings{}
	for _, el := range arr.Elements() {
		el = tsutil.UnwrapAs(el)
		if !ast.IsStringLiteral(el) {
			s.Log.Critical(diag.InvalidValue, notLiteral)
			continue
		}
		out = append(out, el.Text())
	}
	return out
}

func (s *Context) extractRoleScopes(obj *ast.Node, roleName string) (state.Strings, bool) {
	prop := literalNamedProperty(obj, "scopes")
	if prop == nil {
		s.Log.Critical(diag.InvalidValue, "System role '"+roleName+"' has no 'scopes'. A role that grants nothing should say so with 'scopes: []'.")
		return nil, false
	}
	if !ast.IsArrayLiteralExpression(prop.Initializer()) {
		s.Log.Critical(diag.InvalidValue, "System role '"+roleName+"' must declare 'scopes' as an array literal.")
		return nil, false
	}
	return s.stringLiteralList(prop.Initializer(), "System role '"+roleName+"' lists a scope that is not a string literal. "+
		"Scopes are extracted by AST, so a computed value cannot be checked against the declared set."), true
}

func (s *Context) addSystemRole(node *ast.Node) {
	if !ast.IsCallExpression(node) {
		return
	}
	expr := node.Expression()
	if !ast.IsIdentifier(expr) || expr.Text() != "defineSystemRole" {
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

	for _, prop := range obj.Properties() {
		if !ast.IsPropertyAssignment(prop) {
			continue
		}
		name, ok := literalKeyName(prop.Name())
		switch {
		case !ok:
			s.Log.Critical(diag.NonLiteralWireName, "A system role is declared with a key that is not a literal.")
			continue
		case name == "":
			s.Log.Critical(diag.InvalidValue, "A system role is declared with an empty name.")
			continue
		case strings.Contains(name, scopeSeparator):
			s.Log.Critical(diag.InvalidValue, "System role '"+name+"' contains the '"+scopeSeparator+"' separator. "+
				"'"+scopeSeparator+"' delimits scope ids; a role named like a scope reads as one.")
			continue
		}
		body := prop.Initializer()
		if !ast.IsObjectLiteralExpression(body) {
			s.Log.Critical(diag.InvalidValue, "System role '"+name+"' must be an object literal.")
			continue
		}
		scopes, ok := s.extractRoleScopes(body, name)
		if !ok {
			continue
		}
		displayName := tsutil.GetPropertyValue(body, "displayName")
		description := tsutil.GetPropertyValue(body, "description")

		s.State.SystemRoles.Files.Add(sourceFile)
		var o jsObject
		o.set("name", name)
		o.set("displayName", orUndefined(displayName))
		o.set("description", orUndefined(description))
		o.set("scopes", scopes)
		o.set("sourceFile", sourceFile)
		s.State.SystemRoles.Definitions = append(s.State.SystemRoles.Definitions, o.raw())
	}
}
