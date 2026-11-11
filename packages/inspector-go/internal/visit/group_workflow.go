package visit

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-workflow.ts.

func init() {
	Register(Visitor{Name: "addWorkflow", Phase: PhaseSetup, Order: OrderAddWorkflow, Visit: (*Context).addWorkflow})
}

func (s *Context) extractStepName(n *ast.Node) string {
	if v, err := s.extractStringLiteral(n); err == nil {
		return v
	}
	return getSourceText(n)
}

// isStringLike is extract-node-value.ts isStringLike.
func isStringLike(n *ast.Node) bool {
	for ast.IsAsExpression(n) || n.Kind == ast.KindTypeAssertionExpression {
		n = n.Expression()
	}
	return ast.IsStringLiteral(n) || ast.IsNoSubstitutionTemplateLiteral(n) || ast.IsTemplateExpression(n)
}

func containsExpectEventuallyCall(n *ast.Node) bool {
	if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) && n.Expression().Name().Text() == "expectEventually" {
		return true
	}
	found := false
	n.ForEachChild(func(c *ast.Node) bool {
		if !found && !ast.IsFunctionDeclaration(c) {
			found = containsExpectEventuallyCall(c)
		}
		return false
	})
	return found
}

// childStepLists returns the nested step lists of a branch, switch, fanout
// or parallel step, in the order the TS walkers visit them.
func childStepLists(step *jsObj) [][]*jsObj {
	var out [][]*jsObj
	switch t, _ := step.Str("type"); t {
	case "branch":
		for _, b := range step.Steps("branches") {
			out = append(out, b.Steps("steps"))
		}
		out = append(out, step.Steps("elseSteps"))
	case "switch":
		for _, c := range step.Steps("cases") {
			out = append(out, c.Steps("steps"))
		}
		out = append(out, step.Steps("defaultSteps"))
	case "fanout":
		out = append(out, step.Steps("body"))
	case "parallel":
		out = append(out, step.Steps("children"))
	}
	return out
}

func hasInlineSteps(steps []*jsObj) bool {
	for _, st := range steps {
		if t, _ := st.Str("type"); t == "inline" {
			return true
		}
		for _, l := range childStepLists(st) {
			if hasInlineSteps(l) {
				return true
			}
		}
	}
	return false
}

func collectInvokedRPCs(steps []*jsObj, rpcs *state.Set) {
	for _, st := range steps {
		t, _ := st.Str("type")
		if t == "rpc" {
			if n, _ := st.Str("rpcName"); n != "" {
				rpcs.Add(n)
			}
			continue
		}
		if t == "scenarioStep" {
			if n, _ := st.Str("stepFunc"); n != "" {
				rpcs.Add(n)
			}
			continue
		}
		for _, l := range childStepLists(st) {
			collectInvokedRPCs(l, rpcs)
		}
	}
}

// getWorkflowInvocations is the basic AST walk used when a workflow is not
// (or not only) a DSL workflow.
func (s *Context) getWorkflowInvocations(n *ast.Node, steps *[]*jsObj) {
	if ast.IsPropertyAccessExpression(n) {
		name := n.Name().Text()
		parent := n.Parent
		if (name == "do" || name == "sleep" || name == "cancel" || name == "expectEventually") &&
			parent != nil && ast.IsCallExpression(parent) && parent.Expression() == n {
			args := parent.Arguments()
			switch {
			case name == "do" && len(args) >= 2:
				var optionsArg *ast.Node
				if len(args) >= 4 {
					optionsArg = args[len(args)-1]
				}
				stepName := s.extractStepName(args[0])
				if isStringLike(args[1]) {
					if rpcName, err := s.extractStringLiteral(args[1]); err == nil {
						*steps = append(*steps, newObj("type", "rpc", "stepName", stepName, "rpcName", rpcName,
							"virtualUser", extractVirtualUserFromOptions(optionsArg)))
						s.State.RPC.InvokedFunctions.Add(rpcName)
					}
				} else if ast.IsArrowFunction(args[1]) || ast.IsFunctionExpression(args[1]) || ast.IsFunctionDeclaration(args[1]) {
					description := s.extractOptionsDescription(optionsArg)
					if stepName == "" {
						stepName = "<dynamic>"
					}
					if description == "" {
						description = "<dynamic>"
					}
					*steps = append(*steps, newObj("type", "inline", "stepName", stepName, "description", description))
				}
			case name == "expectEventually" && len(args) >= 4:
				stepName := s.extractStepName(args[0])
				if isStringLike(args[1]) {
					if rpcName, err := s.extractStringLiteral(args[1]); err == nil {
						var opt *ast.Node
						if len(args) >= 5 {
							opt = args[4]
						}
						*steps = append(*steps, newObj("type", "rpc", "stepName", stepName, "rpcName", rpcName,
							"expectEventually", true, "virtualUser", extractVirtualUserFromOptions(opt)))
						s.State.RPC.InvokedFunctions.Add(rpcName)
					}
				}
			case name == "sleep" && len(args) >= 2:
				stepName := s.extractStepName(args[0])
				if stepName == "" {
					stepName = "<dynamic>"
				}
				var duration any = "<dynamic>"
				if v, ok := extractNumberLiteral(args[1]); ok {
					if v != 0 {
						duration = v
					}
				} else if v, err := s.extractStringLiteral(args[1]); err == nil && v != "" {
					duration = v
				}
				*steps = append(*steps, newObj("type", "sleep", "stepName", stepName, "duration", duration))
			case name == "cancel":
				*steps = append(*steps, newObj("type", "cancel"))
			}
		}
	}
	n.ForEachChild(func(c *ast.Node) bool {
		if !ast.IsFunctionDeclaration(c) {
			s.getWorkflowInvocations(c, steps)
		}
		return false
	})
}

// extractOptionsDescription is extract-node-value.ts extractDescription.
func (s *Context) extractOptionsDescription(opt *ast.Node) string {
	if opt == nil || !ast.IsObjectLiteralExpression(opt) {
		return ""
	}
	if p := tsutil.FindPropertyAssignment(opt, "description"); p != nil {
		if v, err := s.extractStringLiteral(p.Initializer()); err == nil {
			return v
		}
	}
	return ""
}

func (s *Context) addWorkflow(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	callee := node.Expression().Text()
	var wrapper string
	switch callee {
	case "pikkuWorkflowFunc":
		wrapper = "dsl"
	case "pikkuWorkflowComplexFunc":
		if !s.Options.AllowComplexWorkflows {
			s.Log.Critical(diag.ComplexWorkflowNotAllowed,
				"'"+callee+"' is used here, but this project has not enabled complex workflows. "+
					"Their inline steps cannot be serialized, so they are absent from the workflow graph and "+
					"cannot be replayed or migrated across a definition change. Express the workflow with "+
					"pikkuWorkflowFunc and the step DSL, or set `allow: { complexWorkflows: true }` in "+
					"pikku.config.json if the project accepts that trade.")
			return
		}
		wrapper = "complex"
	case "pikkuScenario":
		wrapper = "scenario"
	default:
		return
	}
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	firstArg := args[0]

	fn := s.extractFunctionName(node)
	workflowName := fn.exportedName
	if workflowName == "" {
		workflowName = fn.name
	}
	if workflowName == "" {
		sf := ast.GetSourceFileOfNode(node)
		line := scanner.GetECMALineOfPosition(sf, tsutil.NodeStart(node))
		rel, _ := filepath.Rel(s.RootDir, sf.FileName())
		s.Log.Critical(diag.MissingName, fmt.Sprintf(
			"Could not determine workflow name from export at %s:%d. Assign the `%s(...)` call to an exported const; that name is how it is registered.",
			rel, line+1, callee))
		return
	}

	funcNode, resolvedFunc, _ := s.extractFunctionNode(firstArg)

	var tags, errorsList, title, summary, description, expose, auth, skip any = jsUndefined, jsUndefined, jsUndefined, jsUndefined, jsUndefined, jsUndefined, jsUndefined, jsUndefined
	if ast.IsObjectLiteralExpression(firstArg) {
		m := s.getCommonWireMetaData(firstArg)
		if m.disabled {
			return
		}
		if m.hasTags {
			tags = m.tags
		}
		if m.hasErrors {
			errorsList = m.errors
		}
		title, summary, description = strPtrOrUndef(m.title), strPtrOrUndef(m.summary), strPtrOrUndef(m.description)
		expose = propValueToJS(tsutil.GetPropertyValue(firstArg, "expose"))
		auth = propValueToJS(tsutil.GetPropertyValue(firstArg, "auth"))
		if v := propValueToJS(tsutil.GetPropertyValue(firstArg, "skip")); v != nil {
			skip = v
		}
	}

	if ast.IsObjectLiteralExpression(firstArg) && (funcNode == nil || funcNode == firstArg) {
		s.Log.Critical(diag.MissingFunc, fmt.Sprintf("No valid 'func' property for workflow '%s'.", workflowName))
		return
	}
	if resolvedFunc == nil {
		s.Log.Critical(diag.MissingFunc, fmt.Sprintf("Could not resolve workflow function for '%s'.", workflowName))
		return
	}
	if wrapper != "scenario" && containsExpectEventuallyCall(resolvedFunc) {
		s.Log.Critical(diag.ExpectEventuallyScenarioOnly, fmt.Sprintf(
			"Workflow '%s' calls workflow.expectEventually(), which is only available in scenarios (pikkuScenario). Move it into a scenario, or drive the assertion outside the workflow.",
			workflowName))
		return
	}

	if fn.exportedName != "" {
		s.State.Workflows.Files.Set(fn.pikkuFuncId, state.FileExport{
			Path: ast.GetSourceFileOfNode(node).FileName(), ExportedName: fn.exportedName,
		})
	}

	if wrapper != "scenario" {
		s.checkApprovalsDeclareApprovers(resolvedFunc, workflowName)
	}

	steps := []*jsObj{}
	var context, dsl, asserts any = jsUndefined, jsUndefined, jsUndefined

	result := s.extractDSLWorkflow(node, wrapper != "dsl")
	// A DSL workflow that failed to extract is already refused (PKU641) for the
	// same reason; every other wrapper would drop the step without a word.
	if wrapper != "dsl" || result.ok {
		s.checkStepRpcNames(resolvedFunc, workflowName)
	}
	reason := result.reason
	if reason == "" {
		reason = "Unknown error"
	}
	if result.ok {
		steps = result.steps
		context = result.context
		asserts = result.asserts
		if hasInlineSteps(steps) {
			if wrapper == "dsl" {
				s.Log.Critical(diag.InvalidDslWorkflow, fmt.Sprintf(
					"Workflow '%s' uses pikkuWorkflowFunc but contains inline steps which are not allowed in DSL workflows. Use pikkuWorkflowComplexFunc instead.",
					workflowName))
				return
			}
			dsl = false
		} else {
			dsl = wrapper == "dsl"
		}
		var rpcs state.Set
		collectInvokedRPCs(steps, &rpcs)
		for _, r := range rpcs.Values() {
			s.State.RPC.InvokedFunctions.Add(r)
		}
	} else {
		switch wrapper {
		case "dsl":
			s.getWorkflowInvocations(resolvedFunc, &steps)
			s.Log.Critical(diag.InvalidDslWorkflow, fmt.Sprintf(
				"Workflow '%s' does not conform to DSL workflow rules:\n%s", workflowName, reason))
			return
		case "scenario":
			s.Log.Critical(diag.ScenarioNotExtractable, fmt.Sprintf(
				"Scenario '%s' could not be extracted, so none of its steps were recorded and it would run as an empty scenario:\n%s",
				workflowName, reason))
			return
		default:
			s.Log.Debugf("Workflow '%s' could not be extracted as DSL workflow: %s. Falling back to basic extraction.", workflowName, reason)
			dsl = false
		}
	}

	if wrapper != "dsl" {
		if len(steps) > 0 {
			sink := []*jsObj{}
			s.getWorkflowInvocations(resolvedFunc, &sink)
		} else {
			s.getWorkflowInvocations(resolvedFunc, &steps)
		}
	}

	var virtualUsers []string
	seen := map[string]bool{}
	for _, st := range steps {
		if v, ok := st.Str("virtualUser"); ok && !seen[v] {
			seen[v] = true
			virtualUsers = append(virtualUsers, v)
		}
	}

	meta := newObj(
		"pikkuFuncId", fn.pikkuFuncId,
		"name", workflowName,
		"steps", steps,
		"context", context,
		"dsl", dsl,
		"title", title,
		"summary", summary,
		"description", description,
		"errors", errorsList,
		"tags", tags,
		"expose", expose,
		"auth", auth,
		"skip", skip,
		"scenario", orUndef(true, wrapper == "scenario"),
		"asserts", asserts,
		"virtualUsers", orUndef(virtualUsers, len(virtualUsers) > 0),
	)
	s.State.Workflows.Meta.Set(workflowName, meta.raw())
}

// checkApprovalsDeclareApprovers refuses a workflow.approval() that does not say
// who answers it. Walked over the source rather than the extracted steps, so a
// complex workflow the DSL cannot model is held to the same rule. A spread or a
// variable as the options cannot be read, and is refused rather than assumed.
func (s *Context) checkApprovalsDeclareApprovers(fn *ast.Node, workflowName string) {
	var visit func(n *ast.Node) bool
	visit = func(n *ast.Node) bool {
		// A nested function with its own `workflow` parameter shadows the wire:
		// its workflow.approval() is the application's, not the DSL's.
		if tsutil.IsFunctionLike(n) && shadowsWorkflowWire(n) {
			return false
		}
		if ast.IsCallExpression(n) && isWorkflowApprovalCall(n) && !approvalDeclaresApprovers(n) {
			s.Log.Critical(diag.WorkflowApprovalMissingApprovers, fmt.Sprintf(
				"Workflow '%s' has a workflow.approval() with no 'approvers', so nothing says who may answer it. "+
					"Add approvers: 'owner', 'not-initiator', or 'any' (any signed-in user) to its options.",
				workflowName))
		}
		n.ForEachChild(visit)
		return false
	}
	fn.ForEachChild(visit)
}

// shadowsWorkflowWire: the function takes a plain parameter named `workflow`.
func shadowsWorkflowWire(fn *ast.Node) bool {
	for _, p := range fn.Parameters() {
		if ast.IsIdentifier(p.Name()) && p.Name().Text() == "workflow" {
			return true
		}
	}
	return false
}

// approvalDeclaresApprovers is true only for an effective policy: `approvers`
// present, not literally undefined or null, and not overridden by a later
// spread, whose value cannot be read.
func approvalDeclaresApprovers(call *ast.Node) bool {
	args := call.Arguments()
	if len(args) < 2 || !ast.IsObjectLiteralExpression(args[1]) {
		return false
	}
	declared := false
	for _, p := range args[1].Properties() {
		if ast.IsSpreadAssignment(p) {
			declared = false
			continue
		}
		if !(ast.IsPropertyAssignment(p) || ast.IsShorthandPropertyAssignment(p)) ||
			!(ast.IsIdentifier(p.Name()) || ast.IsStringLiteral(p.Name())) || p.Name().Text() != "approvers" {
			continue
		}
		declared = true
		if ast.IsPropertyAssignment(p) {
			init := p.Initializer()
			if init.Kind == ast.KindNullKeyword || (ast.IsIdentifier(init) && init.Text() == "undefined") {
				declared = false
			}
		}
	}
	return declared
}

// propValueToJS is getPropertyValue's result as a JS value: nil for null.
func propValueToJS(v tsutil.PropValue) any {
	switch {
	case !v.Present:
		return nil
	case v.Bool != nil:
		return *v.Bool
	case v.Num != nil:
		return *v.Num
	case v.Strs != nil:
		return v.Strs
	case v.Str != nil:
		return *v.Str
	}
	return nil
}

// checkStepRpcNames refuses a workflow.do / workflow.expectEventually step
// whose rpc name is not a string literal or a const of one: the step would be
// absent from the workflow graph, so it could not be replayed, migrated or
// found by `pikku graph`.
func (s *Context) checkStepRpcNames(fn *ast.Node, workflowName string) {
	if fn == nil {
		return
	}
	tsutil.WalkSelf(fn, func(n *ast.Node) {
		if !ast.IsCallExpression(n) || !ast.IsPropertyAccessExpression(n.Expression()) {
			return
		}
		pa := n.Expression()
		method := pa.Name().Text()
		args := n.Arguments()
		if (method != "do" || len(args) < 2) && (method != "expectEventually" || len(args) < 4) {
			return
		}
		recv := tsutil.UnwrapNonNullParens(pa.Expression())
		if !(ast.IsIdentifier(recv) && recv.Text() == "workflow") && !(ast.IsPropertyAccessExpression(recv) && recv.Name().Text() == "workflow") {
			return
		}
		arg := args[1]
		inner := arg
		for ast.IsAsExpression(inner) || inner.Kind == ast.KindTypeAssertionExpression {
			inner = inner.Expression()
		}
		if ast.IsArrowFunction(inner) || ast.IsFunctionExpression(inner) || ast.IsFunctionDeclaration(inner) {
			return
		}
		if ast.IsIdentifier(inner) || ast.IsPropertyAccessExpression(inner) {
			if t := s.Checker.GetTypeAtLocation(inner); t != nil && len(s.Checker.GetSignaturesOfType(t, checker.SignatureKindCall)) > 0 {
				return // a step function passed by reference
			}
		}
		if v, err := s.extractStringLiteral(inner); err == nil && !strings.Contains(v, "${") {
			return
		}
		if v, ok := s.constStringName(inner); ok && v != "" {
			return
		}
		s.Log.Critical(diag.WorkflowStepNameNotLiteral, fmt.Sprintf(
			"• Workflow '%s' calls %s(%s) with an rpc name the inspector cannot read. The step would be missing from the workflow graph, so it cannot be replayed, migrated or found by `pikku graph`. Use a string literal or a const of one.",
			workflowName, tsutil.NodeText(pa), tsutil.NodeText(arg)))
	})
}
