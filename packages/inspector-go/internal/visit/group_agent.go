package visit

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-agent.ts (addAgent) and add/add-agent-scorer.ts
// (addAgentScorer).

func init() {
	Register(Visitor{Name: "addAgent", Phase: PhaseRoutes, Order: OrderAddAgent, Visit: (*Context).addAgent})
	Register(Visitor{Name: "addAgentScorer", Phase: PhaseRoutes, Order: OrderAddAgentScorer, Visit: (*Context).addAgentScorer})
}

// agentPlatformServices are the services an AI agent function needs that are
// not visible through parameter destructuring.
var agentPlatformServices = []string{"agentStorage", "agentRunState", "agentRunService", "agentRunner"}

func (s *Context) addAgent(node *ast.Node) {
	if !ast.IsCallExpression(node) {
		return
	}
	expression := node.Expression()
	if !ast.IsIdentifier(expression) || expression.Text() != "pikkuAgent" {
		return
	}
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	exportedName := s.extractFunctionName(node).exportedName
	obj := args[0]
	if !ast.IsObjectLiteralExpression(obj) {
		return
	}

	nameValue := tsutil.GetPropertyValue(obj, "name").AsString()
	cm := s.commonWireMetaChecked(obj, "AI agent", nameValue)
	if cm.disabled {
		return
	}

	modelValue := tsutil.GetPropertyValue(obj, "model")
	roleValue := tsutil.GetPropertyValue(obj, "role")
	personalityValue := tsutil.GetPropertyValue(obj, "personality")
	goalValue := tsutil.GetPropertyValue(obj, "goal")
	maxStepsValue := tsutil.GetPropertyValue(obj, "maxSteps")
	temperatureValue := tsutil.GetPropertyValue(obj, "temperature")
	toolChoiceValue := tsutil.GetPropertyValue(obj, "toolChoice")
	providerOptions := s.resolveProviderOptions(obj, nameValue)
	scorers := s.resolveScorerNames(obj, nameValue)
	tools := s.resolveToolReferences(obj, nameValue)

	for _, toolName := range tools {
		if strings.Contains(toolName, ":") {
			continue
		}
		if f, ok := s.State.Functions.Files.Get(toolName); ok && !s.State.RPC.InternalFiles.Has(toolName) {
			s.State.RPC.InternalFiles.Set(toolName, f)
		}
	}

	agents := s.resolveAgentReferences(obj, nameValue)
	workflows := s.resolveWorkflowReferences(obj, nameValue)
	for _, w := range workflows {
		s.State.Workflows.InvokedWorkflows.Add(w)
	}

	if nameValue == "" {
		s.Log.Critical(diag.MissingName, "AI agent is missing the required 'name' property.")
		return
	}
	agentKey := exportedName
	if agentKey == "" {
		agentKey = nameValue
	}
	if cm.description == nil || *cm.description == "" {
		s.Log.Critical(diag.MissingDescription, fmt.Sprintf("AI agent '%s' is missing a description.", nameValue))
		return
	}

	var inputSchema, outputSchema, workingMemorySchema *string
	capitalized := tsutil.FuncIdToTypeName(agentKey)
	tm := s.TypesMap()
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		propName := p.Name().Text()
		init := p.Initializer()
		switch {
		case propName == "input" || propName == "output":
			schemaName := capitalized + strings.ToUpper(propName[:1]) + propName[1:]
			if ast.IsIdentifier(init) {
				ref := s.resolveSchemaRef(init, fmt.Sprintf("AI agent '%s' %s", nameValue, propName))
				if ref == nil {
					continue
				}
				s.State.SchemaLookup.Set(schemaName, *ref)
				tm.AddCustomType(schemaName, "unknown", nil)
				n := schemaName
				if propName == "input" {
					inputSchema = &n
				} else {
					outputSchema = &n
				}
			} else if ast.IsCallExpression(init) {
				s.Log.Critical(diag.InlineSchema,
					"Inline schemas are not supported for '"+propName+"' in AI agent '"+nameValue+"'.\n"+
						"  Extract to an exported variable:\n"+
						"    export const "+schemaName+" = "+tsutil.NodeText(init)+"\n"+
						"  Then use: "+propName+": "+schemaName)
			}
		case propName == "memory" && ast.IsObjectLiteralExpression(init):
			for _, mp := range init.Properties() {
				if !ast.IsPropertyAssignment(mp) || !ast.IsIdentifier(mp.Name()) || mp.Name().Text() != "workingMemory" || !ast.IsIdentifier(mp.Initializer()) {
					continue
				}
				ref := s.resolveSchemaRef(mp.Initializer(), fmt.Sprintf("AI agent '%s' workingMemory", nameValue))
				if ref == nil {
					continue
				}
				schemaName := capitalized + "WorkingMemory"
				s.State.SchemaLookup.Set(schemaName, *ref)
				tm.AddCustomType(schemaName, "unknown", nil)
				workingMemorySchema = &schemaName
			}
		}
	}

	var tags []string
	if cm.hasTags {
		tags = cm.tags
	}
	middleware := s.resolveMiddleware(obj, tags)
	channelMiddleware := s.resolveChannelMiddleware(obj, tags)
	agentMiddleware := s.resolveAgentMiddleware(obj)
	permissions := s.resolvePermissions(obj)

	s.State.ServiceAggregation.UsedFunctions.Add(agentKey)
	s.addUsedWires(&FunctionMeta{Middleware: middleware, Permissions: permissions})

	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	if exportedName != "" {
		s.State.Agents.Files.Set(agentKey, state.FileExport{Path: sourceFile, ExportedName: exportedName})
	}

	meta := &state.AgentMeta{
		Name:                nameValue,
		Description:         *cm.description,
		Role:                truthyString(roleValue),
		Personality:         truthyString(personalityValue),
		Goal:                truthyString(goalValue),
		Model:               truthyString(modelValue),
		Summary:             cm.summary,
		SourceFile:          sourceFile,
		ExportedName:        exportedName,
		MaxSteps:            propRaw(maxStepsValue),
		Temperature:         propRaw(temperatureValue),
		ToolChoice:          propRaw(toolChoiceValue),
		ProviderOptions:     providerOptions,
		Tools:               tools,
		Agents:              agents,
		Workflows:           workflows,
		Scorers:             scorers,
		Tags:                tags,
		InputSchema:         inputSchema,
		OutputSchema:        outputSchema,
		WorkingMemorySchema: workingMemorySchema,
		Middleware:          middleware,
		ChannelMiddleware:   channelMiddleware,
		AgentMiddleware:     agentMiddleware,
		Permissions:         permissions,
	}
	if cm.hasErrors {
		meta.Errors = cm.errors
	}
	s.State.Agents.AgentsMeta.Set(agentKey, meta)

	if fm := s.State.Functions.Meta.At(agentKey); fm != nil {
		for _, svc := range agentPlatformServices {
			found := false
			for _, e := range fm.Services.Services {
				found = found || e == svc
			}
			if !found {
				fm.Services.Services = append(fm.Services.Services, svc)
			}
		}
	}
}

// truthyString is `(getPropertyValue(obj, k) as string | null) || ”`, as
// written into a string field.
func truthyString(v tsutil.PropValue) string {
	if !v.Truthy() {
		return ""
	}
	switch {
	case v.Str != nil:
		return *v.Str
	case v.Num != nil:
		return string(jsjson.MustMarshal(*v.Num))
	case v.Bool != nil:
		return "true"
	}
	return strings.Join(v.Strs, ",")
}

// propRaw is the JSON of getPropertyValue's result, or nil (undefined) when
// the property is absent.
func propRaw(v tsutil.PropValue) state.Raw {
	if !v.Present {
		return nil
	}
	switch {
	case v.Num != nil:
		return state.RawOf(*v.Num)
	case v.Bool != nil:
		return state.RawOf(*v.Bool)
	case v.Str != nil:
		return state.RawOf(*v.Str)
	}
	return state.RawOf(v.Strs)
}

// resolveProviderOptions reads `providerOptions` as a JSON object literal
// (literal-properties.ts jsonObjectProperty), warning when it is computed.
func (s *Context) resolveProviderOptions(obj *ast.Node, agentName string) state.Raw {
	value := literalProperty(obj, "providerOptions")
	if value == nil {
		return nil
	}
	if ast.IsObjectLiteralExpression(tsutil.UnwrapAs(value)) {
		if v, ok := readJSONLiteral(value); ok {
			return v
		}
	}
	s.Log.Diagnostic(diag.Warn, diag.AgentProviderOptionsUnreadable,
		"AI agent '"+agentName+"' has a 'providerOptions' the inspector cannot read statically, so it is missing from the generated metadata. "+
			"Inline it as an object literal of strings, numbers, booleans, arrays and nested objects.")
	return nil
}

// literalProperty is literal-properties.ts getProperty: the initializer of a
// property assignment named by an identifier or a string literal.
func literalProperty(obj *ast.Node, name string) *ast.Node {
	for _, p := range obj.Properties() {
		if ast.IsPropertyAssignment(p) && (ast.IsIdentifier(p.Name()) || ast.IsStringLiteral(p.Name())) && p.Name().Text() == name {
			return p.Initializer()
		}
	}
	return nil
}

// readJSONLiteral is literal-properties.ts readJsonValue: the JSON of a
// JSON-shaped literal, all or nothing.
func readJSONLiteral(node *ast.Node) (state.Raw, bool) {
	value := tsutil.UnwrapAs(node)
	switch {
	case ast.IsStringLiteralLike(value):
		return state.RawOf(value.Text()), true
	case ast.IsNumericLiteral(value):
		f, err := strconv.ParseFloat(value.Text(), 64)
		return state.RawOf(f), err == nil
	case ast.IsPrefixUnaryExpression(value) && value.AsPrefixUnaryExpression().Operator == ast.KindMinusToken && ast.IsNumericLiteral(value.AsPrefixUnaryExpression().Operand):
		f, err := strconv.ParseFloat(value.AsPrefixUnaryExpression().Operand.Text(), 64)
		return state.RawOf(-f), err == nil
	case value.Kind == ast.KindTrueKeyword:
		return state.RawOf(true), true
	case value.Kind == ast.KindFalseKeyword:
		return state.RawOf(false), true
	case value.Kind == ast.KindNullKeyword:
		return state.Raw("null"), true
	case ast.IsArrayLiteralExpression(value):
		entries := []state.Raw{}
		for _, e := range value.Elements() {
			v, ok := readJSONLiteral(e)
			if !ok {
				return nil, false
			}
			entries = append(entries, v)
		}
		return state.RawOf(entries), true
	case ast.IsObjectLiteralExpression(value):
		var rec state.Record[state.Raw]
		for _, p := range value.Properties() {
			if !ast.IsPropertyAssignment(p) {
				return nil, false
			}
			n := p.Name()
			if !ast.IsIdentifier(n) && !ast.IsStringLiteralLike(n) && !ast.IsNumericLiteral(n) {
				return nil, false
			}
			v, ok := readJSONLiteral(p.Initializer())
			if !ok {
				return nil, false
			}
			rec.Set(n.Text(), v)
		}
		return state.RawOf(&rec), true
	}
	return nil, false
}

// arrayProperty is the `<name>: [...]` initializer, or nil.
func arrayProperty(obj *ast.Node, name string) *ast.Node {
	for _, p := range obj.Properties() {
		if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == name {
			if ast.IsArrayLiteralExpression(p.Initializer()) {
				return p.Initializer()
			}
			return nil
		}
	}
	return nil
}

// stringCallArg returns the string-literal first argument of `callee(...)`
// when node is a call to one of callees.
func stringCallArg(node *ast.Node, callees ...string) (callee, arg string, ok bool) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return "", "", false
	}
	callee = node.Expression().Text()
	for _, c := range callees {
		if c != callee {
			continue
		}
		args := node.Arguments()
		if len(args) > 0 && ast.IsStringLiteral(args[0]) {
			return callee, args[0].Text(), true
		}
	}
	return callee, "", false
}

func (s *Context) resolveToolReferences(obj *ast.Node, agentName string) []string {
	arr := arrayProperty(obj, "tools")
	if arr == nil {
		return nil
	}
	var resolved []string
	for _, el := range arr.Elements() {
		if ast.IsStringLiteral(el) {
			s.Log.Critical(diag.InvalidValue, fmt.Sprintf("AI agent '%s' tools array contains a string literal '%s'. ", agentName, el.Text())+
				"Use a function reference instead (e.g., import the pikkuFunc variable).")
			continue
		}
		if callee, arg, ok := stringCallArg(el, "workflow", "ref"); ok {
			if callee == "workflow" {
				resolved = append(resolved, "workflow:"+arg)
			} else {
				resolved = append(resolved, arg)
			}
			continue
		}
		if ast.IsIdentifier(el) {
			if name := s.resolveIdentifierToRpcName(el); name != "" {
				resolved = append(resolved, name)
				continue
			}
			s.Log.Critical(diag.InvalidValue, fmt.Sprintf("AI agent '%s' tools array contains identifier '%s' ", agentName, el.Text())+
				"that could not be resolved to a pikkuFunc.")
		}
	}
	return resolved
}

func (s *Context) resolveAgentReferences(obj *ast.Node, agentName string) []string {
	arr := arrayProperty(obj, "agents")
	if arr == nil {
		return nil
	}
	var resolved []string
	for _, el := range arr.Elements() {
		if ast.IsStringLiteral(el) {
			s.Log.Critical(diag.InvalidValue, fmt.Sprintf("AI agent '%s' agents array contains a string literal '%s'. ", agentName, el.Text())+
				"Use an agent reference instead (e.g., import the pikkuAgent variable).")
			continue
		}
		if ast.IsIdentifier(el) {
			if decl := s.pikkuCallDeclaration(el, "pikkuAgent"); decl != nil && ast.IsIdentifier(decl.Name()) {
				resolved = append(resolved, decl.Name().Text())
				continue
			}
			s.Log.Critical(diag.InvalidValue, fmt.Sprintf("AI agent '%s' agents array contains identifier '%s' ", agentName, el.Text())+
				"that could not be resolved to a pikkuAgent.")
		}
	}
	return resolved
}

func (s *Context) resolveWorkflowReferences(obj *ast.Node, agentName string) []string {
	arr := arrayProperty(obj, "workflows")
	if arr == nil {
		return nil
	}
	var resolved []string
	for _, el := range arr.Elements() {
		if ast.IsStringLiteral(el) {
			s.Log.Critical(diag.InvalidValue, fmt.Sprintf("AI agent '%s' workflows array contains a string literal '%s'. ", agentName, el.Text())+
				"Use a workflow reference instead (e.g., ref('<workflowName>') or import the pikkuWorkflowGraph variable).")
			continue
		}
		if _, arg, ok := stringCallArg(el, "ref", "workflow"); ok {
			resolved = append(resolved, arg)
			continue
		}
		if ast.IsIdentifier(el) {
			if name := s.resolveIdentifierToWorkflowName(el); name != "" {
				resolved = append(resolved, name)
				continue
			}
			s.Log.Critical(diag.InvalidValue, fmt.Sprintf("AI agent '%s' workflows array contains identifier '%s' ", agentName, el.Text())+
				"that could not be resolved to a pikkuWorkflowGraph.")
		}
	}
	return resolved
}

// pikkuCallDeclaration resolves an identifier (through an import) to its
// `const x = <callee>(...)` declaration when callee is one of callees.
func (s *Context) pikkuCallDeclaration(ident *ast.Node, callees ...string) *ast.Node {
	sym := s.resolveAlias(s.Checker.GetSymbolAtLocation(ident))
	if sym == nil {
		return nil
	}
	decl := symbolDecl(sym)
	if decl == nil || !ast.IsVariableDeclaration(decl) || decl.Initializer() == nil {
		return nil
	}
	init := decl.Initializer()
	if !ast.IsCallExpression(init) || !ast.IsIdentifier(init.Expression()) {
		return nil
	}
	for _, c := range callees {
		if init.Expression().Text() == c {
			return decl
		}
	}
	return nil
}

// stringPropertyOfFirstArg is the string-literal `<name>` of the declaration
// initializer's first object-literal argument.
func stringPropertyOfFirstArg(decl *ast.Node, name string) (string, bool) {
	args := decl.Initializer().Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return "", false
	}
	for _, p := range args[0].Properties() {
		if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == name && ast.IsStringLiteral(p.Initializer()) {
			return p.Initializer().Text(), true
		}
	}
	return "", false
}

func (s *Context) resolveIdentifierToRpcName(ident *ast.Node) string {
	decl := s.pikkuCallDeclaration(ident, "pikkuFunc", "pikkuSessionlessFunc", "pikkuVoidFunc")
	if decl == nil {
		return ""
	}
	if v, ok := stringPropertyOfFirstArg(decl, "override"); ok {
		return v
	}
	if ast.IsIdentifier(decl.Name()) {
		return decl.Name().Text()
	}
	return ""
}

func (s *Context) resolveIdentifierToWorkflowName(ident *ast.Node) string {
	decl := s.pikkuCallDeclaration(ident, "pikkuWorkflowGraph", "pikkuWorkflow", "pikkuWorkflowComplex")
	if decl == nil {
		return ""
	}
	if v, ok := stringPropertyOfFirstArg(decl, "name"); ok {
		return v
	}
	if ast.IsIdentifier(decl.Name()) {
		return decl.Name().Text()
	}
	return ""
}

// resolveScorerNames reads `scorers`, which are plain names.
func (s *Context) resolveScorerNames(obj *ast.Node, agentName string) []string {
	arr := arrayProperty(obj, "scorers")
	if arr == nil {
		return nil
	}
	var names []string
	for _, el := range arr.Elements() {
		if !ast.IsStringLiteral(el) {
			s.Log.Critical(diag.InvalidValue, "AI agent '"+agentName+"' lists a scorer that is not an inline string: `"+tsutil.NodeText(el)+
				"`. A scorer is named, not imported, so the name has to be readable from source.")
			continue
		}
		names = append(names, el.Text())
	}
	return names
}

// resolveAgentMiddleware is utils/middleware.ts resolveAgentMiddleware.
func (s *Context) resolveAgentMiddleware(obj *ast.Node) []WireRef {
	p := tsutil.FindPropertyAssignment(obj, "agentMiddleware")
	if p == nil {
		return nil
	}
	var out []WireRef
	for _, name := range s.middlewareRefNames(p.Initializer()) {
		out = append(out, WireRef{Type: "wire", Name: name, Inline: tsutil.BoolPtr(definitionNotExported(s.State.AgentMiddleware.Definitions, name))})
	}
	return out
}

// middlewareRefNames is extractMiddlewarePikkuNames.
func (s *Context) middlewareRefNames(arr *ast.Node) []string {
	if !ast.IsArrayLiteralExpression(arr) {
		return nil
	}
	var names []string
	for _, e := range arr.Elements() {
		switch {
		case ast.IsIdentifier(e):
			id := s.refId(e)
			if strings.HasPrefix(id, "__temp_") {
				id = e.Text()
			}
			names = append(names, id)
		case ast.IsCallExpression(e):
			id := s.refId(e.Expression())
			if strings.HasPrefix(id, "__temp_") && ast.IsIdentifier(e.Expression()) {
				id = e.Expression().Text()
			}
			names = append(names, id)
		}
	}
	return names
}

// definitionNotExported is `definitions[name]?.exportedName === null`.
func definitionNotExported(defs state.Record[state.Raw], name string) bool {
	raw, ok := defs.Get(name)
	if !ok || len(raw) == 0 {
		return false
	}
	var d struct {
		ExportedName json.RawMessage `json:"exportedName"`
	}
	if raw.Decode(&d) != nil {
		return false
	}
	return string(d.ExportedName) == "null"
}

// --- add-agent-scorer.ts ------------------------------------------------------

// scorerLanes: pikkuAgentScorer grades in code, pikkuAgentJudge with a model.
var scorerLanes = map[string]string{"pikkuAgentScorer": "fast", "pikkuAgentJudge": "slow"}

func (s *Context) addAgentScorer(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	lane, ok := scorerLanes[node.Expression().Text()]
	if !ok {
		return
	}
	args := node.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return
	}
	obj := args[0]
	exportedName := s.extractFunctionName(node).exportedName

	nameValue := tsutil.GetPropertyValue(obj, "name").AsString()
	if nameValue == "" {
		s.Log.Critical(diag.MissingName, "AI scorer is missing the required 'name' property.")
		return
	}
	description := tsutil.GetPropertyValue(obj, "description")
	if !description.Truthy() {
		s.Log.Critical(diag.MissingDescription, fmt.Sprintf("AI scorer '%s' is missing the required 'description' property.", nameValue))
		return
	}
	sampleRate := tsutil.GetPropertyValue(obj, "sampleRate")
	if sampleRate.Num != nil && (*sampleRate.Num < 0 || *sampleRate.Num > 1) {
		s.Log.Critical(diag.InvalidValue, fmt.Sprintf("AI scorer '%s' has a sampleRate of %s — it is the fraction of live runs to grade, so it must be between 0 and 1.",
			nameValue, jsjson.MustMarshal(*sampleRate.Num)))
		return
	}
	sampleRateRaw := propRaw(sampleRate)
	if sampleRateRaw == nil {
		sampleRateRaw = state.RawOf(1)
	}
	requiresReference := propRaw(tsutil.GetPropertyValue(obj, "requiresReference"))
	if requiresReference == nil {
		requiresReference = state.RawOf(false)
	}

	scorerKey := exportedName
	if scorerKey == "" {
		scorerKey = nameValue
	}
	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	if exportedName != "" {
		s.State.Scorers.Files.Set(scorerKey, state.FileExport{Path: sourceFile, ExportedName: exportedName})
	}
	s.State.Scorers.ScorersMeta.Set(scorerKey, &state.ScorerMeta{
		Name: nameValue, Description: truthyString(description), Lane: lane,
		SampleRate: sampleRateRaw, RequiresReference: requiresReference,
		SourceFile: sourceFile, ExportedName: exportedName,
	})
}
