package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"
)

// resolve-callee-name.ts: a helper is identified by what its callee resolves
// to, not by how it is spelled, so `import { addTagMiddleware as guard }` and
// `mw.addTagMiddleware(...)` are seen for what they are.

const maxCalleeDepth = 8

var middlewareHelpers = setOf(
	"pikkuMiddleware",
	"pikkuMiddlewareFactory",
	"addTagMiddleware",
	"addGlobalMiddleware",
	"addHTTPMiddleware",
	"pikkuChannelMiddleware",
	"pikkuChannelMiddlewareFactory",
	"pikkuAgentMiddleware",
	"addChannelMiddleware",
)

var permissionHelpers = setOf("pikkuPermission", "pikkuAuth", "pikkuPermissionFactory")

func setOf(names ...string) func(string) bool {
	set := make(map[string]bool, len(names))
	for _, n := range names {
		set[n] = true
	}
	return func(name string) bool { return set[name] }
}

func unwrapExpression(n *ast.Node) *ast.Node {
	for n != nil && (ast.IsParenthesizedExpression(n) || ast.IsAsExpression(n) ||
		ast.IsSatisfiesExpression(n) || ast.IsNonNullExpression(n) || ast.IsTypeAssertion(n)) {
		n = n.Expression()
	}
	return n
}

// isNamespaceReceiver is true for `mw` in `mw.addTagMiddleware`, when `mw` is
// a namespace import or otherwise names a module.
func (s *Context) isNamespaceReceiver(receiver *ast.Node) bool {
	if receiver == nil || !ast.IsIdentifier(receiver) {
		return false
	}
	sym := s.Checker.GetSymbolAtLocation(receiver)
	if sym == nil {
		return false
	}
	for _, d := range sym.Declarations {
		if ast.IsNamespaceImport(d) {
			return true
		}
	}
	return s.resolveAlias(sym).Flags&ast.SymbolFlagsValueModule != 0
}

func (s *Context) followCalleeSymbol(sym *ast.Symbol, names []string, depth int) []string {
	if sym == nil || depth > maxCalleeDepth {
		return names
	}
	target := sym
	if sym.Flags&ast.SymbolFlagsAlias != 0 {
		if len(sym.Declarations) > 0 {
			if d := sym.Declarations[0]; ast.IsImportSpecifier(d) || ast.IsExportSpecifier(d) {
				names = append(names, d.PropertyNameOrName().Text())
			}
		}
		target = s.Checker.GetAliasedSymbol(sym)
		// An import from a module the program cannot resolve: the specifier's
		// own exported name is the only identity there is.
		if target == nil || len(target.Declarations) == 0 {
			return names
		}
		names = append(names, target.Name)
	}
	if d := target.ValueDeclaration; d != nil && ast.IsVariableDeclaration(d) && d.Initializer() != nil &&
		ast.GetCombinedNodeFlags(d)&ast.NodeFlagsConst != 0 {
		names = s.collectCalleeNames(d.Initializer(), names, depth+1)
	}
	return names
}

func (s *Context) collectCalleeNames(expression *ast.Node, names []string, depth int) []string {
	callee := unwrapExpression(expression)
	switch {
	case callee == nil:
	case ast.IsIdentifier(callee):
		names = append(names, callee.Text())
		names = s.followCalleeSymbol(s.Checker.GetSymbolAtLocation(callee), names, depth)
	case ast.IsPropertyAccessExpression(callee) && s.isNamespaceReceiver(unwrapExpression(callee.Expression())):
		name := callee.Name()
		names = append(names, name.Text())
		names = s.followCalleeSymbol(s.Checker.GetSymbolAtLocation(name), names, depth)
	}
	return names
}

// calleeNames is every name a callee answers to, from its spelling at the call
// site to the declaration it resolves to.
func (s *Context) calleeNames(expression *ast.Node) []string {
	return s.collectCalleeNames(expression, nil, 0)
}

func isInsideDeclarationOf(node *ast.Node, isKnown func(string) bool) bool {
	for cur := node.Parent; cur != nil; cur = cur.Parent {
		if (ast.IsVariableDeclaration(cur) || ast.IsFunctionDeclaration(cur)) &&
			cur.Name() != nil && ast.IsIdentifier(cur.Name()) && isKnown(cur.Name().Text()) {
			return true
		}
	}
	return false
}

// resolveCalleeName is the pikku helper a call invokes, or "". The deepest
// known name wins, because it is the declaration's own. A call inside the body
// of a helper's own declaration (the generated `#pikku` wrappers forwarding to
// `@pikku/core`) keeps the meaning its literal spelling gives it.
func (s *Context) resolveCalleeName(call *ast.Node, isKnown func(string) bool) string {
	if call == nil || !ast.IsCallExpression(call) {
		return ""
	}
	names := s.calleeNames(call.Expression())
	resolved := ""
	for i := len(names) - 1; i >= 0; i-- {
		if isKnown(names[i]) {
			resolved = names[i]
			break
		}
	}
	if resolved == "" {
		return ""
	}
	spelled := ""
	if ast.IsIdentifier(call.Expression()) {
		spelled = call.Expression().Text()
	}
	if resolved != spelled && isInsideDeclarationOf(call, isKnown) {
		if spelled != "" && isKnown(spelled) {
			return spelled
		}
		return ""
	}
	return resolved
}

func isBetterAuth(name string) bool      { return name == "betterAuth" }
func isPikkuBetterAuth(name string) bool { return name == "pikkuBetterAuth" }
func isPikkuFunc(name string) bool       { return name == "pikkuFunc" }
