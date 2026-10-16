package visit

import (
	"regexp"
	"strconv"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Port of add/add-workflow-graph.ts.

func init() {
	Register(Visitor{Name: "addWorkflowGraph", Phase: PhaseRoutes, Order: OrderAddWorkflowGraph, Visit: (*Context).addWorkflowGraph})
}

var templateRefPattern = regexp.MustCompile(`\$(\d+)`)

func unwrapAsParen(n *ast.Node) *ast.Node {
	for ast.IsAsExpression(n) || ast.IsParenthesizedExpression(n) {
		n = n.Expression()
	}
	return n
}

// graphPropKey is an identifier or string-literal property name, or "".
func graphPropKey(p *ast.Node) (string, bool) {
	name := p.Name()
	if ast.IsIdentifier(name) || ast.IsStringLiteral(name) {
		return name.Text(), true
	}
	return "", false
}

func stringArg(args []*ast.Node, i int) any {
	if len(args) > i && ast.IsStringLiteral(args[i]) {
		return args[i].Text()
	}
	return jsUndefined
}

// extractGraphAstValue is add-workflow-graph.ts extractAstValue; it returns
// jsUndefined for anything it cannot read.
func extractGraphAstValue(expr *ast.Node, refParam string, templateParam, itemParam string) any {
	expr = unwrapAsParen(expr)
	if v, ok := literalScalar(expr); ok {
		return v
	}
	if ast.IsCallExpression(expr) && ast.IsIdentifier(expr.Expression()) {
		callee := expr.Expression().Text()
		args := expr.Arguments()
		switch {
		case callee == refParam:
			nodeID := "unknown"
			if len(args) > 0 && ast.IsStringLiteral(args[0]) {
				nodeID = args[0].Text()
			}
			return newObj("$ref", nodeID, "path", stringArg(args, 1))
		case itemParam != "" && callee == itemParam:
			return newObj("$ref", "$item", "path", stringArg(args, 0))
		case templateParam != "" && callee == templateParam:
			templateStr := ""
			if len(args) > 0 && ast.IsStringLiteral(args[0]) {
				templateStr = args[0].Text()
			}
			var refs []*jsObj
			if len(args) > 1 && ast.IsArrayLiteralExpression(args[1]) {
				for _, el := range args[1].Elements() {
					if o, ok := extractGraphAstValue(el, refParam, templateParam, itemParam).(*jsObj); ok {
						if _, has := o.rec.Get("$ref"); has {
							refs = append(refs, o)
						}
					}
				}
			}
			parts := []string{}
			exprs := []*jsObj{}
			last := 0
			for _, m := range templateRefPattern.FindAllStringSubmatchIndex(templateStr, -1) {
				parts = append(parts, templateStr[last:m[0]])
				idx, _ := strconv.Atoi(templateStr[m[2]:m[3]])
				if idx < len(refs) {
					exprs = append(exprs, refs[idx])
				} else {
					exprs = append(exprs, newObj("$ref", "unknown"))
				}
				last = m[1]
			}
			parts = append(parts, templateStr[last:])
			return newObj("$template", newObj("parts", parts, "expressions", exprs))
		}
	}
	if ast.IsArrayLiteralExpression(expr) {
		vals := []any{}
		for _, el := range expr.Elements() {
			vals = append(vals, extractGraphAstValue(el, refParam, templateParam, itemParam))
		}
		return vals
	}
	if ast.IsObjectLiteralExpression(expr) {
		obj := newObj()
		for _, p := range expr.Properties() {
			if !ast.IsPropertyAssignment(p) {
				continue
			}
			if key, ok := graphPropKey(p); ok && key != "" {
				obj.Set(key, extractGraphAstValue(p.Initializer(), refParam, templateParam, itemParam))
			}
		}
		return obj
	}
	if ast.IsPrefixUnaryExpression(expr) {
		pu := expr.AsPrefixUnaryExpression()
		if pu.Operator == ast.KindMinusToken && ast.IsNumericLiteral(pu.Operand) {
			return -jsNumber(pu.Operand.Text())
		}
	}
	return jsUndefined
}

func paramName(fn *ast.Node, i int) (string, bool) {
	params := fn.Parameters()
	if len(params) > i && ast.IsIdentifier(params[i].Name()) {
		return params[i].Name().Text(), true
	}
	return "", false
}

func extractGraphInputMapping(n *ast.Node) *jsObj {
	input := newObj()
	if !ast.IsArrowFunction(n) {
		return input
	}
	var bodyObj *ast.Node
	body := n.Body()
	switch {
	case ast.IsObjectLiteralExpression(body):
		bodyObj = body
	case ast.IsParenthesizedExpression(body):
		if ast.IsObjectLiteralExpression(body.Expression()) {
			bodyObj = body.Expression()
		}
	case ast.IsBlock(body):
		for _, st := range body.Statements() {
			if ast.IsReturnStatement(st) && st.Expression() != nil && ast.IsObjectLiteralExpression(st.Expression()) {
				bodyObj = st.Expression()
			}
		}
	}
	if bodyObj == nil {
		return input
	}
	refParam, ok := paramName(n, 0)
	if !ok {
		refParam = "ref"
	}
	templateParam, ok := paramName(n, 1)
	if !ok {
		templateParam = "template"
	}
	itemParam, _ := paramName(n, 2)
	for _, p := range bodyObj.Properties() {
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		key, ok := graphPropKey(p)
		if !ok || key == "" {
			continue
		}
		if v := extractGraphAstValue(p.Initializer(), refParam, templateParam, itemParam); !isUndefined(v) {
			input.Set(key, v)
		}
	}
	return input
}

func extractForEachConfig(n *ast.Node) any {
	n = unwrapAsParen(n)
	if ast.IsStringLiteral(n) {
		return newObj("$ref", n.Text())
	}
	if ast.IsArrowFunction(n) {
		refParam, ok := paramName(n, 0)
		if !ok {
			refParam = "ref"
		}
		body := n.Body()
		if ast.IsBlock(body) {
			for _, st := range body.Statements() {
				if ast.IsReturnStatement(st) && st.Expression() != nil {
					body = st.Expression()
				}
			}
		}
		if !ast.IsExpression(body) {
			return jsUndefined
		}
		if o, ok := extractGraphAstValue(body, refParam, "", "").(*jsObj); ok {
			if _, isStr := o.Str("$ref"); isStr {
				return o
			}
		}
	}
	return jsUndefined
}

func stringLiterals(arr *ast.Node) []string {
	out := []string{}
	for _, el := range arr.Elements() {
		if ast.IsStringLiteral(el) {
			out = append(out, el.Text())
		}
	}
	return out
}

func extractNextConfig(n *ast.Node) any {
	n = unwrapAsParen(n)
	switch {
	case ast.IsStringLiteral(n):
		return n.Text()
	case ast.IsArrayLiteralExpression(n):
		return stringLiterals(n)
	case ast.IsObjectLiteralExpression(n):
		res := newObj()
		for _, p := range n.Properties() {
			if !ast.IsPropertyAssignment(p) {
				continue
			}
			key, ok := graphPropKey(p)
			if !ok || key == "" {
				continue
			}
			init := p.Initializer()
			if ast.IsStringLiteral(init) {
				res.Set(key, init.Text())
			} else if ast.IsArrayLiteralExpression(init) {
				res.Set(key, stringLiterals(init))
			}
		}
		return res
	}
	return jsUndefined
}

func computeEntryNodeIds(nodes *jsObj) []string {
	incoming := map[string]bool{}
	addTargets := func(v any) {
		switch t := v.(type) {
		case string:
			incoming[t] = true
		case []string:
			for _, x := range t {
				incoming[x] = true
			}
		}
	}
	keys := nodes.rec.Keys()
	for _, k := range keys {
		node := nodes.Get(k).(*jsObj)
		next := node.Get("next")
		switch t := next.(type) {
		case string:
			if t != "" {
				incoming[t] = true
			}
		case []string:
			addTargets(t)
		case *jsObj:
			for _, nk := range t.rec.Keys() {
				addTargets(t.Get(nk))
			}
		}
	}
	out := []string{}
	for _, k := range keys {
		if !incoming[k] {
			out = append(out, k)
		}
	}
	return out
}

func (s *Context) addWorkflowGraph(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != "pikkuWorkflowGraph" {
		return
	}
	args := node.Arguments()
	if len(args) == 0 {
		s.Log.Critical(diag.MissingFunc, "pikkuWorkflowGraph requires an argument")
		return
	}
	firstArg := args[0]
	if !ast.IsObjectLiteralExpression(firstArg) {
		s.Log.Critical(diag.MissingFunc, "pikkuWorkflowGraph requires an object argument")
		return
	}

	var name, exportedName string
	var description, tags, notes any = jsUndefined, jsUndefined, jsUndefined
	var disabled bool
	var nodesNode, configNode *ast.Node
	for _, p := range firstArg.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		init := p.Initializer()
		switch p.Name().Text() {
		case "name":
			name, _ = s.extractStringLiteral(init)
		case "description":
			if v, err := s.extractStringLiteral(init); err == nil {
				description = v
			}
		case "disabled":
			if init.Kind == ast.KindTrueKeyword {
				disabled = true
			}
		case "tags":
			if ast.IsArrayLiteralExpression(init) {
				tags = stringLiterals(init)
			}
		case "notes":
			if ast.IsArrayLiteralExpression(init) {
				notes = stringLiterals(init)
			}
		case "nodes":
			if ast.IsObjectLiteralExpression(init) {
				nodesNode = init
			}
		case "config":
			if ast.IsObjectLiteralExpression(init) {
				configNode = init
			}
		}
	}
	if parent := node.Parent; parent != nil && ast.IsVariableDeclaration(parent) && ast.IsIdentifier(parent.Name()) {
		exportedName = parent.Name().Text()
	}
	workflowName := name
	if workflowName == "" {
		workflowName = exportedName
	}
	if workflowName == "" {
		s.Log.Critical(diag.MissingName, "pikkuWorkflowGraph requires a name property or exported variable name")
		return
	}

	nodes := newObj()
	if nodesNode != nil {
		s.extractGraphNodes(nodesNode, configNode, nodes)
	}

	serialized := newObj(
		"name", workflowName,
		"pikkuFuncId", workflowName,
		"source", "graph",
		"description", description,
		"tags", tags,
		"notes", notes,
		"nodes", nodes,
		"entryNodeIds", computeEntryNodeIds(nodes),
	)
	if disabled {
		return
	}
	if exportedName == "" {
		exportedName = workflowName
	}
	s.State.Workflows.GraphMeta.Set(workflowName, serialized.raw())
	s.State.Workflows.GraphFiles.Set(workflowName, state.FileExport{
		Path: ast.GetSourceFileOfNode(node).FileName(), ExportedName: exportedName,
	})
}

func (s *Context) extractGraphNodes(nodesNode, configNode *ast.Node, nodes *jsObj) {
	st := s.State
	rpcByNode := newObj()
	for _, p := range nodesNode.Properties() {
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		nodeID, ok := graphPropKey(p)
		if !ok || nodeID == "" {
			continue
		}
		rpcName, err := s.extractStringLiteral(p.Initializer())
		if err != nil || rpcName == "" {
			continue
		}
		rpcByNode.Set(nodeID, rpcName)
		st.RPC.InvokedFunctions.Add(rpcName)
		if f, ok := st.Functions.Files.Get(rpcName); ok && !st.RPC.InternalFiles.Has(rpcName) {
			st.RPC.InternalFiles.Set(rpcName, f)
		}
	}
	for _, nodeID := range rpcByNode.rec.Keys() {
		nodes.Set(nodeID, newObj(
			"nodeId", nodeID,
			"rpcName", rpcByNode.Get(nodeID),
			"input", newObj(),
			"forEach", jsUndefined,
			"mode", jsUndefined,
			"next", jsUndefined,
			"onError", jsUndefined,
			"retries", jsUndefined,
			"retryDelay", jsUndefined,
			"notes", jsUndefined,
		))
	}
	if configNode == nil {
		return
	}
	for _, p := range configNode.Properties() {
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		nodeID, ok := graphPropKey(p)
		if !ok || nodeID == "" {
			continue
		}
		target, ok := nodes.Get(nodeID).(*jsObj)
		if !ok || !ast.IsObjectLiteralExpression(p.Initializer()) {
			continue
		}
		var next, onError, forEach, mode, retries, retryDelay, notes any = jsUndefined, jsUndefined, jsUndefined, jsUndefined, jsUndefined, jsUndefined, jsUndefined
		input := newObj()
		for _, cp := range p.Initializer().Properties() {
			if !ast.IsPropertyAssignment(cp) || !ast.IsIdentifier(cp.Name()) {
				continue
			}
			init := cp.Initializer()
			switch cp.Name().Text() {
			case "next":
				next = extractNextConfig(init)
			case "onError":
				onError = extractNextConfig(init)
			case "input":
				input = extractGraphInputMapping(init)
			case "forEach":
				forEach = extractForEachConfig(init)
			case "mode":
				if v, err := s.extractStringLiteral(init); err == nil {
					mode = v
				}
			case "retries":
				if ast.IsNumericLiteral(init) {
					retries = jsNumber(init.Text())
				}
			case "retryDelay":
				if ast.IsNumericLiteral(init) {
					retryDelay = jsNumber(init.Text())
				} else if ast.IsStringLiteral(init) {
					retryDelay = init.Text()
				}
			case "notes":
				if v, err := s.extractStringLiteral(init); err == nil {
					notes = v
				}
			}
		}
		target.Set("next", next)
		target.Set("onError", onError)
		target.Set("input", input)
		target.Set("forEach", forEach)
		target.Set("mode", mode)
		target.Set("retries", retries)
		target.Set("retryDelay", retryDelay)
		target.Set("notes", notes)
	}
}
