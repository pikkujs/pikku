package tsutil

import (
	"slices"
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
)

func WalkSelf(n *ast.Node, visit func(*ast.Node)) {
	visit(n)
	Walk(n, visit)
}

func SortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// InvokedRpcs is collectInvokedRpcNames: the names a handler passes as a
// literal to rpc.invoke / rpc.mesh, and the source text of the calls whose
// name is computed.
type InvokedRpcs struct {
	Names   []string
	Dynamic []string
}

func CollectInvokedRpcNames(body *ast.Node) InvokedRpcs {
	names := map[string]bool{}
	var dynamic []string
	WalkSelf(body, func(n *ast.Node) {
		if !ast.IsCallExpression(n) || !ast.IsPropertyAccessExpression(n.Expression()) {
			return
		}
		pa := n.Expression()
		m := pa.Name().Text()
		if (m == "invoke" || m == "mesh") && IsRpcExpr(pa.Expression()) {
			if args := n.Arguments(); len(args) > 0 {
				if isLiteralName(args[0]) {
					names[args[0].Text()] = true
				} else {
					dynamic = append(dynamic, NodeText(n))
				}
			}
		}
	})
	return InvokedRpcs{Names: SortedKeys(names), Dynamic: dynamic}
}

// StartedWorkflows is collectStartedWorkflows: literal rpc.startWorkflow
// names, the source text of the calls whose name is computed, and the plain
// functions the handler hands rpc to, whose calls go unseen.
type StartedWorkflows struct {
	Names       []string
	Dynamic     []string
	RpcHandoffs []string
}

func CollectStartedWorkflows(body *ast.Node) StartedWorkflows {
	names := map[string]bool{}
	handoffs := map[string]bool{}
	var dynamic []string
	WalkSelf(body, func(n *ast.Node) {
		if !ast.IsCallExpression(n) {
			return
		}
		callee := n.Expression()
		args := n.Arguments()
		if ast.IsPropertyAccessExpression(callee) && IsRpcExpr(callee.Expression()) && callee.Name().Text() == "startWorkflow" {
			if len(args) > 0 {
				if isLiteralName(args[0]) {
					names[args[0].Text()] = true
				} else {
					dynamic = append(dynamic, NodeText(n))
				}
			}
		} else if ast.IsIdentifier(callee) && slices.ContainsFunc(args, passesRpc) {
			handoffs[callee.Text()] = true
		}
	})
	return StartedWorkflows{Names: SortedKeys(names), Dynamic: dynamic, RpcHandoffs: SortedKeys(handoffs)}
}

func isLiteralName(arg *ast.Node) bool {
	return ast.IsStringLiteral(arg) || ast.IsNoSubstitutionTemplateLiteral(arg)
}

// passesRpc: `rpc`, `wire.rpc`, `{ rpc }` or `{ rpc: wire.rpc }`.
func passesRpc(arg *ast.Node) bool {
	if IsRpcExpr(arg) {
		return true
	}
	inner := UnwrapNonNullParens(arg)
	if !ast.IsObjectLiteralExpression(inner) {
		return false
	}
	return slices.ContainsFunc(inner.Properties(), func(p *ast.Node) bool {
		return (ast.IsShorthandPropertyAssignment(p) && p.Name().Text() == "rpc") ||
			(ast.IsPropertyAssignment(p) && IsRpcExpr(p.Initializer()))
	})
}

// Walk visits node's descendants in pre-order, the order recursive
// ts.forEachChild gives; node itself is not visited.
func Walk(node *ast.Node, visit func(*ast.Node)) {
	node.ForEachChild(func(child *ast.Node) bool {
		visit(child)
		Walk(child, visit)
		return false
	})
}

// Dedupe keeps the first occurrence of each string, in order.
func Dedupe(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
