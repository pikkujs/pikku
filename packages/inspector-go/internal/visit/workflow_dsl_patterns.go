package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Ports of utils/workflow/dsl/patterns.ts and utils/workflow/dsl/validation.ts.

// dynamicScenarioStepTarget is inspector-constants.ts DYNAMIC_SCENARIO_STEP_TARGET.
const dynamicScenarioStepTarget = "<dynamic>"

// isWorkflowWireIdentifier: the wire handed to a DSL func is named `workflow`
// in a workflow and `scenario` in a scenario.
func isWorkflowWireIdentifier(expr *ast.Node) bool {
	return expr != nil && ast.IsIdentifier(expr) && (expr.Text() == "workflow" || expr.Text() == "scenario")
}

// wireMethod returns the method name of a `workflow.<m>(...)` /
// `scenario.<m>(...)` call, or "".
func wireMethod(call *ast.Node) string {
	callee := call.Expression()
	if !ast.IsPropertyAccessExpression(callee) || !isWorkflowWireIdentifier(callee.Expression()) {
		return ""
	}
	return callee.Name().Text()
}

func isWorkflowDoCall(call *ast.Node) bool {
	m := wireMethod(call)
	return m == "do" || m == "expectEventually"
}

func scenarioStepPhase(call *ast.Node) string {
	switch m := wireMethod(call); m {
	case "given", "when", "then":
		return m
	}
	return ""
}

func isScenarioStepCall(call *ast.Node) bool { return scenarioStepPhase(call) != "" }

func isScenarioExpectationCall(call *ast.Node) bool {
	switch wireMethod(call) {
	case "expectService", "expectError", "expectEventually", "expectScore":
		return true
	}
	return false
}

func isWorkflowExpectEventuallyCall(call *ast.Node) bool {
	return wireMethod(call) == "expectEventually"
}
func isWorkflowSleepCall(call *ast.Node) bool     { return wireMethod(call) == "sleep" }
func isWorkflowSuspendCall(call *ast.Node) bool   { return wireMethod(call) == "suspend" }
func isWorkflowMilestoneCall(call *ast.Node) bool { return wireMethod(call) == "milestone" }
func isWorkflowApprovalCall(call *ast.Node) bool  { return wireMethod(call) == "approval" }

// extractVirtualUserFromOptions: `{ virtualUser: virtualUsers.x }` → "x"
// (also `virtualUsers['x']`).
func extractVirtualUserFromOptions(optionsArg *ast.Node) any {
	if optionsArg == nil || !ast.IsObjectLiteralExpression(optionsArg) {
		return jsUndefined
	}
	for _, p := range optionsArg.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) || p.Name().Text() != "virtualUser" {
			continue
		}
		init := p.Initializer()
		if ast.IsPropertyAccessExpression(init) {
			return init.Name().Text()
		}
		if ast.IsElementAccessExpression(init) {
			if arg := init.AsElementAccessExpression().ArgumentExpression; arg != nil && ast.IsStringLiteral(arg) {
				return arg.Text()
			}
		}
	}
	return jsUndefined
}

func isThrowCancelException(stmt *ast.Node) bool {
	expr := stmt.Expression()
	if expr == nil {
		return false
	}
	if (ast.IsNewExpression(expr) || ast.IsCallExpression(expr)) && ast.IsIdentifier(expr.Expression()) {
		return expr.Expression().Text() == "WorkflowCancelledException"
	}
	return false
}

func extractCancelReason(stmt *ast.Node) any {
	expr := stmt.Expression()
	if expr == nil {
		return jsUndefined
	}
	var args []*ast.Node
	if ast.IsNewExpression(expr) {
		if l := expr.AsNewExpression().Arguments; l != nil {
			args = l.Nodes
		}
	} else if ast.IsCallExpression(expr) {
		args = expr.Arguments()
	}
	if len(args) > 0 {
		if ast.IsStringLiteral(args[0]) {
			return args[0].Text()
		}
		return tsutil.NodeText(args[0])
	}
	return jsUndefined
}

func propertyCallName(call *ast.Node) string {
	if !ast.IsPropertyAccessExpression(call.Expression()) {
		return ""
	}
	return call.Expression().Name().Text()
}

func isPromiseAll(call *ast.Node) bool {
	callee := call.Expression()
	return ast.IsPropertyAccessExpression(callee) && ast.IsIdentifier(callee.Expression()) &&
		callee.Expression().Text() == "Promise" && callee.Name().Text() == "all"
}

// isParallelFanout: Promise.all(array.map(...)).
func isParallelFanout(call *ast.Node) bool {
	if !isPromiseAll(call) {
		return false
	}
	args := call.Arguments()
	if len(args) == 0 || !ast.IsCallExpression(args[0]) {
		return false
	}
	return propertyCallName(args[0]) == "map"
}

// isParallelGroup: Promise.all([...]).
func isParallelGroup(call *ast.Node) bool {
	if !isPromiseAll(call) {
		return false
	}
	args := call.Arguments()
	return len(args) > 0 && ast.IsArrayLiteralExpression(args[0])
}

func isSequentialFanout(stmt *ast.Node) bool {
	init := stmt.AsForInOrOfStatement().Initializer
	if init == nil || !ast.IsVariableDeclarationList(init) {
		return false
	}
	if init.Flags&ast.NodeFlagsConst == 0 {
		return false
	}
	return len(init.AsVariableDeclarationList().Declarations.Nodes) == 1
}

// extractSourcePath: `data.memberEmails` → "data.memberEmails".
func extractSourcePath(expr *ast.Node) (string, bool) {
	if ast.IsIdentifier(expr) {
		return expr.Text(), true
	}
	if ast.IsPropertyAccessExpression(expr) {
		if base, ok := extractSourcePath(expr.Expression()); ok {
			return base + "." + expr.Name().Text(), true
		}
	}
	return "", false
}

func extractForOfVariable(stmt *ast.Node) (itemVar, sourceVar string, ok bool) {
	fs := stmt.AsForInOrOfStatement()
	if fs.Initializer == nil || !ast.IsVariableDeclarationList(fs.Initializer) {
		return "", "", false
	}
	decl := fs.Initializer.AsVariableDeclarationList().Declarations.Nodes[0]
	if !ast.IsIdentifier(decl.Name()) {
		return "", "", false
	}
	src, ok := extractSourcePath(fs.Expression)
	if !ok {
		return "", "", false
	}
	return decl.Name().Text(), src, true
}

// getSourceText is node.getText().trim().
func getSourceText(n *ast.Node) string { return strings.TrimSpace(tsutil.NodeText(n)) }

// ---- validation.ts ----

type dslValidationError struct {
	message string
}

// syntaxKindName is `ts.SyntaxKind[kind]`: the enum's reverse mapping, where
// a marker alias declared later (FirstStatement, LastStatement) wins.
func syntaxKindName(k ast.Kind) string {
	switch k {
	case ast.KindVariableStatement:
		return "FirstStatement"
	case ast.KindDebuggerStatement:
		return "LastStatement"
	}
	return strings.TrimPrefix(k.String(), "Kind")
}

func isDslAllowedStatement(n *ast.Node) bool {
	switch n.Kind {
	case ast.KindVariableStatement, ast.KindExpressionStatement, ast.KindIfStatement,
		ast.KindSwitchStatement, ast.KindForOfStatement, ast.KindReturnStatement, ast.KindThrowStatement:
		return true
	}
	return false
}

func validateNoDisallowedPatterns(root *ast.Node, allowInline bool) []dslValidationError {
	var errs []dslValidationError
	var visitNode func(n *ast.Node)
	visitBlock := func(block *ast.Node) {
		for _, stmt := range block.Statements() {
			if isDslAllowedStatement(stmt) {
				visitNode(stmt)
				continue
			}
			name := syntaxKindName(stmt.Kind)
			errs = append(errs, dslValidationError{
				message: "Statement type '" + name + "' is not allowed in DSL workflows. Allowed: const/let, if/else, switch/case, for..of, return, throw, and workflow calls. If this should be supported, please report the node type: " + name,
			})
		}
	}
	visitNode = func(n *ast.Node) {
		if allowInline && (ast.IsArrowFunction(n) || ast.IsFunctionExpression(n)) {
			return
		}
		switch n.Kind {
		case ast.KindWhileStatement, ast.KindDoStatement:
			errs = append(errs, dslValidationError{message: "while and do-while loops are not allowed in DSL workflows"})
			return
		case ast.KindForInStatement, ast.KindForStatement:
			errs = append(errs, dslValidationError{message: "for and for-in loops are not allowed in DSL workflows. Use for-of instead."})
			return
		}
		if !allowInline && ast.IsCallExpression(n) && wireMethod(n) == "do" {
			if args := n.Arguments(); len(args) > 1 && tsutil.IsFunctionLike(args[1]) {
				errs = append(errs, dslValidationError{message: "Inline workflow.do with function argument is not allowed in DSL workflows. Use pikkuWorkflowComplexFunc instead."})
				return
			}
		}
		if ast.IsBlock(n) {
			visitBlock(n)
		} else {
			n.ForEachChild(func(c *ast.Node) bool { visitNode(c); return false })
		}
	}
	visitNode(root)
	return errs
}

func validateAwaitedCalls(root *ast.Node) []dslValidationError {
	var errs []dslValidationError
	var visit func(n *ast.Node, parentIsAwait, insidePromiseAll bool)
	visitChildren := func(n *ast.Node, parentIsAwait, insidePromiseAll bool) {
		n.ForEachChild(func(c *ast.Node) bool { visit(c, parentIsAwait, insidePromiseAll); return false })
	}
	visit = func(n *ast.Node, parentIsAwait, insidePromiseAll bool) {
		if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) {
			if isPromiseAll(n) || n.Expression().Name().Text() == "push" {
				visitChildren(n, parentIsAwait, true)
				return
			}
		}
		if ast.IsArrayLiteralExpression(n) {
			visitChildren(n, parentIsAwait, true)
			return
		}
		if ast.IsCallExpression(n) {
			if m := wireMethod(n); m == "do" || m == "sleep" {
				if !parentIsAwait && !insidePromiseAll {
					errs = append(errs, dslValidationError{message: "workflow." + m + "() must be awaited"})
				}
				return
			}
		}
		if ast.IsAwaitExpression(n) {
			visit(n.Expression(), true, insidePromiseAll)
		} else {
			visitChildren(n, false, insidePromiseAll)
		}
	}
	visit(root, false, false)
	return errs
}

func formatValidationErrors(errs []dslValidationError) string {
	lines := make([]string, len(errs))
	for i, e := range errs {
		lines[i] = "- " + e.message
	}
	return strings.Join(lines, "\n")
}
