package finalize

import (
	"regexp"
	"strconv"
	"strings"
)

// Port of utils/workflow/graph/convert-dsl-to-graph.ts and
// utils/workflow/derive-workflow-plan.ts. Steps and nodes are JS values
// (*Object); members TS assigns `undefined` are set to Undefined so they keep
// their key position should a later step assign them.

func makeNodeId(step *Object, index int, prefix string) string {
	if step.Has("stepName") && Truthy(step.Get("stepName")) {
		return TemplateString(step.Get("stepName"))
	}
	return prefix + "_" + strconv.Itoa(index)
}

func isTerminalFlow(node *Object) bool {
	if node.Has("flow") {
		f := node.Get("flow")
		return f == "cancel" || f == "return"
	}
	return false
}

func convertInputSource(source *Object) any {
	if source == nil {
		return Undefined
	}
	switch source.Get("from") {
	case "literal":
		return source.Get("value")
	case "input":
		return Obj("$ref", "trigger", "path", source.Get("path"))
	case "outputVar":
		return Obj("$ref", source.Get("name"), "path", source.Get("path"))
	case "item":
		return Obj("$ref", "$item", "path", source.Get("path"))
	case "stateVar":
		return Obj("$state", source.Get("name"), "path", source.Get("path"))
	case "template":
		var exprs any = Undefined
		if arr, ok := source.Get("expressions").([]any); ok {
			out := make([]any, len(arr))
			for i, e := range arr {
				out[i] = convertInputSource(AsObject(e))
			}
			exprs = out
		}
		return Obj("$template", Obj("parts", source.Get("parts"), "expressions", exprs))
	}
	return source.Get("value")
}

func convertInputs(node, step *Object) {
	inputs := step.Get("inputs")
	if !Truthy(inputs) {
		return
	}
	if inputs == "passthrough" {
		node.Set("input", Obj("$passthrough", Obj("$ref", "trigger")))
		return
	}
	in := NewObject()
	if o := AsObject(inputs); o != nil {
		for _, k := range o.Keys() {
			in.Set(k, convertInputSource(AsObject(o.Get(k))))
		}
	}
	node.Set("input", in)
}

func nodeID(n *Object) string { return TemplateString(n.Get("nodeId")) }

func stepsOf(v any) []*Object {
	arr := AsArray(v)
	out := make([]*Object, 0, len(arr))
	for _, x := range arr {
		o := AsObject(x)
		if o == nil {
			o = NewObject()
		}
		out = append(out, o)
	}
	return out
}

// linkToNext sets `next` on the last node of a sub-sequence, unless it has
// one or is terminal.
func linkToNext(nodes []*Object, next any) {
	if !Truthy(next) || len(nodes) == 0 {
		return
	}
	last := nodes[len(nodes)-1]
	if !Truthy(last.Get("next")) && !isTerminalFlow(last) {
		last.Set("next", next)
	}
}

func convertStepToNode(step *Object, index int, steps []*Object, prefix string) []*Object {
	nodeId := makeNodeId(step, index, prefix)
	var next any = Undefined
	if index < len(steps)-1 {
		next = makeNodeId(steps[index+1], index+1, prefix)
	}

	switch step.Get("type") {
	case "rpc":
		node := Obj("nodeId", nodeId, "rpcName", step.Get("rpcName"), "stepName", step.Get("stepName"), "next", next)
		if Truthy(step.Get("virtualUser")) {
			node.Set("virtualUser", step.Get("virtualUser"))
		}
		if Truthy(step.Get("expectEventually")) {
			node.Set("expectEventually", true)
		}
		convertInputs(node, step)
		if Truthy(step.Get("outputVar")) {
			node.Set("outputVar", step.Get("outputVar"))
		}
		if opts := step.Get("options"); Truthy(opts) {
			o := AsObject(opts)
			node.Set("options", Obj("retries", o.Get("retries"), "retryDelay", o.Get("retryDelay")))
			if o.Get("compensate") == false {
				node.Set("compensate", false)
			}
		}
		return []*Object{node}

	case "scenarioStep":
		node := Obj("nodeId", nodeId, "rpcName", step.Get("stepFunc"), "stepName", step.Get("stepName"),
			"scenarioStepPhase", step.Get("phase"), "next", next)
		if Truthy(step.Get("virtualUser")) {
			node.Set("virtualUser", step.Get("virtualUser"))
		}
		convertInputs(node, step)
		if Truthy(step.Get("outputVar")) {
			node.Set("outputVar", step.Get("outputVar"))
		}
		if opts := step.Get("options"); Truthy(opts) {
			o := AsObject(opts)
			node.Set("options", Obj("retries", o.Get("retries"), "retryDelay", o.Get("retryDelay")))
		}
		return []*Object{node}

	case "sleep":
		return []*Object{Obj("nodeId", nodeId, "flow", "sleep", "stepName", step.Get("stepName"),
			"duration", step.Get("duration"), "expression", step.Get("expression"), "next", next)}

	case "suspend":
		return []*Object{Obj("nodeId", nodeId, "flow", "suspend", "reason", step.Get("reason"), "next", next)}

	case "milestone":
		return []*Object{Obj("nodeId", nodeId, "flow", "milestone", "reason", step.Get("name"), "next", next)}

	case "approval":
		return []*Object{Obj("nodeId", nodeId, "flow", "approval", "reason", step.Get("reason"),
			"outputVar", step.Get("outputVar"), "expiry", step.Get("expiry"), "next", next)}

	case "inline":
		return []*Object{Obj("nodeId", nodeId, "flow", "inline", "description", step.Get("description"), "next", next)}

	case "branch":
		var branchNodes []*Object
		branches := []any{}
		for i, b := range stepsOf(step.Get("branches")) {
			bs := convertStepsToNodes(stepsOf(b.Get("steps")), nodeId+"_branch"+strconv.Itoa(i))
			if len(bs) > 0 {
				branches = append(branches, Obj("condition", b.Get("condition"), "entry", bs[0].Get("nodeId")))
				linkToNext(bs, next)
				branchNodes = append(branchNodes, bs...)
			}
		}
		var elseNodes []*Object
		if Truthy(step.Get("elseSteps")) {
			elseNodes = convertStepsToNodes(stepsOf(step.Get("elseSteps")), nodeId+"_else")
		}
		linkToNext(elseNodes, next)
		var elseEntry any = Undefined
		if len(elseNodes) > 0 {
			elseEntry = elseNodes[0].Get("nodeId")
		}
		node := Obj("nodeId", nodeId, "flow", "branch", "branches", branches, "elseEntry", elseEntry, "next", next)
		return append(append([]*Object{node}, branchNodes...), elseNodes...)

	case "switch":
		var caseNodes []*Object
		cases := []any{}
		var falling []*Object
		for i, c := range stepsOf(step.Get("cases")) {
			cs := convertStepsToNodes(stepsOf(c.Get("steps")), nodeId+"_case"+strconv.Itoa(i))
			if len(cs) == 0 {
				falling = append(falling, Obj("value", c.Get("value"), "expression", c.Get("expression")))
				continue
			}
			entry := cs[0].Get("nodeId")
			for _, p := range falling {
				cases = append(cases, p.Clone().Set("entry", entry))
			}
			falling = nil
			cases = append(cases, Obj("value", c.Get("value"), "expression", c.Get("expression"), "entry", entry))
			linkToNext(cs, next)
			caseNodes = append(caseNodes, cs...)
		}
		var defaultEntry any = Undefined
		if Truthy(step.Get("defaultSteps")) {
			ds := convertStepsToNodes(stepsOf(step.Get("defaultSteps")), nodeId+"_default")
			if len(ds) > 0 {
				defaultEntry = ds[0].Get("nodeId")
				linkToNext(ds, next)
				caseNodes = append(caseNodes, ds...)
			}
		}
		trailing := defaultEntry
		if Nullish(trailing) {
			trailing = next
		}
		if Truthy(trailing) {
			for _, p := range falling {
				cases = append(cases, p.Clone().Set("entry", trailing))
			}
		}
		node := Obj("nodeId", nodeId, "flow", "switch", "expression", step.Get("expression"),
			"cases", cases, "defaultEntry", defaultEntry, "next", next)
		return append([]*Object{node}, caseNodes...)

	case "parallel":
		var childNodes []*Object
		entries := []any{}
		children := stepsOf(step.Get("children"))
		for i, c := range children {
			cs := convertStepToNode(c, i, children, nodeId+"_child")
			if len(cs) > 0 {
				entries = append(entries, cs[0].Get("nodeId"))
				childNodes = append(childNodes, cs...)
			}
		}
		node := Obj("nodeId", nodeId, "flow", "parallel", "children", entries, "next", next)
		return append([]*Object{node}, childNodes...)

	case "fanout":
		var childNodes []*Object
		body := stepsOf(step.Get("body"))
		for i, b := range body {
			childNodes = append(childNodes, convertStepToNode(b, i, body, nodeId+"_item")...)
		}
		var childEntry any = Undefined
		if len(childNodes) > 0 {
			childEntry = childNodes[0].Get("nodeId")
		}
		node := Obj("nodeId", nodeId, "flow", "fanout", "sourceVar", step.Get("sourceVar"),
			"itemVar", step.Get("itemVar"), "mode", step.Get("mode"), "childEntry", childEntry,
			"timeBetween", step.Get("timeBetween"), "next", next)
		return append([]*Object{node}, childNodes...)

	case "filter":
		return []*Object{Obj("nodeId", nodeId, "flow", "filter", "sourceVar", step.Get("sourceVar"),
			"itemVar", step.Get("itemVar"), "condition", step.Get("condition"),
			"outputVar", step.Get("outputVar"), "next", next)}

	case "arrayPredicate":
		return []*Object{Obj("nodeId", nodeId, "flow", "arrayPredicate", "mode", step.Get("mode"),
			"sourceVar", step.Get("sourceVar"), "itemVar", step.Get("itemVar"),
			"condition", step.Get("condition"), "outputVar", step.Get("outputVar"), "next", next)}

	case "return":
		return []*Object{Obj("nodeId", nodeId, "flow", "return", "outputs", step.Get("outputs"), "spread", step.Get("spread"))}

	case "cancel":
		return []*Object{Obj("nodeId", nodeId, "flow", "cancel", "reason", step.Get("reason"))}

	case "set":
		return []*Object{Obj("nodeId", nodeId, "flow", "set", "variable", step.Get("variable"),
			"value", step.Get("value"), "expression", step.Get("expression"), "next", next)}
	}
	return nil
}

func convertStepsToNodes(steps []*Object, prefix string) []*Object {
	var all []*Object
	for i, s := range steps {
		all = append(all, convertStepToNode(s, i, steps, prefix)...)
	}
	return all
}

// ConvertDslToGraph ports convertDslToGraph.
func ConvertDslToGraph(name string, meta *Object) *Object {
	nodes := convertStepsToNodes(stepsOf(meta.Get("steps")), "step")
	record := NewObject()
	for _, n := range nodes {
		record.Set(nodeID(n), n)
	}
	entry := []any{}
	if len(nodes) > 0 {
		entry = append(entry, nodes[0].Get("nodeId"))
	}
	source := "dsl"
	if Truthy(meta.Get("scenario")) {
		source = "scenario"
	} else if meta.Get("dsl") == false {
		source = "complex"
	}
	var scenario any
	if Truthy(meta.Get("scenario")) {
		scenario = true
	}
	return Obj(
		"name", name,
		"pikkuFuncId", meta.Get("pikkuFuncId"),
		"source", source,
		"scenario", scenario,
		"title", meta.Get("title"),
		"description", meta.Get("description"),
		"tags", meta.Get("tags"),
		"skip", meta.Get("skip"),
		"virtualUsers", meta.Get("virtualUsers"),
		"context", meta.Get("context"),
		"nodes", record,
		"entryNodeIds", entry,
	)
}

// ---- derive-workflow-plan.ts ----

// DeriveWorkflowPlan returns deterministic and plannedSteps (nil when the
// workflow loops).
func DeriveWorkflowPlan(steps []*Object) (bool, []any) {
	if containsLoop(steps) {
		return false, nil
	}
	return !containsConditional(steps), collectNamedSteps(steps)
}

func containsLoop(steps []*Object) bool {
	for _, s := range steps {
		switch s.Get("type") {
		case "fanout":
			return true
		case "branch":
			for _, b := range stepsOf(s.Get("branches")) {
				if containsLoop(stepsOf(b.Get("steps"))) {
					return true
				}
			}
			if Truthy(s.Get("elseSteps")) && containsLoop(stepsOf(s.Get("elseSteps"))) {
				return true
			}
		case "switch":
			for _, c := range stepsOf(s.Get("cases")) {
				if containsLoop(stepsOf(c.Get("steps"))) {
					return true
				}
			}
			if Truthy(s.Get("defaultSteps")) && containsLoop(stepsOf(s.Get("defaultSteps"))) {
				return true
			}
		}
	}
	return false
}

func containsConditional(steps []*Object) bool {
	for _, s := range steps {
		if t := s.Get("type"); t == "branch" || t == "switch" {
			return true
		}
	}
	return false
}

var reasonSep = regexp.MustCompile(`[-_]`)

func reasonToLabel(reason string) string {
	s := reasonSep.ReplaceAllString(reason, " ")
	if s == "" {
		return s
	}
	// /^(.)/ matches one UTF-16 unit that is not a line terminator.
	r := []rune(s)
	if r[0] == '\n' || r[0] == '\r' || r[0] == 0x2028 || r[0] == 0x2029 {
		return s
	}
	return strings.ToUpper(string(r[0])) + string(r[1:])
}

func collectNamedSteps(steps []*Object) []any {
	planned := []any{}
	for _, s := range steps {
		switch s.Get("type") {
		case "rpc", "inline", "sleep":
			planned = append(planned, Obj("stepName", s.Get("stepName")))
		case "suspend":
			r := TemplateString(s.Get("reason"))
			planned = append(planned, Obj("stepName", "__workflow_suspend:"+r, "displayName", reasonToLabel(r)))
		case "milestone":
			r := TemplateString(s.Get("name"))
			planned = append(planned, Obj("stepName", "__milestone__:"+r, "displayName", reasonToLabel(r)))
		case "approval":
			r := TemplateString(s.Get("reason"))
			planned = append(planned, Obj("stepName", "__workflow_approval:"+r, "displayName", reasonToLabel(r)))
		case "parallel":
			for _, c := range stepsOf(s.Get("children")) {
				planned = append(planned, Obj("stepName", c.Get("stepName")))
			}
		case "branch":
			for _, b := range stepsOf(s.Get("branches")) {
				planned = append(planned, collectNamedSteps(stepsOf(b.Get("steps")))...)
			}
			if Truthy(s.Get("elseSteps")) {
				planned = append(planned, collectNamedSteps(stepsOf(s.Get("elseSteps")))...)
			}
		case "switch":
			for _, c := range stepsOf(s.Get("cases")) {
				planned = append(planned, collectNamedSteps(stepsOf(c.Get("steps")))...)
			}
			if Truthy(s.Get("defaultSteps")) {
				planned = append(planned, collectNamedSteps(stepsOf(s.Get("defaultSteps")))...)
			}
		}
	}
	return planned
}
