package visit

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-functions.ts (addFunctions).

func init() {
	Register(Visitor{Name: "addFunctions", Phase: PhaseFunctions, Order: OrderAddFunctions, Visit: (*Context).addFunctions})
}

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

func (s *Context) addFunctions(node *ast.Node) {
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
	var nodeCfg *nodeConfig
	var tags []string
	var expose, mcp bool
	var version int
	var inputSchemaRef, outputSchemaRef *state.SchemaRef

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
		expose = tsutil.GetPropertyValue(firstArg, "expose").Truthy()
		m.Remote = tsutil.OrNil(tsutil.GetPropertyValue(firstArg, "remote").Truthy())
		mcp = tsutil.GetPropertyValue(firstArg, "mcp").Truthy()
		if v := tsutil.GetPropertyValue(firstArg, "auth"); v.Bool != nil {
			m.Auth = v.Bool
		}
		m.PermissionsInBody = tsutil.OrNil(tsutil.GetPropertyValue(firstArg, "permissionsInBody").Truthy())
		if p := tsutil.FindPropertyAssignment(firstArg, "audit"); p != nil {
			init := p.Initializer()
			if init.Kind == ast.KindTrueKeyword {
				m.Audit = &AuditMeta{Durability: "best-effort"}
			} else if ast.IsObjectLiteralExpression(init) {
				d := tsutil.GetPropertyValue(init, "durability").AsString()
				if d == "" {
					d = "best-effort"
				}
				m.Audit = &AuditMeta{Durability: d}
			}
		}
		m.Readonly = tsutil.OrNil(tsutil.GetPropertyValue(firstArg, "readonly").Truthy())
		m.Deploy = tsutil.GetPropertyValue(firstArg, "deploy").AsString()
		m.ApprovalRequired = tsutil.OrNil(tsutil.GetPropertyValue(firstArg, "approvalRequired").Truthy())
		if v := tsutil.GetPropertyValue(firstArg, "workflowQueued"); v.Bool != nil && *v.Bool {
			m.WorkflowQueued = tsutil.BoolPtr(true)
		}
		if v := tsutil.GetPropertyValue(firstArg, "workflowRetries"); v.Num != nil {
			m.WorkflowRetries = v.Num
		}
		m.WorkflowTimeout = tsutil.GetPropertyValue(firstArg, "workflowTimeout").AsString()

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
				m.ScenarioStepAddon = tsutil.GetPropertyValue(firstArg, "addon").AsString()
				if m.ScenarioStepAddon == "" {
					return
				}
			}
		} else {
			if len(declared) > 0 {
				m.ScenarioStepSurfaces = declared
			}
			vu := tsutil.GetPropertyValue(firstArg, "virtualUser")
			browser := false
			for _, d := range declared {
				browser = browser || d == "browser"
			}
			if (vu.Bool != nil && *vu.Bool) || browser {
				m.ScenarioStepRequiresVirtualUser = tsutil.BoolPtr(true)
			}
		}
		m.ScenarioStepTemplate = tsutil.GetPropertyValue(firstArg, "template").AsString()
		if sc, ok := tsutil.GetArrayPropertyValue(firstArg, "scopes"); ok {
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
		if v := tsutil.GetPropertyValue(firstArg, "version"); v.Present {
			var f float64
			var err error
			switch {
			case v.Num != nil:
				f = *v.Num
			case v.Str != nil:
				f, err = strconv.ParseFloat(*v.Str, 64)
			case v.Bool != nil && *v.Bool:
				f = 1
			}
			if err == nil && f >= 1 && f == float64(int(f)) {
				version = int(f)
			}
		}
		nodeCfg = s.readNodeConfig(firstArg, name)
		for _, p := range firstArg.Properties() {
			if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) {
				pn := p.Name().Text()
				if pn != "input" && pn != "output" {
					continue
				}
				switch init := p.Initializer(); {
				case ast.IsIdentifier(init):
					ref := s.resolveSchemaRef(init, "Function '"+name+"' "+pn)
					if ref == nil {
						break
					}
					if pn == "input" {
						inputSchemaRef = ref
					} else {
						outputSchemaRef = ref
					}
				case ast.IsCallExpression(init):
					schemaName := tsutil.FuncIdToTypeName(name) + strings.ToUpper(pn[:1]) + pn[1:]
					s.Log.Diagnostic(diag.Error, diag.InlineSchema,
						"Inline schemas are not supported for '"+pn+"' in '"+name+"'; "+
							"it is validated against its TypeScript type only, so refinements are not enforced.\n"+
							"  Extract to an exported variable:\n"+
							"    export const "+schemaName+" = "+tsutil.NodeText(init)+"\n"+
							"  Then use: "+pn+": "+schemaName)
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
		pikkuFuncId = tsutil.FormatVersionedId(base, version)
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
	if resolvedFunc != nil && tsutil.IsFunctionLike(resolvedFunc) {
		handler = resolvedFunc
	}
	if !tsutil.IsFunctionLike(handler) {
		s.State.Functions.Meta.Set(pikkuFuncId, &FunctionMeta{
			PikkuFuncId: pikkuFuncId, FunctionType: "user", Name: name,
			Services: ServicesMeta{Optimized: false, Services: []string{}},
			Inputs:   []string{}, Outputs: []string{},
		})
		return
	}

	services := ServicesMeta{Optimized: true, Services: []string{}}
	addServices := func(fnNode *ast.Node, dedupe bool) {
		p := tsutil.ParamAt(fnNode, 0)
		if p == nil {
			return
		}
		if ast.IsObjectBindingPattern(p.Name()) {
			for _, n := range tsutil.BindingNames(p) {
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
	if compensateInit != nil && tsutil.IsFunctionLike(compensateInit) {
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
		m.Compensate = tsutil.BoolPtr(true)
	}

	body := handler.Body()
	if inv := tsutil.CollectInvokedRpcNames(body); len(inv) > 0 {
		m.Invokes = inv
	}

	// --- Generics → types, unwrapped from Promise ---
	var generics []*checker.Type
	for _, tn := range node.TypeArguments() {
		generics = append(generics, s.unwrapPromise(s.Checker.GetTypeFromTypeNode(tn)))
	}
	isChannelConnection := channelConnRe.MatchString(wrapper)
	capitalized := tsutil.FuncIdToTypeName(name)

	var inputNames, outputNames []string
	var inputTypes []*checker.Type
	tm := s.TypesMap()
	switch {
	case inputSchemaRef != nil:
		inputNames = []string{capitalized + "Input"}
		s.State.SchemaLookup.Set(inputNames[0], *inputSchemaRef)
		tm.AddCustomType(inputNames[0], "unknown", nil)
	case isListFunc && len(generics) >= 1:
		inputNames = []string{capitalized + "Input"}
		refs := s.resolveTypeImports(generics[0], true)
		tm.AddCustomType(inputNames[0], "{ cursor?: string; limit?: number; sort?: Array<{ column: string; direction: 'asc' | 'desc' }>; filter?: unknown; search?: string; } & "+s.typeToString(generics[0]), tsutil.Dedupe(refs))
		if p := tsutil.ParamAt(handler, 1); p != nil {
			inputTypes = []*checker.Type{s.Checker.GetTypeAtLocation(p)}
		} else {
			inputTypes = []*checker.Type{generics[0]}
		}
	case !isChannelConnection && !isListFunc && len(generics) >= 1:
		inputNames, inputTypes = s.getNamesAndTypes("Input", name, generics[0])
	default:
		if p := tsutil.ParamAt(handler, 1); p != nil {
			inputNames, inputTypes = s.getNamesAndTypes("Input", pikkuFuncId, s.Checker.GetTypeAtLocation(p))
		}
	}
	if isWebhookReceive {
		inputNames = nil
	}

	switch {
	case outputSchemaRef != nil:
		outputNames = []string{capitalized + "Output"}
		s.State.SchemaLookup.Set(outputNames[0], *outputSchemaRef)
		tm.AddCustomType(outputNames[0], "unknown", nil)
	case isListFunc && len(generics) >= 2:
		outputNames = []string{capitalized + "Output"}
		refs := s.resolveTypeImports(generics[1], true)
		tm.AddCustomType(outputNames[0], "{ rows: Array<"+s.typeToString(generics[1])+">; nextCursor: string | null; totalCount?: number; }", tsutil.Dedupe(refs))
	case !isListFunc && len(generics) >= 2:
		outputNames, _ = s.getNamesAndTypes("Output", name, generics[1])
	default:
		if sig := s.Checker.GetSignatureFromDeclaration(handler); sig != nil {
			ret := s.unwrapPromise(s.Checker.GetReturnTypeOfSignature(sig))
			outputNames, _ = s.getNamesAndTypes("Output", pikkuFuncId, ret)
		}
	}
	mcpOutputTypes := map[string]string{
		"pikkuMCPResourceFunc": "MCPResourceResponse",
		"pikkuMCPToolFunc":     "MCPToolResponse",
		"pikkuMCPPromptFunc":   "MCPPromptResponse",
	}
	if t, ok := mcpOutputTypes[wrapper]; ok && (len(outputNames) == 0 || outputNames[0] != t) {
		if !s.registerMCPOutputType(expression, t) {
			tm.AddCustomType(t, t, nil)
		}
		outputNames = []string{t}
	}

	if len(inputNames) > 1 {
		s.Log.Warn("More than one input type detected, only the first one will be used as a schema.")
	}
	if len(inputTypes) > 0 {
		s.typesLookup[pikkuFuncId] = inputTypes
	}

	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	if existing := s.State.Functions.Meta.At(pikkuFuncId); existing != nil && existing.SourceFile != "" && existing.SourceFile != sourceFile {
		s.Log.Critical(diag.DuplicateFunctionName, fmt.Sprintf("Function name '%s' is not unique. '%s' is already defined in '%s' and cannot be redefined in '%s'.",
			name, pikkuFuncId, existing.SourceFile, sourceFile))
		return
	}
	if fn.exportedName != "" || fn.explicitName != "" {
		if existing := s.State.RPC.InternalMeta.At(name); existing != "" && !areCompatibleFunctionIds(existing, pikkuFuncId) {
			s.Log.Critical(diag.DuplicateFunctionName, fmt.Sprintf("Function name '%s' is not unique. It already points to '%s' in '%s', but '%s' in '%s' tried to use the same name.",
				name, existing, s.existingFunctionSource(existing), pikkuFuncId, sourceFile))
			return
		}
		if expose {
			if existing := s.State.RPC.ExposedMeta.At(name); existing != "" && !areCompatibleFunctionIds(existing, pikkuFuncId) {
				s.Log.Critical(diag.DuplicateFunctionName, fmt.Sprintf("Exposed function name '%s' is not unique. It already points to '%s' in '%s', but '%s' in '%s' tried to use the same name.",
					name, existing, s.existingFunctionSource(existing), pikkuFuncId, sourceFile))
				return
			}
		}
	}

	m.Sessionless = tsutil.BoolPtr(wrapper != "pikkuFunc")
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
	m.Expose = tsutil.OrNil(expose)
	if isWebhookReceive {
		m.Auth = tsutil.BoolPtr(false)
	}
	m.ScenarioStep = tsutil.OrNil(isScenarioStep)
	m.WebhookReceive = tsutil.OrNil(isWebhookReceive)
	m.Scenario = tsutil.OrNil(isScenario)
	m.MCP = tsutil.OrNil(mcpEnabled)
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
	m.IsDirectFunction = tsutil.BoolPtr(isDirect)
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
		bs = lineOf(tsutil.NodeStart(stmts[0]))
		be = lineOf(stmts[len(stmts)-1].End())
	} else {
		bs = lineOf(tsutil.NodeStart(body))
		be = lineOf(body.End())
	}
	m.BodyStart, m.BodyEnd = &bs, &be
	if sw := tsutil.CollectStartedWorkflows(body); len(sw) > 0 {
		m.StartsWorkflows = sw
	}

	s.State.Functions.Meta.Set(pikkuFuncId, m)
	if nodeCfg != nil {
		s.addNodeMeta(nodeCfg, ast.GetSourceFileOfNode(node).FileName(), pikkuFuncId, m)
	}
	if mcpEnabled {
		s.addMCPTool(objectNode, sourceFile, name, m)
		s.State.ServiceAggregation.UsedFunctions.Add(pikkuFuncId)
		s.addUsedWires(m)
	}
	s.registerRPC(rpcRegistration{
		wrapper: wrapper, pikkuFuncId: pikkuFuncId, name: name,
		exportedName: fn.exportedName, explicitName: fn.explicitName,
		sourceFile: sourceFile, expose: expose, remote: m.Remote != nil && *m.Remote,
		mcpEnabled: mcpEnabled, notRpc: isScenarioStep || isWebhookReceive, versioned: version != 0,
	})
}

func (s *Context) existingFunctionSource(id string) string {
	if m := s.State.Functions.Meta.At(id); m != nil && m.SourceFile != "" {
		return m.SourceFile
	}
	if f, ok := s.State.RPC.InternalFiles.Get(id); ok && f.Path != "" {
		return f.Path
	}
	return "unknown file"
}

func (s *Context) addUsedWires(m *FunctionMeta) {
	for _, w := range m.Middleware {
		if w.Type == "wire" {
			s.State.ServiceAggregation.UsedMiddleware.Add(w.Name)
		}
	}
	for _, w := range m.Permissions {
		if w.Type == "wire" {
			s.State.ServiceAggregation.UsedPermissions.Add(w.Name)
		}
	}
}

var nonRPCPattern = regexp.MustCompile(`(?i)Trigger|ChannelConnection|ChannelDisconnection`)

type rpcRegistration struct {
	wrapper, pikkuFuncId, name, exportedName, explicitName, sourceFile string
	expose, remote, mcpEnabled, notRpc, versioned                      bool
}

// registerRPC is the tail of addFunctions: the function's file and its RPC
// entries.
func (s *Context) registerRPC(r rpcRegistration) {
	if strings.Contains(r.wrapper, "Workflow") || nonRPCPattern.MatchString(r.wrapper) {
		return
	}
	st := s.State
	file := state.FileExport{Path: r.sourceFile, ExportedName: r.exportedName}
	if r.exportedName != "" {
		st.Functions.Files.Set(r.pikkuFuncId, file)
	}
	if r.exportedName == "" && r.explicitName == "" {
		return
	}
	if r.exportedName == "" {
		s.Log.Error(fmt.Sprintf("• Function with explicit name '%s' is not exported, this is not allowed.", r.name))
		return
	}
	if r.remote && !r.notRpc {
		st.RPC.InvokedFunctions.Add(r.pikkuFuncId)
		st.RPC.RemoteMeta.Set(r.name, r.pikkuFuncId)
		st.RPC.RemoteFiles.Set(r.name, file)
	}
	if r.expose && !r.notRpc {
		st.RPC.ExposedMeta.Set(r.name, r.pikkuFuncId)
		st.RPC.ExposedFiles.Set(r.name, file)
		st.ServiceAggregation.UsedFunctions.Add(r.pikkuFuncId)
	}
	if !r.notRpc {
		st.RPC.InternalMeta.Set(r.name, r.pikkuFuncId)
		if r.versioned {
			st.RPC.InternalMeta.Set(r.pikkuFuncId, r.pikkuFuncId)
			st.RPC.InvokedFunctions.Add(r.pikkuFuncId)
		}
	}
	if st.RPC.InvokedFunctions.Has(r.pikkuFuncId) || r.expose || r.remote || r.mcpEnabled {
		st.RPC.InternalFiles.Set(r.pikkuFuncId, file)
	}
}

// registerMCPOutputType records where the wrapper's MCP response type is
// declared, resolved from the wrapper's own declaration.
func (s *Context) registerMCPOutputType(wrapperIdent *ast.Node, typeName string) bool {
	sym := s.resolveAlias(s.Checker.GetSymbolAtLocation(wrapperIdent))
	if sym == nil {
		return false
	}
	for _, d := range sym.Declarations {
		ts := s.Checker.ResolveName(typeName, d, ast.SymbolFlagsType, false)
		if ts == nil {
			continue
		}
		if decl := tsutil.FirstDecl(s.resolveAlias(ts)); decl != nil {
			path := ast.GetSourceFileOfNode(decl).FileName()
			if s.TypesMap().Exists(typeName, path) == "" {
				s.TypesMap().AddType(typeName, path)
			}
			return true
		}
	}
	return false
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

func implementationHash(wrapper string, handler, objectNode *ast.Node, isDirect bool) string {
	var config any
	if objectNode != nil {
		config = tsutil.PrintNode(objectNode)
	}
	// canonicalJSON: keys sorted; JSON.stringify does not HTML-escape.
	payload := []any{
		[2]any{"config", config}, [2]any{"handler", tsutil.PrintNode(handler)},
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
