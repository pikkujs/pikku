package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

func init() {
	Register(Visitor{Name: "addRPCInvocations", Phase: PhaseSetup, Order: OrderAddRPCInvocations, Visit: (*Context).visitRPCInvocations})
}

// visitRPCInvocations ports add/add-rpc-invocations.ts addRPCInvocations.
func (s *Context) visitRPCInvocations(node *ast.Node) {
	if !ast.IsCallExpression(node) {
		return
	}
	expr := node.Expression()
	args := node.Arguments()
	var first *ast.Node
	if len(args) > 0 {
		first = args[0]
	}
	st := s.State

	if ast.IsIdentifier(expr) {
		switch expr.Text() {
		case "ref":
			if first != nil && ast.IsStringLiteral(first) {
				ref := first.Text()
				st.RPC.InvokedFunctions.Add(ref)
				if ns, ok := rpcNamespace(ref); ok {
					st.RPC.UsedAddons.Add(ns)
				}
			}
		case "workflow", "workflowStart", "workflowRun", "workflowStatus", "graphStart":
			if first != nil && ast.IsStringLiteral(first) {
				st.Workflows.InvokedWorkflows.Add(first.Text())
			}
		}
	}

	// rpc.startWorkflow('...'), workflowService.startWorkflow('...') and
	// workflowService.runToCompletion('...') start a workflow by name.
	if ast.IsPropertyAccessExpression(expr) {
		switch expr.Name().Text() {
		case "startWorkflow", "runToCompletion":
			if first != nil && (ast.IsStringLiteral(first) || ast.IsNoSubstitutionTemplateLiteral(first)) {
				st.Workflows.InvokedWorkflows.Add(first.Text())
			}
		}
	}

	if isAgentInvocation(expr) {
		if first != nil && ast.IsStringLiteral(first) {
			file := ast.GetSourceFileOfNode(node).FileName()
			addToFileSet(&st.Agents.InvokedAgentsByFile, file, first.Text())
		} else if first != nil && (ast.IsTemplateExpression(first) || ast.IsNoSubstitutionTemplateLiteral(first)) {
			s.Log.Warn("• Found dynamic agent invocation: " + tsutil.NodeText(first))
			s.Log.Warn("\tYou can only use string literals for agent names, with ' or \" and not `")
		}
	}

	if !ast.IsPropertyAccessExpression(expr) || expr.Name().Text() != "invoke" {
		return
	}
	recv := tsutil.UnwrapNonNullParens(expr.Expression())
	if !ast.IsIdentifier(recv) || recv.Text() != "rpc" {
		return
	}
	file := ast.GetSourceFileOfNode(node).FileName()
	if !strings.HasSuffix(file, ".gen.ts") && !strings.HasSuffix(file, ".gen.js") {
		if hasTypeCast(outerParent(node)) {
			s.Log.Critical(diag.RpcInvocationTypeCast, "rpc.invoke() result is type-cast — remove the 'as' expression and rely on Pikku's generated types")
		}
		for _, a := range args {
			if hasTypeCast(a) {
				s.Log.Critical(diag.RpcInvocationTypeCast, "rpc.invoke() has a type cast on an argument — remove the 'as' expression and rely on Pikku's generated types")
				break
			}
		}
	}
	if first == nil {
		return
	}
	if ast.IsStringLiteral(first) || ast.IsNoSubstitutionTemplateLiteral(first) {
		ref := first.Text()
		st.RPC.InvokedFunctions.Add(ref)
		addToFileSet(&st.RPC.InvokedFunctionsByFile, file, ref)
		if ns, ok := rpcNamespace(ref); ok {
			st.RPC.UsedAddons.Add(ns)
			st.ServiceAggregation.UsedFunctions.Add(ref)
		}
	} else if ast.IsTemplateExpression(first) {
		s.Log.Warn("• Found dynamic RPC invocation: " + tsutil.NodeText(first))
		s.Log.Warn("\tYou can only use literal RPC function names, without ${...} substitutions")
	}
}

func addToFileSet(m *state.Map[*state.Set], file, v string) {
	set, ok := m.Get(file)
	if !ok {
		set = state.NewSet()
		m.Set(file, set)
	}
	set.Add(v)
}

func rpcNamespace(ref string) (string, bool) {
	if i := strings.IndexByte(ref, ':'); i >= 0 {
		return ref[:i], true
	}
	return "", false
}

func hasTypeCast(n *ast.Node) bool {
	return n != nil && (ast.IsAsExpression(n) || n.Kind == ast.KindTypeAssertionExpression)
}

func outerParent(n *ast.Node) *ast.Node {
	p := n.Parent
	for p != nil && (ast.IsAwaitExpression(p) || ast.IsParenthesizedExpression(p)) {
		p = p.Parent
	}
	return p
}

// isAgentInvocation is agentInvocationName != null: runAgent / streamAgent,
// or rpc.agent.run / rpc.agent.stream through `!` and parentheses.
func isAgentInvocation(expr *ast.Node) bool {
	if ast.IsIdentifier(expr) {
		return expr.Text() == "runAgent" || expr.Text() == "streamAgent"
	}
	if !ast.IsPropertyAccessExpression(expr) {
		return false
	}
	if m := expr.Name().Text(); m != "run" && m != "stream" {
		return false
	}
	agent := tsutil.UnwrapNonNullParens(expr.Expression())
	if !ast.IsPropertyAccessExpression(agent) || agent.Name().Text() != "agent" {
		return false
	}
	return tsutil.IsRpcExpr(agent.Expression())
}
