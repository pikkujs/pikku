package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"
)

func init() {
	Register(Visitor{Name: "addMiddleware (stand-in)", Phase: PhaseSetup, Order: OrderAddMiddleware, Visit: (*Context).visitMiddlewareStandin})
	Register(Visitor{Name: "addPermission (stand-in)", Phase: PhaseSetup, Order: OrderAddPermission, Visit: (*Context).visitPermissionStandin})
}

// The stand-ins record only what addFunctions and the HTTP/queue groups read
// back — which middleware/permissions are defined (to answer `inline`) and which
// tags have tag middleware — plus the http.files entries and argument
// diagnostics of addGlobalMiddleware / addHTTPMiddleware. Port add-middleware.ts / add-permission.ts to
// replace them.

func (s *Context) visitMiddlewareStandin(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	args := node.Arguments()
	switch node.Expression().Text() {
	case "pikkuMiddleware", "pikkuMiddlewareFactory":
		r := s.extractFunctionName(node)
		s.middlewareDefs[r.pikkuFuncId] = definition{exported: r.exportedName != ""}
	case "addGlobalMiddleware":
		if len(args) == 0 || !ast.IsArrayLiteralExpression(args[0]) {
			s.Log.Error("• addGlobalMiddleware(...) must have a literal array as its only argument")
			return
		}
		s.State.HTTP.Files.Add(ast.GetSourceFileOfNode(node).FileName())
	case "addHTTPMiddleware":
		if len(args) < 2 {
			return
		}
		if !ast.IsStringLiteral(args[0]) || args[0].Text() == "" {
			s.Log.Warn("• addHTTPMiddleware call without valid pattern string")
			return
		}
		if !ast.IsArrayLiteralExpression(args[1]) {
			s.Log.Error("• addHTTPMiddleware('" + args[0].Text() + "', ...) must have a literal array as second argument")
			return
		}
		s.State.HTTP.Files.Add(ast.GetSourceFileOfNode(node).FileName())
	case "addTagMiddleware":
		if len(args) >= 2 && ast.IsStringLiteral(args[0]) && ast.IsArrayLiteralExpression(args[1]) {
			s.tagMiddleware[args[0].Text()] = true
		}
	}
}

func (s *Context) visitPermissionStandin(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	switch node.Expression().Text() {
	case "pikkuPermission", "pikkuPermissionFactory":
		r := s.extractFunctionName(node)
		s.permissionDefs[r.pikkuFuncId] = definition{exported: r.exportedName != ""}
	}
}
