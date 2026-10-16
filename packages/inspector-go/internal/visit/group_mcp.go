package visit

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-mcp-resource.ts (addMCPResource), add/add-mcp-prompt.ts
// (addMCPPrompt) and the MCP tool branch of add/add-functions.ts.

func init() {
	Register(Visitor{Name: "addMCPResource", Phase: PhaseRoutes, Order: OrderAddMCPResource, Visit: (*Context).addMCPResource})
	Register(Visitor{Name: "addMCPPrompt", Phase: PhaseRoutes, Order: OrderAddMCPPrompt, Visit: (*Context).addMCPPrompt})
}

// commonWireMetaChecked is getCommonWireMetaData called with a logger: the
// metadata plus its diagnostics (non-literal name, non-array tags / errors).
func (s *Context) commonWireMetaChecked(obj *ast.Node, wiringType, wiringName string) commonMeta {
	s.assertStringLiteralProperty(obj, "name", wiringType)
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) || ast.IsArrayLiteralExpression(p.Initializer()) {
			continue
		}
		switch p.Name().Text() {
		case "tags":
			s.Log.Critical(diag.InvalidTagsType, fmt.Sprintf("%s '%s' has invalid 'tags' property - must be an array of strings.", wiringType, jsNullable(wiringName)))
		case "errors":
			s.Log.Critical(diag.InvalidTagsType, fmt.Sprintf("%s '%s' has invalid 'errors' property - must be an array of error identifiers.", wiringType, jsNullable(wiringName)))
		}
	}
	return s.getCommonWireMetaData(obj)
}

// jsNullable renders a `string | null` the way a template literal does.
func jsNullable(v string) string {
	if v == "" {
		return "null"
	}
	return v
}

// mcpEndpointFunc is the part addMCPResource and addMCPPrompt share: resolve
// the `func`, its id (falling back to `mcp:<kind>:<key>` for an inline one) and
// the addon it comes from, and make sure it has function metadata.
func (s *Context) mcpEndpointFunc(obj *ast.Node, kind, label, key string) (funcInit *ast.Node, pikkuFuncId, packageName string, ok bool) {
	funcInit = s.getPropertyAssignmentInitializer(obj, "func", true)
	if funcInit == nil {
		s.Log.Critical(diag.MissingFunc, fmt.Sprintf("No valid 'func' property for %s '%s'.", label, jsNullable(key)))
		return nil, "", "", false
	}
	pikkuFuncId = s.extractFunctionName(funcInit).pikkuFuncId
	if strings.HasPrefix(pikkuFuncId, "__temp_") && key != "" {
		pikkuFuncId = "mcp:" + kind + ":" + key
	}
	if ast.IsIdentifier(funcInit) {
		packageName = s.resolveAddonName(funcInit)
	}
	s.ensureFunctionMetadata(pikkuFuncId, key, funcInit)
	return funcInit, pikkuFuncId, packageName, true
}

// mcpFunctionSchemas reads the endpoint's input/output schema from its
// function metadata, defaulting the function's output to the MCP response
// type; nil fnMeta after logging when there is none.
func (s *Context) mcpFunctionSchemas(pikkuFuncId, responseType string) (fnMeta *FunctionMeta, input, output *string) {
	fnMeta = s.State.Functions.Meta.At(pikkuFuncId)
	if fnMeta == nil {
		s.Log.Critical(diag.FunctionMetadataNotFound, fmt.Sprintf("No function metadata found for '%s'.", pikkuFuncId))
		return nil, nil, nil
	}
	input, output = firstOrNil(fnMeta.Inputs), firstOrNil(fnMeta.Outputs)
	if fnMeta.OutputSchemaName == nil || *fnMeta.OutputSchemaName == "" {
		t := responseType
		fnMeta.OutputSchemaName = &t
		fnMeta.Outputs = []string{responseType}
	}
	return fnMeta, input, output
}

// firstOrNil is `list?.[0] || null`.
func firstOrNil(list []string) *string {
	if len(list) == 0 || list[0] == "" {
		return nil
	}
	v := list[0]
	return &v
}

func (s *Context) addMCPResource(node *ast.Node) {
	obj := wiringCall(node, "wireMCPResource")
	if obj == nil {
		return
	}
	uri := tsutil.GetPropertyValue(obj, "uri").AsString()
	title := tsutil.GetPropertyValue(obj, "title").AsString()
	cm := s.commonWireMetaChecked(obj, "MCP resource", uri)
	if cm.disabled {
		return
	}
	streaming := tsutil.GetPropertyValue(obj, "streaming")
	if streaming.Bool != nil && *streaming.Bool {
		s.Log.Warn(fmt.Sprintf("MCP resource '%s' has streaming enabled, but streaming is not yet supported.", jsNullable(uri)))
	}
	_, pikkuFuncId, packageName, ok := s.mcpEndpointFunc(obj, "resource", "MCP resource", uri)
	if !ok {
		return
	}
	if uri == "" {
		s.Log.Critical(diag.MissingUri, "MCP resource is missing the required 'uri' property.")
		return
	}
	if title == "" {
		s.Log.Critical(diag.MissingTitle, fmt.Sprintf("MCP resource '%s' is missing the required 'title' property.", uri))
		return
	}
	if cm.description == nil || *cm.description == "" {
		s.Log.Critical(diag.MissingDescription, fmt.Sprintf("MCP resource '%s' is missing a description.", uri))
		return
	}
	fnMeta, input, output := s.mcpFunctionSchemas(pikkuFuncId, "MCPResourceResponse")
	if fnMeta == nil {
		return
	}
	var tags []string
	if cm.hasTags {
		tags = cm.tags
	}
	middleware := s.resolveMiddleware(obj, tags)
	permissions := s.resolvePermissions(obj)
	s.State.ServiceAggregation.UsedFunctions.Add(pikkuFuncId)
	s.addUsedWires(&FunctionMeta{Middleware: middleware, Permissions: permissions})
	s.State.MCPEndpoints.Files.Add(ast.GetSourceFileOfNode(node).FileName())

	m := &state.MCPResourceMeta{
		PikkuFuncId: pikkuFuncId, PackageName: packageName, URI: uri, Title: title,
		Description: *cm.description, Summary: cm.summary, Tags: tags,
		InputSchema: input, OutputSchema: output, Middleware: middleware,
	}
	if cm.hasErrors {
		m.Errors = cm.errors
	}
	if streaming.Bool != nil {
		m.Streaming = streaming.Bool
	}
	s.State.MCPEndpoints.ResourcesMeta.Set(uri, m)
}

func (s *Context) addMCPPrompt(node *ast.Node) {
	obj := wiringCall(node, "wireMCPPrompt")
	if obj == nil {
		return
	}
	name := tsutil.GetPropertyValue(obj, "name").AsString()
	cm := s.commonWireMetaChecked(obj, "MCP prompt", name)
	if cm.disabled {
		return
	}
	_, pikkuFuncId, packageName, ok := s.mcpEndpointFunc(obj, "prompt", "MCP prompt", name)
	if !ok {
		return
	}
	if name == "" {
		s.Log.Critical(diag.MissingName, "MCP prompt is missing the required 'name' property.")
		return
	}
	if cm.description == nil || *cm.description == "" {
		s.Log.Critical(diag.MissingDescription, fmt.Sprintf("MCP prompt '%s' is missing a description.", name))
		return
	}
	fnMeta, input, output := s.mcpFunctionSchemas(pikkuFuncId, "MCPPromptResponse")
	if fnMeta == nil {
		return
	}
	var tags []string
	if cm.hasTags {
		tags = cm.tags
	}
	middleware := s.resolveMiddleware(obj, tags)
	permissions := s.resolvePermissions(obj)
	s.State.ServiceAggregation.UsedFunctions.Add(pikkuFuncId)
	s.addUsedWires(&FunctionMeta{Middleware: middleware, Permissions: permissions})
	s.State.MCPEndpoints.Files.Add(ast.GetSourceFileOfNode(node).FileName())

	m := &state.MCPPromptMeta{
		PikkuFuncId: pikkuFuncId, PackageName: packageName, Name: name,
		Description: *cm.description, Summary: cm.summary, Tags: tags,
		InputSchema: input, OutputSchema: output, Arguments: state.List[state.Raw]{},
		Middleware: middleware,
	}
	if cm.hasErrors {
		m.Errors = cm.errors
	}
	s.State.MCPEndpoints.PromptsMeta.Set(name, m)
}

// addMCPTool is the `if (mcpEnabled)` branch of addFunctions. A declared
// `name` is the label an AI client calls the tool by; it does not change the
// pikkuFuncId.
func (s *Context) addMCPTool(objectNode *ast.Node, sourceFile, name string, m *FunctionMeta) {
	toolName := name
	if objectNode != nil {
		if v := tsutil.GetPropertyValue(objectNode, "name"); v.Str != nil && *v.Str != "" {
			toolName = *v.Str
		}
	}
	if m.Description == nil || *m.Description == "" {
		s.Log.Warn(fmt.Sprintf("MCP tool '%s' is missing a description.", toolName))
	}
	s.State.MCPEndpoints.Files.Add(sourceFile)
	tool := &state.MCPToolMeta{
		PikkuFuncId: m.PikkuFuncId, Name: toolName,
		Summary: m.Summary, Errors: m.Errors, Tags: m.Tags,
		InputSchema: m.InputSchemaName, OutputSchema: m.OutputSchemaName,
		Middleware: m.Middleware,
	}
	if m.Title != nil && *m.Title != "" {
		tool.Title = m.Title
	}
	if m.Description != nil && *m.Description != "" {
		tool.Description = m.Description
	}
	s.State.MCPEndpoints.ToolsMeta.Set(toolName, tool)
}
