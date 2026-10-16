package visit

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of utils/workflow/dsl/extract-dsl-workflow.ts. Steps are built as
// jsObj values whose key order is the TS object literals' order, so the meta
// serializes exactly as the TS extractor's does.

// errStringLiteralMessage is the message extract-node-value.ts's
// extractStringLiteral throws; it ends up inside DSL failure reasons.
const errStringLiteralMessage = "Unable to extract string literal from node"

type dslContextVar struct {
	typ string
	def any
}

type dslCtx struct {
	s              *Context
	outputVars     map[string]bool
	inputParamName *string // nil: no input parameter is declared
	errors         *[]dslValidationError
	loopVars       map[string]bool
	contextVars    *state.Map[dslContextVar]
	depth          int
}

func (c *dslCtx) addError(msg string) {
	*c.errors = append(*c.errors, dslValidationError{message: msg})
}

func (c *dslCtx) isInputParam(name string) bool {
	return c.inputParamName != nil && *c.inputParamName == name
}

// child is the `{ ...context, outputVars: new Map(...), loopVars: ... }` copy
// a fanout body extracts with: errors and contextVars are shared, depth is
// copied.
func (c *dslCtx) child(itemVar string) *dslCtx {
	cc := *c
	cc.outputVars = make(map[string]bool, len(c.outputVars))
	for k := range c.outputVars {
		cc.outputVars[k] = true
	}
	cc.loopVars = make(map[string]bool, len(c.loopVars)+1)
	for k := range c.loopVars {
		cc.loopVars[k] = true
	}
	cc.loopVars[itemVar] = true
	return &cc
}

func (c *dslCtx) stringLiteral(n *ast.Node) (string, error) {
	v, err := c.s.extractStringLiteral(n)
	if err != nil {
		return "", fmt.Errorf("%s", errStringLiteralMessage)
	}
	return v, nil
}

type dslResult struct {
	ok      bool
	steps   []*jsObj
	context any // *jsObj | undefined
	asserts any // true | undefined
	reason  string
}

// isUncalledFunction: a function the walk must not step into because
// nothing says it runs (declared, or assigned to a name).
func isUncalledFunction(n *ast.Node) bool {
	if ast.IsFunctionDeclaration(n) {
		return true
	}
	if !ast.IsFunctionExpression(n) && !ast.IsArrowFunction(n) {
		return false
	}
	parent := n.Parent
	if parent == nil || !ast.IsCallExpression(parent) {
		return true
	}
	for _, a := range parent.Arguments() {
		if a == n {
			return false
		}
	}
	return true
}

func hasScenarioExpectation(body *ast.Node) bool {
	found := false
	var visit func(n *ast.Node)
	visit = func(n *ast.Node) {
		if found {
			return
		}
		if ast.IsCallExpression(n) && isScenarioExpectationCall(n) {
			found = true
			return
		}
		if n != body && isUncalledFunction(n) {
			return
		}
		n.ForEachChild(func(c *ast.Node) bool { visit(c); return false })
	}
	visit(body)
	return found
}

func (s *Context) extractDSLWorkflow(funcNode *ast.Node, allowInline bool) (res dslResult) {
	defer func() {
		if r := recover(); r != nil {
			res = dslResult{reason: fmt.Sprint(r)}
		}
	}()
	arrow := findWorkflowFunction(funcNode)
	if arrow == nil {
		return dslResult{reason: "Could not find async arrow function in workflow definition"}
	}
	var inputParamName *string
	if params := arrow.Parameters(); len(params) >= 2 {
		if !ast.IsIdentifier(params[1].Name()) {
			return dslResult{reason: "Could not determine input parameter name"}
		}
		name := params[1].Name().Text()
		inputParamName = &name
	}
	var errs []dslValidationError
	ctx := &dslCtx{
		s:              s,
		outputVars:     map[string]bool{},
		inputParamName: inputParamName,
		errors:         &errs,
		loopVars:       map[string]bool{},
		contextVars:    state.NewMap[dslContextVar](),
	}
	body := arrow.Body()
	if pe := validateNoDisallowedPatterns(body, allowInline); len(pe) > 0 {
		return dslResult{reason: formatValidationErrors(pe)}
	}
	if ae := validateAwaitedCalls(body); len(ae) > 0 {
		return dslResult{reason: formatValidationErrors(ae)}
	}
	steps := ctx.extractSteps(body, false)
	if len(errs) > 0 {
		return dslResult{reason: formatValidationErrors(errs)}
	}
	res = dslResult{ok: true, steps: steps, context: jsUndefined, asserts: jsUndefined}
	if ctx.contextVars.Len() > 0 {
		wc := newObj()
		for _, name := range ctx.contextVars.Keys() {
			v := ctx.contextVars.At(name)
			wc.Set(name, newObj("type", v.typ, "default", v.def))
		}
		res.context = wc
	}
	if hasScenarioExpectation(body) {
		res.asserts = true
	}
	return res
}

func findWorkflowFunction(n *ast.Node) *ast.Node {
	funcProp := func(obj *ast.Node) *ast.Node {
		for _, p := range obj.Properties() {
			if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == "func" {
				if ast.IsArrowFunction(p.Initializer()) {
					return p.Initializer()
				}
			}
		}
		return nil
	}
	if ast.IsCallExpression(n) {
		if args := n.Arguments(); len(args) > 0 {
			if ast.IsArrowFunction(args[0]) {
				return args[0]
			}
			if ast.IsObjectLiteralExpression(args[0]) {
				if f := funcProp(args[0]); f != nil {
					return f
				}
			}
		}
	}
	if ast.IsObjectLiteralExpression(n) {
		return funcProp(n)
	}
	return nil
}

func (c *dslCtx) extractSteps(body *ast.Node, incrementDepth bool) []*jsObj {
	steps := []*jsObj{}
	if !ast.IsBlock(body) {
		return steps
	}
	if incrementDepth {
		c.depth++
	}
	for _, stmt := range body.Statements() {
		if st := c.extractStep(stmt); st != nil {
			steps = append(steps, st)
		}
	}
	if incrementDepth {
		c.depth--
	}
	return steps
}

func (c *dslCtx) extractStep(stmt *ast.Node) *jsObj {
	switch {
	case ast.IsVariableStatement(stmt):
		return c.extractVariableDeclaration(stmt)
	case ast.IsExpressionStatement(stmt):
		return c.extractExpressionStatement(stmt)
	case ast.IsIfStatement(stmt):
		return c.extractBranch(stmt)
	case ast.IsSwitchStatement(stmt):
		return c.extractSwitch(stmt)
	case ast.IsForOfStatement(stmt):
		reason := ""
		fanout := c.extractSequentialFanout(stmt, &reason)
		if fanout == nil && containsWorkflowCall(stmt.AsForInOrOfStatement().Statement) {
			msg := reason
			if msg == "" {
				msg = "its iterable must be a data array (an identifier or field like 'data.items'), not a computed/inline " +
					"iterable such as '[...Array(n).keys()]'. Use pikkuWorkflowComplexFunc for a control-flow/counting loop, " +
					"or iterate over a real input array."
			}
			c.addError("The for-of loop '" + utf16Prefix(tsutil.NodeText(stmt), 60) + "' can't be expressed in a DSL workflow — " + msg)
		}
		return fanout
	case ast.IsReturnStatement(stmt):
		return c.extractReturn(stmt)
	case ast.IsThrowStatement(stmt):
		return extractThrowCancel(stmt)
	}
	return nil
}

func declarations(stmt *ast.Node) (*ast.Node, []*ast.Node) {
	list := stmt.AsVariableStatement().DeclarationList
	return list, list.AsVariableDeclarationList().Declarations.Nodes
}

func awaitedCall(n *ast.Node) *ast.Node {
	if n != nil && ast.IsAwaitExpression(n) && ast.IsCallExpression(n.Expression()) {
		return n.Expression()
	}
	return nil
}

func (c *dslCtx) extractVariableDeclaration(stmt *ast.Node) *jsObj {
	_, decls := declarations(stmt)
	if len(decls) != 1 {
		c.addError("A single declaration statement may only declare one variable in DSL workflows. Split '" + utf16Prefix(tsutil.NodeText(stmt), 60) + "' into separate statements.")
		return nil
	}
	decl := decls[0]
	if !ast.IsIdentifier(decl.Name()) {
		return c.extractDestructuredDeclaration(decl)
	}
	varName := decl.Name().Text()
	init := decl.Initializer()
	if c.depth > 0 {
		c.addError("Variable declaration '" + varName + "' inside block is not supported in DSL workflows. Move all let/const declarations to the top level.")
		return nil
	}
	if init == nil {
		return nil
	}
	if lit, ok := extractLiteralValue(init); ok {
		t := c.s.Checker.GetTypeAtLocation(decl)
		c.contextVars.Set(varName, dslContextVar{typ: c.s.inferSimpleType(t), def: lit})
		return nil
	}
	if call := awaitedCall(init); call != nil {
		if isWorkflowDoCall(call) || isScenarioStepCall(call) {
			var step *jsObj
			switch {
			case isScenarioStepCall(call):
				step = c.extractScenarioStep(call, varName)
			case isInlineDoCall(call):
				step = c.extractInlineStep(call)
			default:
				step = c.extractRpcStep(call, varName)
			}
			if step != nil {
				c.touchType(decl)
				c.outputVars[varName] = true
				return step
			}
		}
		if isParallelFanout(call) || isParallelGroup(call) {
			var step *jsObj
			if isParallelFanout(call) {
				step = c.extractParallelFanout(call)
			} else {
				step = c.extractParallelGroup(call)
			}
			if step != nil {
				c.touchType(decl)
				c.outputVars[varName] = true
				return step
			}
		}
	}
	if ast.IsCallExpression(init) {
		switch propertyCallName(init) {
		case "filter":
			if st := c.extractArrayFilter(init, varName); st != nil {
				c.touchType(decl)
				c.outputVars[varName] = true
				return st
			}
		}
		if m := propertyCallName(init); m == "some" || m == "every" {
			if st := c.extractArrayPredicate(init, varName); st != nil {
				c.touchType(decl)
				c.outputVars[varName] = true
				return st
			}
		}
	}
	return nil
}

func (c *dslCtx) extractDestructuredDeclaration(decl *ast.Node) *jsObj {
	init := decl.Initializer()
	if call := awaitedCall(init); call != nil && isParallelGroup(call) && ast.IsArrayBindingPattern(decl.Name()) {
		elements := decl.Name().Elements()
		allSimple := true
		for _, el := range elements {
			if !ast.IsBindingElement(el) || !ast.IsIdentifier(el.Name()) || el.AsBindingElement().DotDotDotToken != nil {
				allSimple = false
				break
			}
		}
		if allSimple {
			if step := c.extractParallelGroup(call); step != nil {
				children := step.Steps("children")
				if len(elements) != len(children) {
					c.addError(fmt.Sprintf("Destructuring binds %d name(s) but Promise.all has %d step(s). They must match so each result can be bound to its step.", len(elements), len(children)))
					return nil
				}
				for i, el := range elements {
					name := el.Name().Text()
					children[i].Set("outputVar", name)
					c.touchType(el.Name())
					c.outputVars[name] = true
				}
				return step
			}
		}
	}
	call := awaitedCall(init)
	if call == nil || !(isWorkflowDoCall(call) || isScenarioStepCall(call) || isParallelGroup(call) || isParallelFanout(call)) {
		return nil
	}
	c.addError("Destructuring a step result is not supported in DSL workflows. Assign it to a variable first (e.g. `const result = await workflow.do(...)`) and read its properties.")
	return nil
}

func (c *dslCtx) extractExpressionStatement(stmt *ast.Node) *jsObj {
	expr := stmt.Expression()
	outputVar := ""
	hasOutput := false
	if ast.IsBinaryExpression(expr) && expr.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		be := expr.AsBinaryExpression()
		if ast.IsIdentifier(be.Left) {
			outputVar = be.Left.Text()
			hasOutput = true
			if c.contextVars.Has(outputVar) {
				rhsCall := awaitedCall(be.Right)
				if rhsCall == nil || !isWorkflowDoCall(rhsCall) {
					if lit, ok := extractLiteralValue(be.Right); ok {
						return newObj("type", "set", "variable", outputVar, "value", lit)
					}
					return newObj("type", "set", "variable", outputVar, "expression", getSourceText(be.Right))
				}
			}
		}
		expr = be.Right
	}
	call := awaitedCall(expr)
	if call == nil {
		return nil
	}
	ov := orUndef(outputVar, hasOutput)
	if isWorkflowDoCall(call) || isScenarioStepCall(call) {
		var step *jsObj
		switch {
		case isScenarioStepCall(call):
			step = c.extractScenarioStep(call, ov)
		case isInlineDoCall(call):
			step = c.extractInlineStep(call)
		default:
			step = c.extractRpcStep(call, ov)
		}
		if hasOutput && outputVar != "" && step != nil {
			c.touchType(expr)
			c.outputVars[outputVar] = true
		}
		return step
	}
	if isWorkflowSleepCall(call) {
		return c.extractSleepStep(call)
	}
	if isWorkflowSuspendCall(call) {
		return c.extractSuspendStep(call)
	}
	if isWorkflowMilestoneCall(call) {
		return c.extractMilestoneStep(call)
	}
	if isWorkflowApprovalCall(call) {
		step := c.extractApprovalStep(call, outputVar)
		if outputVar != "" && step != nil {
			c.touchType(expr)
			c.outputVars[outputVar] = true
		}
		return step
	}
	if isParallelFanout(call) {
		return c.extractParallelFanout(call)
	}
	if isParallelGroup(call) {
		return c.extractParallelGroup(call)
	}
	return nil
}

func errMessage(err error) string { return err.Error() }

// extractRpcStep: outputVar is a string or jsUndefined.
func (c *dslCtx) extractRpcStep(call *ast.Node, outputVar any) *jsObj {
	args := call.Arguments()
	if len(args) < 2 {
		return nil
	}
	stepName, err := c.stringLiteral(args[0])
	if err == nil {
		var rpcName string
		rpcName, err = c.stringLiteral(args[1])
		if err == nil {
			var inputs any = jsUndefined
			if len(args) >= 3 {
				inputs = c.extractInputSources(args[2])
			}
			expectEventually := isWorkflowExpectEventuallyCall(call)
			optionsIndex := 3
			if expectEventually {
				optionsIndex = 4
			}
			var optionsArg *ast.Node
			if len(args) > optionsIndex {
				optionsArg = args[optionsIndex]
			}
			var options any = jsUndefined
			if optionsArg != nil && ast.IsObjectLiteralExpression(optionsArg) {
				options = c.extractStepOptions(optionsArg)
			}
			return newObj(
				"type", "rpc",
				"stepName", stepName,
				"rpcName", rpcName,
				"outputVar", outputVar,
				"inputs", inputs,
				"options", options,
				"virtualUser", extractVirtualUserFromOptions(optionsArg),
				"expectEventually", orUndef(true, expectEventually),
			)
		}
	}
	c.addError("Failed to extract RPC step: " + errMessage(err))
	return nil
}

func (c *dslCtx) extractScenarioStep(call *ast.Node, outputVar any) *jsObj {
	phase := scenarioStepPhase(call)
	if phase == "" {
		return nil
	}
	args := call.Arguments()
	if len(args) < 2 {
		return nil
	}
	stepName, err := c.stringLiteral(args[0])
	if err != nil {
		c.addError("Failed to extract scenario step: " + errMessage(err))
		return nil
	}
	stepFunc := dynamicScenarioStepTarget
	if v, err := c.stringLiteral(args[1]); err == nil {
		stepFunc = v
	}
	var inputs any = jsUndefined
	if len(args) >= 3 {
		inputs = c.extractInputSources(args[2])
	}
	var optionsArg *ast.Node
	if len(args) >= 4 {
		optionsArg = args[3]
	}
	var options any = jsUndefined
	if optionsArg != nil && ast.IsObjectLiteralExpression(optionsArg) {
		options = c.extractStepOptions(optionsArg)
	}
	return newObj(
		"type", "scenarioStep",
		"stepName", stepName,
		"stepFunc", stepFunc,
		"phase", phase,
		"outputVar", outputVar,
		"inputs", inputs,
		"options", options,
		"virtualUser", extractVirtualUserFromOptions(optionsArg),
	)
}

func (c *dslCtx) extractInlineStep(call *ast.Node) *jsObj {
	args := call.Arguments()
	if len(args) < 2 {
		return nil
	}
	stepName, err := c.stringLiteral(args[0])
	if err != nil {
		c.addError("Failed to extract inline step: " + errMessage(err))
		return nil
	}
	var options any = jsUndefined
	if len(args) >= 3 {
		if opt := args[len(args)-1]; ast.IsObjectLiteralExpression(opt) {
			options = c.extractStepOptions(opt)
		}
	}
	return newObj("type", "inline", "stepName", stepName, "options", options)
}

func isInlineDoCall(call *ast.Node) bool {
	args := call.Arguments()
	return len(args) > 1 && tsutil.IsFunctionLike(args[1])
}

func extractNumberLiteral(n *ast.Node) (float64, bool) {
	if ast.IsNumericLiteral(n) {
		return jsNumber(n.Text()), true
	}
	return 0, false
}

func (c *dslCtx) extractStepOptions(obj *ast.Node) any {
	options := newObj()
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		init := p.Initializer()
		switch p.Name().Text() {
		case "retries":
			if v, ok := extractNumberLiteral(init); ok {
				options.Set("retries", v)
			}
		case "retryDelay":
			if ast.IsStringLiteral(init) {
				options.Set("retryDelay", init.Text())
			} else if v, ok := extractNumberLiteral(init); ok {
				options.Set("retryDelay", v)
			}
		case "compensate":
			if init.Kind == ast.KindFalseKeyword {
				options.Set("compensate", false)
			} else {
				c.addError("compensate on a call site can only be `false`: a step's compensation is declared on the function itself.")
			}
		case "description":
			if v, err := c.stringLiteral(init); err == nil {
				options.Set("description", v)
			}
		}
	}
	if options.DefinedLen() == 0 {
		return jsUndefined
	}
	return options
}

func (c *dslCtx) extractSleepStep(call *ast.Node) *jsObj {
	args := call.Arguments()
	if len(args) < 2 {
		return nil
	}
	stepName, err := c.stringLiteral(args[0])
	if err != nil {
		c.addError("Failed to extract sleep step: " + errMessage(err))
		return nil
	}
	var duration any
	if v, ok := extractNumberLiteral(args[1]); ok {
		duration = v
	} else if v, err := c.stringLiteral(args[1]); err == nil {
		duration = v
	} else {
		return newObj("type", "sleep", "stepName", stepName, "duration", "", "expression", tsutil.NodeText(args[1]))
	}
	return newObj("type", "sleep", "stepName", stepName, "duration", duration)
}

func (c *dslCtx) extractSuspendStep(call *ast.Node) *jsObj {
	args := call.Arguments()
	if len(args) < 1 {
		return nil
	}
	reason, err := c.stringLiteral(args[0])
	if err != nil {
		c.addError("Failed to extract suspend step: " + errMessage(err))
		return nil
	}
	return newObj("type", "suspend", "reason", reason)
}

func (c *dslCtx) extractMilestoneStep(call *ast.Node) *jsObj {
	args := call.Arguments()
	if len(args) < 1 {
		return nil
	}
	name, err := c.stringLiteral(args[0])
	if err != nil {
		c.addError("Failed to extract milestone step: " + errMessage(err))
		return nil
	}
	return newObj("type", "milestone", "name", name)
}

// extractApprovalStep: the approval policy (expiry, approvers, approverScope)
// is read from the literal options; `schema` is a runtime value and is left out.
func (c *dslCtx) extractApprovalStep(call *ast.Node, outputVar string) *jsObj {
	args := call.Arguments()
	if len(args) < 1 {
		return nil
	}
	reason, err := c.stringLiteral(args[0])
	if err != nil {
		c.addError("Failed to extract approval step: " + errMessage(err))
		return nil
	}
	step := newObj("type", "approval", "reason", reason)
	if outputVar != "" {
		step.Set("outputVar", outputVar)
	}
	if len(args) > 1 && ast.IsObjectLiteralExpression(args[1]) {
		for _, p := range args[1].Properties() {
			if !ast.IsPropertyAssignment(p) {
				continue
			}
			name := tsutil.NodeText(p.Name())
			init := p.Initializer()
			if name == "expiry" {
				if ast.IsNumericLiteral(init) {
					step.Set("expiry", jsNumber(init.Text()))
				} else if ast.IsStringLiteral(init) {
					step.Set("expiry", init.Text())
				}
			}
			if name == "approvers" && ast.IsStringLiteral(init) {
				step.Set("approvers", init.Text())
			}
			if name == "approverScope" && ast.IsStringLiteral(init) {
				step.Set("approverScope", init.Text())
			}
		}
	}
	return step
}

func extractThrowCancel(stmt *ast.Node) *jsObj {
	if !isThrowCancelException(stmt) {
		return nil
	}
	return newObj("type", "cancel", "reason", extractCancelReason(stmt))
}

func parseCondition(expr *ast.Node) *jsObj {
	if ast.IsBinaryExpression(expr) {
		be := expr.AsBinaryExpression()
		switch be.OperatorToken.Kind {
		case ast.KindAmpersandAmpersandToken:
			return newObj("type", "and", "conditions", []*jsObj{parseCondition(be.Left), parseCondition(be.Right)})
		case ast.KindBarBarToken:
			return newObj("type", "or", "conditions", []*jsObj{parseCondition(be.Left), parseCondition(be.Right)})
		}
	}
	if ast.IsParenthesizedExpression(expr) {
		return parseCondition(expr.Expression())
	}
	return newObj("type", "simple", "expression", getSourceText(expr))
}

func (c *dslCtx) extractBranch(stmt *ast.Node) *jsObj {
	branches := []*jsObj{}
	var elseSteps any = jsUndefined
	for current := stmt; current != nil; {
		is := current.AsIfStatement()
		cond := parseCondition(is.Expression)
		var steps []*jsObj
		if ast.IsBlock(is.ThenStatement) {
			steps = c.extractSteps(is.ThenStatement, true)
		} else {
			steps = c.extractStepsFromStatement(is.ThenStatement)
		}
		branches = append(branches, newObj("condition", cond, "steps", steps))
		switch {
		case is.ElseStatement == nil:
			current = nil
		case ast.IsIfStatement(is.ElseStatement):
			current = is.ElseStatement
		default:
			if ast.IsBlock(is.ElseStatement) {
				elseSteps = c.extractSteps(is.ElseStatement, true)
			} else {
				elseSteps = c.extractStepsFromStatement(is.ElseStatement)
			}
			current = nil
		}
	}
	return newObj("type", "branch", "branches", branches, "elseSteps", elseSteps)
}

func (c *dslCtx) extractStepsFromStatement(stmt *ast.Node) []*jsObj {
	c.depth++
	st := c.extractStep(stmt)
	c.depth--
	if st == nil {
		return []*jsObj{}
	}
	return []*jsObj{st}
}

func (c *dslCtx) extractSwitch(stmt *ast.Node) *jsObj {
	ss := stmt.AsSwitchStatement()
	expression := getSourceText(ss.Expression)
	cases := []*jsObj{}
	var defaultSteps any = jsUndefined
	for _, clause := range ss.CaseBlock.AsCaseBlock().Clauses.Nodes {
		cl := clause.AsCaseOrDefaultClause()
		if clause.Kind == ast.KindCaseClause {
			value, expr := extractCaseValue(cl.Expression)
			cases = append(cases, newObj("value", value, "expression", expr, "steps", c.extractCaseSteps(cl.Statements.Nodes)))
		} else {
			defaultSteps = c.extractCaseSteps(cl.Statements.Nodes)
		}
	}
	return newObj("type", "switch", "expression", expression, "cases", cases, "defaultSteps", defaultSteps)
}

// extractCaseValue returns (value, expression), each possibly undefined.
func extractCaseValue(expr *ast.Node) (any, any) {
	if v, ok := literalScalar(expr); ok {
		return v, jsUndefined
	}
	return jsUndefined, getSourceText(expr)
}

// literalScalar: a string, numeric, true/false or null literal.
func literalScalar(expr *ast.Node) (any, bool) {
	switch {
	case ast.IsStringLiteral(expr):
		return expr.Text(), true
	case ast.IsNumericLiteral(expr):
		return jsNumber(expr.Text()), true
	case expr.Kind == ast.KindTrueKeyword:
		return true, true
	case expr.Kind == ast.KindFalseKeyword:
		return false, true
	case expr.Kind == ast.KindNullKeyword:
		return nil, true
	}
	return nil, false
}

func (c *dslCtx) extractCaseSteps(stmts []*ast.Node) []*jsObj {
	steps := []*jsObj{}
	c.depth++
	for _, stmt := range stmts {
		if ast.IsBreakStatement(stmt) {
			break
		}
		if st := c.extractStep(stmt); st != nil {
			steps = append(steps, st)
		}
	}
	c.depth--
	return steps
}

// arrowItemPredicate is the shared shape of filter/some/every: a property
// call on a source path whose first argument is an arrow with an identifier
// first parameter and an expression body.
func arrowItemPredicate(call *ast.Node) (sourceVar, itemVar string, cond *jsObj, ok bool) {
	if !ast.IsPropertyAccessExpression(call.Expression()) {
		return
	}
	sourceVar, ok = extractSourcePath(call.Expression().Expression())
	if !ok {
		return
	}
	ok = false
	args := call.Arguments()
	if len(args) == 0 || !ast.IsArrowFunction(args[0]) {
		return
	}
	fn := args[0]
	params := fn.Parameters()
	if len(params) == 0 || !ast.IsIdentifier(params[0].Name()) {
		return
	}
	if ast.IsBlock(fn.Body()) {
		return
	}
	return sourceVar, params[0].Name().Text(), parseCondition(fn.Body()), true
}

func (c *dslCtx) extractArrayFilter(call *ast.Node, outputVar string) *jsObj {
	sourceVar, itemVar, cond, ok := arrowItemPredicate(call)
	if !ok {
		return nil
	}
	return newObj("type", "filter", "sourceVar", sourceVar, "itemVar", itemVar, "condition", cond, "outputVar", outputVar)
}

func (c *dslCtx) extractArrayPredicate(call *ast.Node, outputVar string) *jsObj {
	mode := propertyCallName(call)
	sourceVar, itemVar, cond, ok := arrowItemPredicate(call)
	if !ok {
		return nil
	}
	return newObj("type", "arrayPredicate", "mode", mode, "sourceVar", sourceVar, "itemVar", itemVar, "condition", cond, "outputVar", outputVar)
}

// callOf is `await call` or `call`.
func callOf(expr *ast.Node) *ast.Node {
	if ast.IsAwaitExpression(expr) {
		if ast.IsCallExpression(expr.Expression()) {
			return expr.Expression()
		}
		return nil
	}
	if ast.IsCallExpression(expr) {
		return expr
	}
	return nil
}

func (c *dslCtx) extractFanoutBodyStep(stmt *ast.Node, body *[]*jsObj) {
	if ast.IsVariableStatement(stmt) {
		_, decls := declarations(stmt)
		if len(decls) != 1 {
			return
		}
		decl := decls[0]
		call := awaitedCall(decl.Initializer())
		if call == nil || (!isWorkflowDoCall(call) && !isScenarioStepCall(call)) {
			return
		}
		var varName any = jsUndefined
		if ast.IsIdentifier(decl.Name()) {
			varName = decl.Name().Text()
		}
		var step *jsObj
		if isScenarioStepCall(call) {
			step = c.extractScenarioStep(call, varName)
		} else {
			step = c.extractRpcStep(call, varName)
		}
		if step == nil {
			return
		}
		if name, ok := varName.(string); ok {
			c.touchType(decl)
			c.outputVars[name] = true
		}
		*body = append(*body, step)
		return
	}
	if !ast.IsExpressionStatement(stmt) && !ast.IsReturnStatement(stmt) {
		return
	}
	expr := stmt.Expression()
	if expr == nil {
		return
	}
	call := callOf(expr)
	if call == nil {
		return
	}
	switch {
	case isWorkflowSleepCall(call):
		if st := c.extractSleepStep(call); st != nil {
			*body = append(*body, st)
		}
	case isWorkflowSuspendCall(call):
		if st := c.extractSuspendStep(call); st != nil {
			*body = append(*body, st)
		}
	case isWorkflowMilestoneCall(call):
		if st := c.extractMilestoneStep(call); st != nil {
			*body = append(*body, st)
		}
	case isScenarioStepCall(call):
		if st := c.extractScenarioStep(call, jsUndefined); st != nil {
			*body = append(*body, st)
		}
	case isWorkflowDoCall(call):
		if st := c.extractRpcStep(call, jsUndefined); st != nil {
			*body = append(*body, st)
		}
	}
}

func (c *dslCtx) extractParallelFanout(call *ast.Node) *jsObj {
	mapCall := call.Arguments()[0]
	if !ast.IsCallExpression(mapCall) || !ast.IsPropertyAccessExpression(mapCall.Expression()) {
		return nil
	}
	sourceVar, ok := extractSourcePath(mapCall.Expression().Expression())
	if !ok {
		return nil
	}
	margs := mapCall.Arguments()
	if len(margs) == 0 || !ast.IsArrowFunction(margs[0]) {
		return nil
	}
	mapFn := margs[0]
	params := mapFn.Parameters()
	if len(params) == 0 || !ast.IsIdentifier(params[0].Name()) {
		return nil
	}
	itemVar := params[0].Name().Text()
	child := c.child(itemVar)
	body := []*jsObj{}
	if fb := mapFn.Body(); ast.IsBlock(fb) {
		for _, stmt := range fb.Statements() {
			child.extractFanoutBodyStep(stmt, &body)
		}
	} else if doCall := callOf(fb); doCall != nil {
		if isScenarioStepCall(doCall) {
			if st := child.extractScenarioStep(doCall, jsUndefined); st != nil {
				body = append(body, st)
			}
		} else if isWorkflowDoCall(doCall) {
			if st := child.extractRpcStep(doCall, jsUndefined); st != nil {
				body = append(body, st)
			}
		}
	}
	if len(body) == 0 {
		return nil
	}
	return newObj("type", "fanout", "sourceVar", sourceVar, "itemVar", itemVar, "mode", "parallel", "body", body)
}

func (c *dslCtx) extractParallelGroup(call *ast.Node) *jsObj {
	args := call.Arguments()
	if len(args) == 0 || !ast.IsArrayLiteralExpression(args[0]) {
		return nil
	}
	children := []*jsObj{}
	for _, el := range args[0].Elements() {
		if !ast.IsCallExpression(el) {
			continue
		}
		var st *jsObj
		if isScenarioStepCall(el) {
			st = c.extractScenarioStep(el, jsUndefined)
		} else if isWorkflowDoCall(el) {
			st = c.extractRpcStep(el, jsUndefined)
		}
		if st != nil {
			children = append(children, st)
		}
	}
	if len(children) == 0 {
		return nil
	}
	return newObj("type", "parallel", "children", children)
}

func containsWorkflowCall(n *ast.Node) bool {
	found := false
	var visit func(x *ast.Node)
	visit = func(x *ast.Node) {
		if found {
			return
		}
		if ast.IsCallExpression(x) {
			if isWorkflowDoCall(x) || isScenarioStepCall(x) || isWorkflowSleepCall(x) ||
				isWorkflowSuspendCall(x) || isWorkflowApprovalCall(x) || isWorkflowExpectEventuallyCall(x) {
				found = true
				return
			}
		}
		x.ForEachChild(func(ch *ast.Node) bool { visit(ch); return false })
	}
	visit(n)
	return found
}

// sleepTimeBetween reads a `timeBetween` from an `await workflow.sleep(...)`
// expression statement; ok is false when the statement is not one or its
// duration does not resolve.
func (c *dslCtx) sleepTimeBetween(stmt *ast.Node) (string, bool) {
	if !ast.IsExpressionStatement(stmt) {
		return "", false
	}
	call := awaitedCall(stmt.Expression())
	if call == nil || !isWorkflowSleepCall(call) {
		return "", false
	}
	args := call.Arguments()
	if len(args) < 2 {
		return "", false
	}
	if v, ok := extractNumberLiteral(args[1]); ok {
		return string(jsjson.MustMarshal(v)) + "ms", true
	}
	if v, err := c.stringLiteral(args[1]); err == nil {
		return v, true
	}
	return "", false
}

func (c *dslCtx) extractSequentialFanout(stmt *ast.Node, reason *string) *jsObj {
	if !isSequentialFanout(stmt) {
		return nil
	}
	itemVar, sourceVar, ok := extractForOfVariable(stmt)
	if !ok {
		return nil
	}
	loopBody := stmt.AsForInOrOfStatement().Statement
	bodyStatements := []*ast.Node{loopBody}
	if ast.IsBlock(loopBody) {
		bodyStatements = loopBody.Statements()
	}
	body := []*jsObj{}
	var timeBetween any = jsUndefined
	child := c.child(itemVar)
	for _, st := range bodyStatements {
		child.extractFanoutBodyStep(st, &body)
		if v, ok := c.sleepTimeBetween(st); ok {
			timeBetween = v
		}
		if ast.IsIfStatement(st) {
			if then := st.AsIfStatement().ThenStatement; ast.IsBlock(then) {
				for _, ts := range then.Statements() {
					if v, ok := c.sleepTimeBetween(ts); ok {
						timeBetween = v
					}
				}
			}
		}
	}
	if len(body) == 0 {
		branching := false
		for _, st := range bodyStatements {
			if ast.IsIfStatement(st) || ast.IsSwitchStatement(st) {
				branching = true
			}
		}
		if branching {
			*reason = "its body only calls 'workflow.do' inside an if/switch, and a DSL fanout body is a flat list of steps with no branch member — the DSL cannot express a per-item condition. Use pikkuWorkflowComplexFunc, or lift the condition out of the loop."
		} else {
			*reason = "its body contains no 'workflow.do' call the DSL can model. Use pikkuWorkflowComplexFunc for a loop that does other work."
		}
		return nil
	}
	return newObj("type", "fanout", "sourceVar", sourceVar, "itemVar", itemVar, "mode", "sequential", "body", body, "timeBetween", timeBetween)
}

func (c *dslCtx) extractOutputBinding(expr *ast.Node) *jsObj {
	if ast.IsPropertyAccessExpression(expr) {
		propPath := expr.Name().Text()
		// TS compares a null objName to a null inputParamName, so a non-identifier
		// receiver in a workflow without an input parameter reads as input.
		if !ast.IsIdentifier(expr.Expression()) && c.inputParamName == nil {
			return newObj("from", "input", "path", propPath)
		}
		if ast.IsIdentifier(expr.Expression()) {
			objName := expr.Expression().Text()
			if c.outputVars[objName] {
				return newObj("from", "outputVar", "name", objName, "path", propPath)
			}
			if c.contextVars.Has(objName) {
				return newObj("from", "stateVar", "name", objName, "path", propPath)
			}
			if c.isInputParam(objName) {
				return newObj("from", "input", "path", propPath)
			}
		}
	}
	if ast.IsIdentifier(expr) {
		name := expr.Text()
		if c.outputVars[name] {
			return newObj("from", "outputVar", "name", name)
		}
		if c.contextVars.Has(name) {
			return newObj("from", "stateVar", "name", name)
		}
		if c.isInputParam(name) {
			return newObj("from", "input", "path", name)
		}
	}
	if v, ok := literalScalar(expr); ok {
		return newObj("from", "literal", "value", v)
	}
	return newObj("from", "expression", "expression", getSourceText(expr))
}

func (c *dslCtx) extractReturn(stmt *ast.Node) *jsObj {
	expr := stmt.Expression()
	if expr == nil {
		return nil
	}
	if call := callOf(expr); call != nil {
		if isWorkflowDoCall(call) {
			if isInlineDoCall(call) {
				return c.extractInlineStep(call)
			}
			return c.extractRpcStep(call, jsUndefined)
		}
		if isWorkflowSleepCall(call) {
			return c.extractSleepStep(call)
		}
	}
	if ast.IsIdentifier(expr) {
		name := expr.Text()
		if c.outputVars[name] || c.contextVars.Has(name) {
			return newObj("type", "return", "outputs", newObj(), "spread", []string{name})
		}
		return nil
	}
	if !ast.IsObjectLiteralExpression(expr) {
		return nil
	}
	outputs := newObj()
	spread := []string{}
	for _, p := range expr.Properties() {
		switch {
		case ast.IsPropertyAssignment(p) || ast.IsShorthandPropertyAssignment(p):
			if !ast.IsIdentifier(p.Name()) {
				continue
			}
			propName := p.Name().Text()
			var binding *jsObj
			if ast.IsShorthandPropertyAssignment(p) {
				switch {
				case c.outputVars[propName]:
					binding = newObj("from", "outputVar", "name", propName)
				case c.contextVars.Has(propName):
					binding = newObj("from", "stateVar", "name", propName)
				default:
					binding = newObj("from", "input", "path", propName)
				}
			} else {
				binding = c.extractOutputBinding(p.Initializer())
			}
			outputs.Set(propName, binding)
		case ast.IsSpreadAssignment(p) && ast.IsIdentifier(p.Expression()):
			spread = append(spread, p.Expression().Text())
		}
	}
	if outputs.DefinedLen() == 0 && len(spread) == 0 {
		return nil
	}
	ret := newObj("type", "return", "outputs", outputs)
	if len(spread) > 0 {
		ret.Set("spread", spread)
	}
	return ret
}

// extractInputSources returns a jsObj of input sources, "passthrough" or
// undefined.
func (c *dslCtx) extractInputSources(n *ast.Node) any {
	if ast.IsIdentifier(n) && (c.isInputParam(n.Text()) || c.outputVars[n.Text()]) {
		return "passthrough"
	}
	if !ast.IsObjectLiteralExpression(n) {
		return jsUndefined
	}
	inputs := newObj()
	for _, p := range n.Properties() {
		if !ast.IsPropertyAssignment(p) && !ast.IsShorthandPropertyAssignment(p) {
			continue
		}
		if !ast.IsIdentifier(p.Name()) {
			continue
		}
		propName := p.Name().Text()
		var source *jsObj
		if ast.IsShorthandPropertyAssignment(p) {
			switch {
			case c.loopVars[propName]:
				source = newObj("from", "item", "path", propName)
			case c.outputVars[propName]:
				source = newObj("from", "outputVar", "name", propName)
			default:
				if v, ok := c.resolveConstantValue(p.Name()); ok {
					source = newObj("from", "literal", "value", v)
				} else {
					source = newObj("from", "input", "path", propName)
				}
			}
		} else {
			source = c.extractInputSource(p.Initializer())
		}
		if source != nil {
			inputs.Set(propName, source)
		}
	}
	if inputs.DefinedLen() == 0 {
		return jsUndefined
	}
	return inputs
}

func inputSourceToInlineValue(src *jsObj) any {
	from, _ := src.Str("from")
	switch from {
	case "literal":
		return src.Get("value")
	case "input":
		return newObj("$ref", "trigger", "path", src.Get("path"))
	case "outputVar":
		return newObj("$ref", src.Get("name"), "path", src.Get("path"))
	case "item":
		return newObj("$ref", "$item", "path", src.Get("path"))
	case "template":
		exprs := src.Get("expressions").([]*jsObj)
		vals := make([]any, len(exprs))
		for i, e := range exprs {
			vals[i] = inputSourceToInlineValue(e)
		}
		return newObj("$template", newObj("parts", src.Get("parts"), "expressions", vals))
	}
	return jsUndefined
}

func (c *dslCtx) extractInputSource(n *ast.Node) *jsObj {
	if ast.IsPropertyAccessExpression(n) && ast.IsIdentifier(n.Expression()) {
		objName := n.Expression().Text()
		propName := n.Name().Text()
		if c.isInputParam(objName) {
			return newObj("from", "input", "path", propName)
		}
		if c.loopVars[objName] {
			return newObj("from", "item", "path", propName)
		}
		if c.outputVars[objName] {
			return newObj("from", "outputVar", "name", objName, "path", propName)
		}
	}
	if ast.IsIdentifier(n) {
		name := n.Text()
		if c.loopVars[name] {
			return newObj("from", "item", "path", name)
		}
		if c.outputVars[name] {
			return newObj("from", "outputVar", "name", name)
		}
		if v, ok := c.resolveConstantValue(n); ok {
			return newObj("from", "literal", "value", v)
		}
		return newObj("from", "input", "path", name)
	}
	if v, ok := literalScalar(n); ok {
		return newObj("from", "literal", "value", v)
	}
	if ast.IsObjectLiteralExpression(n) {
		obj := newObj()
		for _, p := range n.Properties() {
			if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) {
				if src := c.extractInputSource(p.Initializer()); src != nil {
					obj.Set(p.Name().Text(), inputSourceToInlineValue(src))
				}
			}
		}
		return newObj("from", "literal", "value", obj)
	}
	if ast.IsArrayLiteralExpression(n) {
		arr := []any{}
		for _, el := range n.Elements() {
			if src := c.extractInputSource(el); src != nil {
				arr = append(arr, inputSourceToInlineValue(src))
			}
		}
		return newObj("from", "literal", "value", arr)
	}
	if ast.IsNoSubstitutionTemplateLiteral(n) {
		return newObj("from", "literal", "value", n.Text())
	}
	if ast.IsTemplateExpression(n) {
		te := n.AsTemplateExpression()
		parts := []string{te.Head.Text()}
		exprs := []*jsObj{}
		for _, span := range te.TemplateSpans.Nodes {
			sp := span.AsTemplateSpan()
			if src := c.extractInputSource(sp.Expression); src != nil {
				exprs = append(exprs, src)
			} else {
				exprs = append(exprs, newObj("from", "literal", "value", getSourceText(sp.Expression)))
			}
			parts = append(parts, sp.Literal.Text())
		}
		return newObj("from", "template", "parts", parts, "expressions", exprs)
	}
	return nil
}

// resolveConstantValue resolves an identifier naming a `const` with a fully
// literal initializer to that value.
func (c *dslCtx) resolveConstantValue(id *ast.Node) (any, bool) {
	sym := c.s.Checker.GetSymbolAtLocation(id)
	if sym == nil {
		return nil, false
	}
	decl := sym.ValueDeclaration
	if decl == nil && len(sym.Declarations) > 0 {
		decl = sym.Declarations[0]
	}
	if decl == nil || !ast.IsVariableDeclaration(decl) {
		return nil, false
	}
	list := decl.Parent
	if list == nil || !ast.IsVariableDeclarationList(list) || list.Flags&ast.NodeFlagsConst == 0 {
		return nil, false
	}
	if decl.Initializer() == nil {
		return nil, false
	}
	return extractLiteralValue(decl.Initializer())
}

// extractLiteralValue returns the JS value of a literal expression (null is
// Go nil), or ok=false for undefined.
func extractLiteralValue(expr *ast.Node) (any, bool) {
	if v, ok := literalScalar(expr); ok {
		return v, true
	}
	if ast.IsArrayLiteralExpression(expr) {
		vals := []any{}
		for _, el := range expr.Elements() {
			v, ok := extractLiteralValue(el)
			if !ok {
				return nil, false
			}
			vals = append(vals, v)
		}
		return vals, true
	}
	if ast.IsObjectLiteralExpression(expr) {
		obj := newObj()
		for _, p := range expr.Properties() {
			if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
				return nil, false
			}
			v, ok := extractLiteralValue(p.Initializer())
			if !ok {
				return nil, false
			}
			obj.Set(p.Name().Text(), v)
		}
		return obj, true
	}
	return nil, false
}

func (s *Context) inferSimpleType(t *checker.Type) string {
	typeStr := s.typeToString(t)
	switch {
	case typeStr == "string", typeStr == "number", typeStr == "boolean":
		return typeStr
	case strings.HasSuffix(typeStr, "[]") || strings.HasPrefix(typeStr, "Array<"):
		return "array"
	}
	return "object"
}

// touchType asks the checker for a node's type and drops the answer. The TS
// extractor records every step output's type (outputVars, arrayVars) and never
// reads it back, so the port keeps no type; but the lookup decides when the
// checker first creates the literal types in it, and union members print, and
// so become schema enums, in that creation order (tsutil.TypeToString).
func (c *dslCtx) touchType(n *ast.Node) {
	c.s.Checker.GetTypeAtLocation(n)
}
