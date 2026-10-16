package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"
)

// Stand-in for the addHTTPMiddleware half of add-middleware.ts: only the
// route patterns the HTTP group reads back.

func init() {
	Register(Visitor{Name: "addHTTPMiddleware (stand-in)", Phase: PhaseSetup, Order: OrderAddWireAddon + 1, Visit: (*Context).visitHTTPMiddlewareStandin})
}

func (s *Context) visitHTTPMiddlewareStandin(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != "addHTTPMiddleware" {
		return
	}
	args := node.Arguments()
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
