package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-feature-flag.ts.

func init() {
	Register(Visitor{Name: "addFeatureFlag", Phase: PhaseRoutes, Order: OrderAddFeatureFlag, Visit: (*Context).addFeatureFlag})
}

// callsImportedDefiner is add-analytics.ts callsImportedDefiner (the same
// test add-feature-flag.ts inlines as callsDefineFeatureFlags): the callee
// resolves to an import of `definer`, whatever the file calls it locally.
func (s *Context) callsImportedDefiner(expr *ast.Node, definer string) bool {
	if !ast.IsIdentifier(expr) {
		return false
	}
	sym := s.Checker.GetSymbolAtLocation(expr)
	if sym == nil {
		return expr.Text() == definer
	}
	if decl := tsutil.FirstDecl(sym); decl != nil && ast.IsImportSpecifier(decl) {
		n := decl.PropertyName()
		if n == nil {
			n = decl.Name()
		}
		return n.Text() == definer
	}
	if sym.Flags&ast.SymbolFlagsAlias == 0 {
		return false
	}
	return tsutil.SymbolName(s.resolveAlias(sym)) == definer
}

// objectLiteralFromSymbol is add-feature-flag.ts fromSymbol.
func (s *Context) objectLiteralFromSymbol(sym *ast.Symbol) *ast.Node {
	sym = s.resolveAlias(sym)
	if sym == nil {
		return nil
	}
	for _, decl := range sym.Declarations {
		if !ast.IsVariableDeclaration(decl) || decl.Initializer() == nil {
			continue
		}
		if init := tsutil.UnwrapAs(decl.Initializer()); ast.IsObjectLiteralExpression(init) {
			return init
		}
	}
	return nil
}

// resolveFlagBody is add-feature-flag.ts resolveObjectLiteral.
func (s *Context) resolveFlagBody(prop *ast.Node) *ast.Node {
	if ast.IsShorthandPropertyAssignment(prop) {
		return s.objectLiteralFromSymbol(s.Checker.GetShorthandAssignmentValueSymbol(prop))
	}
	init := tsutil.UnwrapAs(prop.Initializer())
	if ast.IsObjectLiteralExpression(init) {
		return init
	}
	if !ast.IsIdentifier(init) {
		return nil
	}
	return s.objectLiteralFromSymbol(s.Checker.GetSymbolAtLocation(init))
}

// extractAnyOf returns ok=false when `anyOf` is absent or not an array
// literal; absent means no capability constraint.
func (s *Context) extractAnyOf(obj *ast.Node, flagName string) (state.Strings, bool) {
	prop := literalNamedProperty(obj, "anyOf")
	if prop == nil {
		return nil, false
	}
	if !ast.IsArrayLiteralExpression(prop.Initializer()) {
		s.Log.Critical(diag.InvalidValue, "Feature flag '"+flagName+"' must declare 'anyOf' as an array literal.")
		return nil, false
	}
	return s.stringLiteralList(prop.Initializer(), "Feature flag '"+flagName+"' lists a scope that is not a string literal. "+
		"Scopes are extracted by AST, so a computed value cannot be checked against the declared set."), true
}

func (s *Context) addFeatureFlag(node *ast.Node) {
	if !ast.IsCallExpression(node) || !s.callsImportedDefiner(node.Expression(), "defineFeatureFlags") {
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
		if !ast.IsShorthandPropertyAssignment(prop) && !ast.IsPropertyAssignment(prop) {
			continue
		}
		name, ok := literalKeyName(prop.Name())
		switch {
		case !ok:
			s.Log.Critical(diag.NonLiteralWireName, "A feature flag is declared with a key that is not a literal.")
			continue
		case name == "":
			s.Log.Critical(diag.InvalidValue, "A feature flag is declared with an empty name.")
			continue
		case strings.Contains(name, scopeSeparator):
			s.Log.Critical(diag.InvalidValue, "Feature flag '"+name+"' contains the '"+scopeSeparator+"' separator. "+
				"'"+scopeSeparator+"' delimits scope ids; a flag named like a scope reads as one.")
			continue
		}
		body := s.resolveFlagBody(prop)
		if body == nil {
			s.Log.Critical(diag.InvalidValue, "Feature flag '"+name+"' must be an object literal, or a variable holding one. "+
				"'anyOf' is extracted by AST, so a value this file cannot see would declare the flag with no capability constraint.")
			continue
		}
		anyOf, hasAnyOf := s.extractAnyOf(body, name)
		if hasAnyOf && len(anyOf) == 0 {
			s.Log.Critical(diag.InvalidValue, "Feature flag '"+name+"' declares 'anyOf: []'. An empty list satisfies "+
				"nobody: omit 'anyOf' for a pure switch, or name the scopes that reveal it.")
			continue
		}
		description := tsutil.GetPropertyValue(body, "description")

		s.State.FeatureFlags.Files.Add(sourceFile)
		var o jsObject
		o.set("name", name)
		o.set("description", orUndefined(description))
		if hasAnyOf {
			o.set("anyOf", anyOf)
		}
		o.set("sourceFile", sourceFile)
		s.State.FeatureFlags.Definitions = append(s.State.FeatureFlags.Definitions, o.raw())
	}
}
