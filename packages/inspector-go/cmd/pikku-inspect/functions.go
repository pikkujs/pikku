package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/printer"
	"github.com/microsoft/typescript-go/shim/scanner"
)

// Port of add/add-functions.ts (addFunctions).

var pikkuFuncPattern = regexp.MustCompile(`(?i)pikku.*func`)
var validVarName = regexp.MustCompile(`^[a-zA-Z_$][a-zA-Z0-9_$]*$`)
var channelConnRe = regexp.MustCompile(`(?i)ChannelConnection`)

var scenarioStepKinds = map[string]string{
	"pikkuScenarioStep":         "virtualUser",
	"pikkuPlatformScenarioStep": "platform",
	"pikkuAddonScenarioStep":    "addon",
}

var scenarioSurfaceKeys = []string{"browser", "cli", "default"}

var scenarioInstrumentation = map[string]bool{
	"pikkuScenarioTakeLiveCoverage": true, "pikkuScenarioResetLiveCoverage": true,
	"pikkuScenarioResetStubs": true, "pikkuScenarioGetStubCalls": true, "pikkuScenarioGradeRun": true,
}

func isScenarioInstrumentation(name string) bool {
	return scenarioInstrumentation[strings.SplitN(name, "@", 2)[0]]
}

func (s *state) addFunctions(node *ast.Node) {
	if !ast.IsCallExpression(node) {
		return
	}
	expression := node.Expression()
	if !ast.IsIdentifier(expression) {
		return
	}
	wrapper := expression.Text()
	scenarioStepKind, isScenarioStep := scenarioStepKinds[wrapper]
	if !pikkuFuncPattern.MatchString(wrapper) && wrapper != "pikkuScenario" && wrapper != "pikkuWebhookReceive" && !isScenarioStep {
		return
	}
	isScenario := wrapper == "pikkuScenario"
	isWebhookReceive := wrapper == "pikkuWebhookReceive"
	if !strings.HasPrefix(wrapper, "pikku") {
		return
	}
	args := node.Arguments()
	if len(args) == 0 {
		return
	}

	fn := s.extractFunctionName(node)
	pikkuFuncId, name := fn.pikkuFuncId, fn.name
	if pikkuFuncId == "" || strings.HasPrefix(pikkuFuncId, "__temp_") {
		return
	}
	if isScenarioInstrumentation(pikkuFuncId) || isScenarioInstrumentation(name) {
		return
	}

	m := &FunctionMeta{FunctionType: "user", FuncWrapper: wrapper}
	var objectNode *ast.Node
	var tags []string
	var expose, mcp bool
	var version int
	var inputSchemaVar, outputSchemaVar bool

	firstArg := args[0]
	handlerNode, resolvedFunc, isDirect := s.extractFunctionNode(firstArg)

	if ast.IsObjectLiteralExpression(firstArg) {
		objectNode = firstArg
		cm := s.getCommonWireMetaData(firstArg)
		if cm.disabled {
			return
		}
		m.Title, m.Summary, m.Description = cm.title, cm.summary, cm.description
		if cm.hasTags {
			tags = cm.tags
		}
		if cm.hasErrors {
			m.Errors = cm.errors
		}
		expose = getPropertyValue(firstArg, "expose").truthy()
		m.Remote = orNil(getPropertyValue(firstArg, "remote").truthy())
		mcp = getPropertyValue(firstArg, "mcp").truthy()
		if v := getPropertyValue(firstArg, "auth"); v.boolean != nil {
			m.Auth = v.boolean
		}
		m.PermissionsInBody = orNil(getPropertyValue(firstArg, "permissionsInBody").truthy())
		if p := findPropertyAssignment(firstArg, "audit"); p != nil {
			init := p.Initializer()
			if init.Kind == ast.KindTrueKeyword {
				m.Audit = &AuditMeta{Durability: "best-effort"}
			} else if ast.IsObjectLiteralExpression(init) {
				d := getPropertyValue(init, "durability").asString()
				if d == "" {
					d = "best-effort"
				}
				m.Audit = &AuditMeta{Durability: d}
			}
		}
		m.Readonly = orNil(getPropertyValue(firstArg, "readonly").truthy())
		m.Deploy = getPropertyValue(firstArg, "deploy").asString()
		m.ApprovalRequired = orNil(getPropertyValue(firstArg, "approvalRequired").truthy())
		if v := getPropertyValue(firstArg, "workflowQueued"); v.boolean != nil && *v.boolean {
			m.WorkflowQueued = boolPtr(true)
		}
		if v := getPropertyValue(firstArg, "workflowRetries"); v.num != nil {
			m.WorkflowRetries = v.num
		}
		m.WorkflowTimeout = getPropertyValue(firstArg, "workflowTimeout").asString()

		var declared []string
		for _, surface := range scenarioSurfaceKeys {
			for _, p := range firstArg.Properties() {
				if (ast.IsPropertyAssignment(p) || ast.IsMethodDeclaration(p) || ast.IsShorthandPropertyAssignment(p)) &&
					ast.IsIdentifier(p.Name()) && p.Name().Text() == surface {
					declared = append(declared, surface)
					break
				}
			}
		}
		if scenarioStepKind == "platform" || scenarioStepKind == "addon" {
			if len(declared) > 0 {
				return
			}
			m.ScenarioStepSurfaces = []string{"default"}
			if scenarioStepKind == "addon" {
				m.ScenarioStepAddon = getPropertyValue(firstArg, "addon").asString()
				if m.ScenarioStepAddon == "" {
					return
				}
			}
		} else {
			if len(declared) > 0 {
				m.ScenarioStepSurfaces = declared
			}
			vu := getPropertyValue(firstArg, "virtualUser")
			browser := false
			for _, d := range declared {
				browser = browser || d == "browser"
			}
			if (vu.boolean != nil && *vu.boolean) || browser {
				m.ScenarioStepRequiresVirtualUser = boolPtr(true)
			}
		}
		m.ScenarioStepTemplate = getPropertyValue(firstArg, "template").asString()
		if sc, ok := getArrayPropertyValue(firstArg, "scopes"); ok {
			m.Scopes = sc
		}
		for _, p := range firstArg.Properties() {
			if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) && p.Name().Text() == "approvalDescription" && ast.IsIdentifier(p.Initializer()) {
				id := s.extractFunctionName(p.Initializer()).pikkuFuncId
				if id != "" && !strings.HasPrefix(id, "__temp_") {
					m.ApprovalDescription = id
				} else {
					m.ApprovalDescription = p.Initializer().Text()
				}
				break
			}
		}
		if v := getPropertyValue(firstArg, "version"); v.present {
			var f float64
			var err error
			switch {
			case v.num != nil:
				f = *v.num
			case v.str != nil:
				f, err = strconv.ParseFloat(*v.str, 64)
			case v.boolean != nil && *v.boolean:
				f = 1
			}
			if err == nil && f >= 1 && f == float64(int(f)) {
				version = int(f)
			}
		}
		// node config (state.nodes) is out of scope for this slice.
		for _, p := range firstArg.Properties() {
			if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) {
				pn := p.Name().Text()
				if (pn == "input" || pn == "output") && ast.IsIdentifier(p.Initializer()) {
					// TS also checks the schema vendor (zod/valibot/...) here and
					// registers it in state.schemaLookup; the prototype only
					// records that a schema variable was given.
					if pn == "input" {
						inputSchemaVar = true
					} else {
						outputSchemaVar = true
					}
				}
			}
		}
	}

	if version != 0 {
		base := fn.explicitName
		if base == "" {
			base = fn.exportedName
		}
		if base == "" {
			base = pikkuFuncId
		}
		suffix := "V" + strconv.Itoa(version)
		if strings.HasSuffix(base, suffix) && len(base) > len(suffix) {
			base = strings.TrimSuffix(base, suffix)
		}
		pikkuFuncId = formatVersionedId(base, version)
		m.Version = &version
	}
	m.PikkuFuncId = pikkuFuncId
	m.Name = name

	if wrapper == "pikkuRemoteChannelFunc" {
		// addRemoteChannelFunc is not ported.
		return
	}

	isMCPToolFunc := wrapper == "pikkuMCPToolFunc"
	isListFunc := wrapper == "pikkuListFunc"
	mcpEnabled := mcp || isMCPToolFunc

	handler := handlerNode
	if resolvedFunc != nil && isFunctionLike(resolvedFunc) {
		handler = resolvedFunc
	}
	if !isFunctionLike(handler) {
		s.meta[pikkuFuncId] = &FunctionMeta{
			PikkuFuncId: pikkuFuncId, FunctionType: "user", Name: name,
			Services: ServicesMeta{Optimized: false, Services: []string{}},
			Inputs:   []string{}, Outputs: []string{},
		}
		return
	}

	services := ServicesMeta{Optimized: true, Services: []string{}}
	addServices := func(fnNode *ast.Node, dedupe bool) {
		p := paramAt(fnNode, 0)
		if p == nil {
			return
		}
		if ast.IsObjectBindingPattern(p.Name()) {
			for _, n := range bindingNames(p) {
				if dedupe {
					dup := false
					for _, e := range services.Services {
						dup = dup || e == n
					}
					if dup {
						continue
					}
				}
				services.Services = append(services.Services, n)
			}
		} else if ast.IsIdentifier(p.Name()) && !strings.HasPrefix(p.Name().Text(), "_") {
			services.Optimized = false
		}
	}
	addServices(handler, false)
	wires := extractUsedWires(handler, 2)

	var compensateInit *ast.Node
	if objectNode != nil {
		compensateInit = s.getPropertyAssignmentInitializer(objectNode, "compensate", true)
	}
	if compensateInit != nil && isFunctionLike(compensateInit) {
		addServices(compensateInit, true)
		cw := extractUsedWires(compensateInit, 2)
		seen := map[string]bool{}
		merged := []string{}
		for _, w := range append(append([]string{}, wires.Wires...), cw.Wires...) {
			if !seen[w] {
				seen[w] = true
				merged = append(merged, w)
			}
		}
		wires = WiresMeta{Optimized: wires.Optimized && cw.Optimized, Wires: merged}
	}
	if compensateInit != nil {
		m.Compensate = boolPtr(true)
	}

	body := handler.Body()
	if inv := collectInvokedRpcNames(body); len(inv) > 0 {
		m.Invokes = inv
	}

	// --- Generics → types, unwrapped from Promise ---
	var generics []*checker.Type
	for _, tn := range node.TypeArguments() {
		generics = append(generics, s.unwrapPromise(s.c.GetTypeFromTypeNode(tn)))
	}
	isChannelConnection := channelConnRe.MatchString(wrapper)
	capitalized := funcIdToTypeName(name)

	var inputNames, outputNames []string
	switch {
	case inputSchemaVar:
		inputNames = []string{capitalized + "Input"}
	case isListFunc && len(generics) >= 1:
		inputNames = []string{capitalized + "Input"}
	case !isChannelConnection && !isListFunc && len(generics) >= 1:
		inputNames = s.getNamesAndTypes("Input", name, generics[0])
	default:
		if p := paramAt(handler, 1); p != nil {
			inputNames = s.getNamesAndTypes("Input", pikkuFuncId, s.c.GetTypeAtLocation(p))
		}
	}
	if isWebhookReceive {
		inputNames = nil
	}

	switch {
	case outputSchemaVar:
		outputNames = []string{capitalized + "Output"}
	case isListFunc && len(generics) >= 2:
		outputNames = []string{capitalized + "Output"}
	case !isListFunc && len(generics) >= 2:
		outputNames = s.getNamesAndTypes("Output", name, generics[1])
	default:
		if sig := s.c.GetSignatureFromDeclaration(handler); sig != nil {
			ret := s.unwrapPromise(s.c.GetReturnTypeOfSignature(sig))
			outputNames = s.getNamesAndTypes("Output", pikkuFuncId, ret)
		}
	}
	mcpOutputTypes := map[string]string{
		"pikkuMCPResourceFunc": "MCPResourceResponse",
		"pikkuMCPToolFunc":     "MCPToolResponse",
		"pikkuMCPPromptFunc":   "MCPPromptResponse",
	}
	if t, ok := mcpOutputTypes[wrapper]; ok && (len(outputNames) == 0 || outputNames[0] != t) {
		outputNames = []string{t}
	}

	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	if existing := s.meta[pikkuFuncId]; existing != nil && existing.SourceFile != "" && existing.SourceFile != sourceFile {
		return // DUPLICATE_FUNCTION_NAME
	}

	m.Sessionless = boolPtr(wrapper != "pikkuFunc")
	m.Services = services
	if len(wires.Wires) > 0 || !wires.Optimized {
		m.Wires = &wires
	}
	if len(inputNames) > 0 {
		m.InputSchemaName = &inputNames[0]
	}
	if len(outputNames) > 0 {
		m.OutputSchemaName = &outputNames[0]
	}
	m.Inputs = filterVoid(inputNames)
	m.Outputs = filterVoid(outputNames)
	m.Expose = orNil(expose)
	if isWebhookReceive {
		m.Auth = boolPtr(false)
	}
	m.ScenarioStep = orNil(isScenarioStep)
	m.WebhookReceive = orNil(isWebhookReceive)
	m.Scenario = orNil(isScenario)
	m.MCP = orNil(mcpEnabled)
	if scenarioStepKind != "" && scenarioStepKind != "virtualUser" {
		m.ScenarioStepKind = scenarioStepKind
	}
	m.Tags = tags
	if objectNode != nil {
		if mw := s.resolveMiddleware(objectNode, tags); len(mw) > 0 {
			m.Middleware = mw
		}
		if pm := s.resolvePermissions(objectNode); len(pm) > 0 {
			m.Permissions = pm
		}
	}
	m.ImplementationHash = implementationHash(wrapper, handler, objectNode, isDirect)
	m.IsDirectFunction = boolPtr(isDirect)
	m.SourceFile = sourceFile
	handlerSF := ast.GetSourceFileOfNode(handler)
	if handlerSF.FileName() != sourceFile {
		m.BodySourceFile = handlerSF.FileName()
	}
	m.ExportedName = fn.exportedName
	lineOf := func(pos int) int { return scanner.GetECMALineOfPosition(handlerSF, pos) + 1 }
	var bs, be int
	if ast.IsBlock(body) && len(body.Statements()) > 0 {
		stmts := body.Statements()
		bs = lineOf(nodeStart(stmts[0]))
		be = lineOf(stmts[len(stmts)-1].End())
	} else {
		bs = lineOf(nodeStart(body))
		be = lineOf(body.End())
	}
	m.BodyStart, m.BodyEnd = &bs, &be
	if sw := collectStartedWorkflows(body); len(sw) > 0 {
		m.StartsWorkflows = sw
	}

	s.meta[pikkuFuncId] = m
}

func filterVoid(names []string) []string {
	out := []string{}
	for _, n := range names {
		if n != "void" {
			out = append(out, n)
		}
	}
	return out
}

// --- implementationHash -----------------------------------------------------

func printNode(n *ast.Node) string {
	p := printer.NewPrinter(printer.PrinterOptions{RemoveComments: true}, printer.PrintHandlers{}, nil)
	return p.Emit(n, ast.GetSourceFileOfNode(n))
}

func implementationHash(wrapper string, handler, objectNode *ast.Node, isDirect bool) string {
	var config any
	if objectNode != nil {
		config = printNode(objectNode)
	}
	// canonicalJSON: keys sorted; JSON.stringify does not HTML-escape.
	payload := []any{
		[2]any{"config", config}, [2]any{"handler", printNode(handler)},
		[2]any{"isDirectFunction", isDirect}, [2]any{"wrapper", wrapper},
	}
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, kv := range payload {
		pair := kv.([2]any)
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.Write(jsonValue(pair[0]))
		buf.WriteByte(':')
		buf.Write(jsonValue(pair[1]))
	}
	buf.WriteByte('}')
	if os.Getenv("PIKKU_DEBUG_HASH") != "" {
		fmt.Fprintf(os.Stderr, "HASH %s\n", buf.String())
	}
	sum := sha256.Sum256(buf.Bytes())
	return hex.EncodeToString(sum[:])[:16]
}

func jsonValue(v any) []byte {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return bytes.TrimRight(b.Bytes(), "\n")
}
