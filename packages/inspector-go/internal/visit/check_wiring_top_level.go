package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
)

func init() {
	Register(Visitor{Name: "checkWiringsTopLevel", Phase: PhaseSetup, Order: OrderCheckWiringsTopLevel, Visit: (*Context).checkWiringsTopLevel})
}

// topLevelWirings are the Pikku calls that declare a wiring for the build to
// read; none of them does anything when it is called from inside a function.
var topLevelWirings = []string{
	"wireAddon", "wireRemoteAddon", "wireContributors", "wireChannel", "wireCLI",
	"wireGateway", "wireHTTP", "wireHTTPRoutes", "wireMCPPrompt", "wireMCPResource",
	"wireQueueWorker", "wireScheduler", "wireTrigger", "wireTriggerSource",
}

func isFunctionBoundary(n *ast.Node) bool {
	return ast.IsArrowFunction(n) || ast.IsFunctionExpression(n) || ast.IsFunctionDeclaration(n) ||
		ast.IsMethodDeclaration(n) || ast.IsConstructorDeclaration(n) ||
		ast.IsGetAccessorDeclaration(n) || ast.IsSetAccessorDeclaration(n)
}

// enclosingFunction is the nearest function-like ancestor of a node.
func enclosingFunction(node *ast.Node) *ast.Node {
	for cur := node.Parent; cur != nil; cur = cur.Parent {
		if isFunctionBoundary(cur) {
			return cur
		}
	}
	return nil
}

func functionLabel(fn *ast.Node) string {
	if name := fn.Name(); name != nil && (ast.IsIdentifier(name) || ast.IsStringLiteral(name)) {
		return name.Text()
	}
	if p := fn.Parent; p != nil && (ast.IsVariableDeclaration(p) || ast.IsPropertyAssignment(p)) {
		if name := p.Name(); name != nil && ast.IsIdentifier(name) {
			return name.Text()
		}
	}
	return "an anonymous function"
}

func (s *Context) checkWiringsTopLevel(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	fn := enclosingFunction(node)
	if fn == nil {
		return
	}
	for _, name := range topLevelWirings {
		if s.callsImportedDefiner(node.Expression(), name) {
			s.Log.Critical(diag.WiringNotTopLevel, fmt.Sprintf(
				"%s must be called at the top level of a file, not inside a function (inside %s, %s)",
				name, functionLabel(fn), s.nodePosition(fn)))
			return
		}
	}
}
