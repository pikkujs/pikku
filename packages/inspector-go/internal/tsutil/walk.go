package tsutil

import (
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

func CollectInvokedRpcNames(body *ast.Node) []string {
	names := map[string]bool{}
	WalkSelf(body, func(n *ast.Node) {
		if !ast.IsCallExpression(n) || !ast.IsPropertyAccessExpression(n.Expression()) {
			return
		}
		pa := n.Expression()
		m := pa.Name().Text()
		if (m == "invoke" || m == "remote") && IsRpcExpr(pa.Expression()) {
			if args := n.Arguments(); len(args) > 0 && (ast.IsStringLiteral(args[0]) || ast.IsNoSubstitutionTemplateLiteral(args[0])) {
				names[args[0].Text()] = true
			}
		}
	})
	return SortedKeys(names)
}

func CollectStartedWorkflows(body *ast.Node) []string {
	names := map[string]bool{}
	WalkSelf(body, func(n *ast.Node) {
		if !ast.IsCallExpression(n) {
			return
		}
		callee := n.Expression()
		if ast.IsPropertyAccessExpression(callee) && IsRpcExpr(callee.Expression()) && callee.Name().Text() == "startWorkflow" {
			if args := n.Arguments(); len(args) > 0 && (ast.IsStringLiteral(args[0]) || ast.IsNoSubstitutionTemplateLiteral(args[0])) {
				names[args[0].Text()] = true
			}
		}
	})
	return SortedKeys(names)
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
