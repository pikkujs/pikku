package visit

import (
	"fmt"
	"slices"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-http-route.ts, add/add-http-routes.ts, add/add-queue-worker.ts
// and utils/ensure-function-metadata.ts.

var httpMethods = []string{"get", "post", "put", "delete", "head", "patch", "options"}

func init() {
	Register(Visitor{Name: "addHTTPRoute", Phase: PhaseRoutes, Order: OrderAddHTTPRoute, Visit: (*Context).addHTTPRoute})
	Register(Visitor{Name: "addHTTPRoutes", Phase: PhaseRoutes, Order: OrderAddHTTPRoutes, Visit: (*Context).addHTTPRoutes})
	Register(Visitor{Name: "addQueueWorker", Phase: PhaseRoutes, Order: OrderAddQueueWorker, Visit: (*Context).visitQueueWorker})
}

// wiringCall returns the object-literal first argument of a `<callee>({...})`
// call, or nil.
func wiringCall(node *ast.Node, callee string) *ast.Node {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != callee {
		return nil
	}
	args := node.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return nil
	}
	return args[0]
}

func (s *Context) addHTTPRoute(node *ast.Node) {
	if obj := wiringCall(node, "wireHTTP"); obj != nil {
		s.registerHTTPRoute(obj, s.SourceFile.FileName(), groupConfig{})
	}
}

func (s *Context) addHTTPRoutes(node *ast.Node) {
	if s.addExportedHTTPRoutes(node) {
		return
	}
	obj := wiringCall(node, "wireHTTPRoutes")
	if obj == nil {
		return
	}
	group := extractGroupConfig(obj)
	if p := tsutil.FindPropertyAssignment(obj, "routes"); p != nil {
		s.processRoutes(p.Initializer(), group, s.SourceFile.FileName())
	}
}

func (s *Context) visitQueueWorker(node *ast.Node) {
	if obj := wiringCall(node, "wireQueueWorker"); obj != nil {
		s.addQueueWorker(obj, s.SourceFile.FileName())
	}
}

// --- wireHTTPRoutes -----------------------------------------------------------

type groupConfig struct {
	basePath string
	tags     []string
	auth     *bool
}

func extractGroupConfig(obj *ast.Node) groupConfig {
	g := groupConfig{basePath: tsutil.GetPropertyValue(obj, "basePath").AsString()}
	g.tags = append([]string{}, tsutil.GetPropertyValue(obj, "tags").Strs...)
	g.auth = tsutil.GetPropertyValue(obj, "auth").Bool
	return g
}

func mergeConfigs(parent, child groupConfig) groupConfig {
	auth := child.auth
	if auth == nil {
		auth = parent.auth
	}
	return groupConfig{
		basePath: parent.basePath + child.basePath,
		tags:     append(append([]string{}, parent.tags...), child.tags...),
		auth:     auth,
	}
}

func hasAssignedProps(obj *ast.Node) map[string]bool {
	out := map[string]bool{}
	for _, p := range obj.Properties() {
		if ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) {
			out[p.Name().Text()] = true
		}
	}
	return out
}

func isRouteConfig(obj *ast.Node) bool {
	h := hasAssignedProps(obj)
	return h["method"] && h["func"] && h["route"]
}

func isRouteContract(obj *ast.Node) bool {
	h := hasAssignedProps(obj)
	return h["routes"] && !h["method"] && !h["func"]
}

func (s *Context) processRoutes(node *ast.Node, parent groupConfig, sourceFile string) {
	switch {
	case ast.IsArrayLiteralExpression(node):
		for _, e := range node.Elements() {
			if ast.IsObjectLiteralExpression(e) && isRouteConfig(e) {
				s.registerHTTPRoute(e, sourceFile, parent)
			}
		}
	case ast.IsObjectLiteralExpression(node):
		if isRouteConfig(node) {
			s.registerHTTPRoute(node, sourceFile, parent)
			return
		}
		if isRouteContract(node) {
			merged := mergeConfigs(parent, extractGroupConfig(node))
			if p := tsutil.FindPropertyAssignment(node, "routes"); p != nil {
				s.processRoutes(p.Initializer(), merged, sourceFile)
			}
			return
		}
		for _, p := range node.Properties() {
			if ast.IsPropertyAssignment(p) {
				if !s.processRefHTTPContract(p.Initializer(), parent, sourceFile) {
					s.processRoutes(p.Initializer(), parent, sourceFile)
				}
			}
		}
	case ast.IsCallExpression(node):
		s.processRefHTTPContract(node, parent, sourceFile)
	case ast.IsIdentifier(node):
		if resolved := s.resolveIdentifier(node, "defineHTTPRoutes"); resolved != nil {
			s.processRoutes(resolved, parent, sourceFile)
		}
	}
}

// exportedRoute is ExportedHTTPRouteConfigMeta or ExportedHTTPRoutesGroupMeta,
// as an addon's pikku-http-contracts-meta.gen.json holds them.
type exportedRoute struct {
	Method   *string `json:"method"`
	Route    *string `json:"route"`
	BasePath string  `json:"basePath"`
	Tags     []string
	Auth     *bool
	SSE      bool
	Func     *struct {
		PikkuFuncId string `json:"pikkuFuncId"`
		PackageName string `json:"packageName"`
	} `json:"func"`
	Routes state.Raw `json:"routes"`
}

// processRefHTTPContract is processRefHTTPContract: refHTTP('ns:name') mounts
// the routes the addon exported, under the consumer's basePath when it
// passes one. It reports whether node was such a call.
func (s *Context) processRefHTTPContract(node *ast.Node, parent groupConfig, sourceFile string) bool {
	raw, ok := resolveRefContract(node, "refHTTP", &s.State.ExportedContracts.AddonHTTP)
	if !ok {
		return false
	}
	var contract exportedRoute
	if raw.Decode(&contract) != nil {
		return true
	}
	basePath := contract.BasePath
	if args := node.Arguments(); len(args) > 1 && ast.IsObjectLiteralExpression(args[1]) {
		if p := tsutil.FindPropertyAssignment(args[1], "basePath"); p != nil && ast.IsStringLiteral(p.Initializer()) {
			basePath = p.Initializer().Text()
		}
	}
	s.processExportedRouteMap(contract.Routes, mergeConfigs(parent, groupConfig{basePath: basePath, tags: contract.Tags, auth: contract.Auth}), sourceFile)
	return true
}

func (s *Context) processExportedRouteMap(routes state.Raw, parent groupConfig, sourceFile string) {
	var entries state.Record[state.Raw]
	if routes.Decode(&entries) != nil {
		return
	}
	entries.Each(func(_ string, raw state.Raw) {
		var value exportedRoute
		if raw.Decode(&value) != nil {
			return
		}
		switch {
		case value.Method != nil && value.Route != nil && value.Func != nil:
			s.registerHTTPRouteMeta(&value, sourceFile, parent)
		case value.Routes != nil && value.Method == nil:
			s.processExportedRouteMap(value.Routes, mergeConfigs(parent, groupConfig{basePath: value.BasePath, tags: value.Tags, auth: value.Auth}), sourceFile)
		default:
			s.processExportedRouteMap(raw, parent, sourceFile)
		}
	})
}

// registerHTTPRouteMeta is registerHTTPRouteMeta: one route an addon exported,
// recorded from its metadata rather than from source.
func (s *Context) registerHTTPRouteMeta(route *exportedRoute, sourceFile string, group groupConfig) {
	method := strings.ToLower(*route.Method)
	fullRoute := group.basePath + *route.Route
	tags := append(append([]string{}, group.tags...), route.Tags...)
	funcName := route.Func.PikkuFuncId
	fnMeta := s.resolveFunctionMeta(funcName)
	if fnMeta == nil {
		s.Log.Critical(diag.FunctionMetadataNotFound, fmt.Sprintf("No function metadata found for '%s'.", funcName))
		return
	}
	params, err := tsutil.PathParams(fullRoute)
	if err != nil {
		s.Log.Error(fmt.Sprintf("Failed to parse route '%s': %s", fullRoute, err))
		return
	}
	if route.Func.PackageName == "" {
		var input string
		if len(fnMeta.Inputs) > 0 {
			input = fnMeta.Inputs[0]
		}
		s.computeInputTypes(method, input, nil, params)
	}
	auth := route.Auth
	if auth == nil {
		auth = group.auth
	}
	meta := &HTTPRouteMeta{
		PikkuFuncId: funcName, PackageName: route.Func.PackageName, Route: fullRoute,
		SourceFile: sourceFile, Method: method, Auth: auth, GroupBasePath: group.basePath,
	}
	if len(params) > 0 {
		meta.Params = params
	}
	if len(tags) > 0 {
		meta.Tags = tags
	}
	if route.SSE {
		meta.SSE = tsutil.BoolPtr(true)
	}
	s.State.ServiceAggregation.UsedFunctions.Add(funcName)
	s.State.HTTP.Files.Add(sourceFile)
	routes, ok := s.State.HTTP.Meta.Get(method)
	if !ok {
		routes = state.NewRecord[*HTTPRouteMeta]()
		s.State.HTTP.Meta.Set(method, routes)
	}
	routes.Set(fullRoute, meta)
}

func (s *Context) resolveIdentifier(node *ast.Node, unwrap ...string) *ast.Node {
	sym := s.resolveAlias(s.Checker.GetSymbolAtLocation(node))
	if sym == nil {
		return nil
	}
	decl := sym.ValueDeclaration
	if decl == nil {
		decl = tsutil.FirstDecl(sym)
	}
	if decl == nil || !ast.IsVariableDeclaration(decl) || decl.Initializer() == nil {
		return nil
	}
	init := decl.Initializer()
	if ast.IsCallExpression(init) && ast.IsIdentifier(init.Expression()) {
		for _, u := range unwrap {
			if init.Expression().Text() == u {
				if a := init.Arguments(); len(a) > 0 {
					return a[0]
				}
				return nil
			}
		}
	}
	return init
}

// --- wireHTTP / one route -----------------------------------------------------

func (s *Context) registerHTTPRoute(obj *ast.Node, sourceFile string, group groupConfig) {
	routePath := tsutil.GetPropertyValue(obj, "route").AsString()
	if routePath == "" {
		return
	}
	method := strings.ToLower(tsutil.GetPropertyValue(obj, "method").AsString())
	if method == "" {
		method = "get"
	}
	fullRoute := group.basePath + routePath
	params, err := tsutil.PathParams(fullRoute)
	if err != nil {
		s.Log.Error(fmt.Sprintf("Failed to parse route '%s': %s", fullRoute, err))
		return
	}
	cm := s.getCommonWireMetaData(obj)
	if cm.disabled {
		return
	}
	tags := append(append([]string{}, group.tags...), cm.tags...)
	query := tsutil.GetPropertyValue(obj, "query").Strs

	funcInit := s.getPropertyAssignmentInitializer(obj, "func", true)
	if funcInit == nil {
		s.Log.Critical(diag.MissingFunc, fmt.Sprintf("No valid 'func' property for route '%s'.", fullRoute))
		return
	}
	extracted := s.extractFunctionName(funcInit)
	funcName := extracted.pikkuFuncId
	if strings.HasPrefix(funcName, "__temp_") {
		funcName = "http:" + method + ":" + fullRoute
	}
	refTarget := ""
	if ast.IsCallExpression(funcInit) && ast.IsIdentifier(funcInit.Expression()) && funcInit.Expression().Text() == "ref" {
		if a := funcInit.Arguments(); len(a) > 0 && ast.IsStringLiteral(a[0]) && strings.Contains(a[0].Text(), ":") {
			refTarget = a[0].Text()
		}
	}
	packageName := ""
	if ast.IsIdentifier(funcInit) {
		packageName = s.resolveAddonName(funcInit)
	}
	if refTarget != "" {
		if s.resolveFunctionMeta(refTarget) == nil {
			s.Log.Warn(fmt.Sprintf("Skipping route '%s': addon function metadata for '%s' is not available yet.", fullRoute, refTarget))
			return
		}
		funcName = refTarget
	} else {
		s.ensureFunctionMetadata(funcName, fullRoute, funcInit, extracted.isHelper)
	}

	resolvedAuth := tsutil.GetPropertyValue(obj, "auth").Bool
	if resolvedAuth == nil {
		resolvedAuth = group.auth
	}
	if m := s.State.Functions.Meta.At(funcName); m != nil && m.Sessionless == nil && resolvedAuth != nil && !*resolvedAuth {
		m.Sessionless = tsutil.BoolPtr(true)
	}
	fnMeta := s.resolveFunctionMeta(funcName)
	if fnMeta == nil {
		s.Log.Critical(diag.FunctionMetadataNotFound, fmt.Sprintf("No function metadata found for '%s'.", funcName))
		return
	}
	if !s.validateAuthSessionless(obj, funcName, fmt.Sprintf("Route '%s'", fullRoute), group.auth) {
		return
	}
	if len(params) > 0 || len(query) > 0 {
		if keys, ok := s.routeInputKeys(funcName); ok {
			if missing := missingFrom(params, keys); len(missing) > 0 {
				s.Log.Critical(diag.RouteParamMismatch, fmt.Sprintf("Route '%s' has path parameter(s) [%s] not found in function '%s' input type. Input type has: [%s]",
					fullRoute, strings.Join(missing, ", "), funcName, strings.Join(keys, ", ")))
				return
			}
			if missing := missingFrom(query, keys); len(missing) > 0 {
				s.Log.Critical(diag.RouteQueryMismatch, fmt.Sprintf("Route '%s' has query parameter(s) [%s] not found in function '%s' input type. Input type has: [%s]",
					fullRoute, strings.Join(missing, ", "), funcName, strings.Join(keys, ", ")))
				return
			}
		}
	}
	var input string
	if len(fnMeta.Inputs) > 0 {
		input = fnMeta.Inputs[0]
	}
	s.computeInputTypes(method, input, query, params)

	route := &HTTPRouteMeta{
		PikkuFuncId: funcName, PackageName: packageName, Route: fullRoute,
		SourceFile: sourceFile, Method: method, Auth: resolvedAuth,
		Title: cm.title, Summary: cm.summary, Description: cm.description, Errors: cm.errors,
		Middleware:    s.resolveHTTPMiddleware(fullRoute, obj, tags),
		Permissions:   s.resolvePermissions(obj),
		GroupBasePath: group.basePath,
	}
	s.State.ServiceAggregation.UsedFunctions.Add(funcName)
	s.addUsedWires(&FunctionMeta{Middleware: route.Middleware, Permissions: route.Permissions})
	if len(params) > 0 {
		route.Params = params
	}
	if len(query) > 0 {
		route.Query = query
	}
	if len(tags) > 0 {
		route.Tags = tags
	}
	if v := tsutil.GetPropertyValue(obj, "sse").Bool; v != nil && *v {
		route.SSE = tsutil.BoolPtr(true)
	}
	if h := s.getPropertyAssignmentInitializer(obj, "headers", true); h != nil && ast.IsIdentifier(h) {
		// TS also checks the schema vendor and registers a schemaLookup entry.
		route.HeadersSchemaName = strings.ToUpper(method) + "_" + strings.Trim(tsutil.NonAlnum.ReplaceAllString(fullRoute, "_"), "_") + "_Headers"
	}
	s.State.HTTP.Files.Add(sourceFile)
	routes, ok := s.State.HTTP.Meta.Get(method)
	if !ok {
		routes = state.NewRecord[*HTTPRouteMeta]()
		s.State.HTTP.Meta.Set(method, routes)
	}
	routes.Set(fullRoute, route)
}

// --- wireQueueWorker -----------------------------------------------------------

func (s *Context) addQueueWorker(obj *ast.Node, sourceFile string) {
	name := tsutil.GetPropertyValue(obj, "name").AsString()
	cm := s.getCommonWireMetaData(obj)
	if cm.disabled {
		return
	}
	funcInit := s.getPropertyAssignmentInitializer(obj, "func", true)
	if funcInit == nil {
		s.Log.Critical(diag.MissingFunc, fmt.Sprintf("No valid 'func' property for queue processor '%s'.", name))
		return
	}
	extracted := s.extractFunctionName(funcInit)
	pikkuFuncId := extracted.pikkuFuncId
	if strings.HasPrefix(pikkuFuncId, "__temp_") && name != "" {
		pikkuFuncId = "queue:" + name
	}
	packageName := ""
	if ast.IsIdentifier(funcInit) {
		packageName = s.resolveAddonName(funcInit)
	}
	if name == "" {
		s.Log.Critical(diag.MissingQueueName, fmt.Sprintf("No 'name' provided for queue processor function '%s'.", pikkuFuncId))
		return
	}
	s.ensureInlineWiringFunction(pikkuFuncId, name, funcInit, extracted.isHelper)
	var tags []string
	if cm.hasTags {
		tags = cm.tags
	}
	middleware := s.resolveMiddleware(obj, tags)
	s.State.ServiceAggregation.UsedFunctions.Add(pikkuFuncId)
	s.addUsedWires(&FunctionMeta{Middleware: middleware})
	s.State.QueueWorkers.Files.Add(sourceFile)
	s.State.QueueWorkers.Meta.Set(name, &QueueWorkerMeta{
		PikkuFuncId: pikkuFuncId, PackageName: packageName, Name: name,
		Summary: cm.summary, Description: cm.description, Errors: cm.errors,
		Tags: tags, Middleware: middleware,
	})
}

// --- ensure-function-metadata.ts ---------------------------------------------

// ensureFunctionMetadata is utils/ensure-function-metadata.ts: stub metadata
// for a function the wiring names but addFunctions did not register (an
// inline function, or a workflow helper when isHelper).
func (s *Context) ensureFunctionMetadata(pikkuFuncId, fallbackName string, funcInit *ast.Node, isHelper bool) {
	m := s.State.Functions.Meta.At(pikkuFuncId)
	if m == nil {
		if fallbackName == "" {
			fallbackName = pikkuFuncId
		}
		functionType := "inline"
		if isHelper {
			functionType = "helper"
		}
		m = &FunctionMeta{
			PikkuFuncId: pikkuFuncId, FunctionType: functionType, Name: fallbackName,
			Services: ServicesMeta{Services: []string{}}, Inputs: []string{}, Outputs: []string{},
			Inline: true,
		}
		s.State.Functions.Meta.Set(pikkuFuncId, m)
	}
	if m.SourceFile == "" && funcInit != nil {
		m.SourceFile = ast.GetSourceFileOfNode(funcInit).FileName()
	}
	if funcInit == nil {
		return
	}
	var call *ast.Node
	if ast.IsCallExpression(funcInit) {
		call = funcInit
		s.resolveFuncConfigTypes(m, pikkuFuncId, call)
		if _, ok := s.typesLookup[pikkuFuncId]; !ok {
			s.populateTypesLookup(pikkuFuncId, call)
		}
	} else {
		call = s.resolveToPikkuFuncCall(funcInit)
	}
	if call == nil {
		return
	}
	a := call.Arguments()
	if len(a) == 0 || !ast.IsObjectLiteralExpression(a[0]) {
		return
	}
	if m.Tags == nil {
		if cm := s.getCommonWireMetaData(a[0]); cm.hasTags {
			m.Tags = cm.tags
		}
	}
	if m.Middleware == nil {
		m.Middleware = s.resolveMiddleware(a[0], m.Tags)
	}
	if m.Permissions == nil {
		m.Permissions = s.resolvePermissions(a[0])
	}
}

func (s *Context) populateTypesLookup(pikkuFuncId string, call *ast.Node) {
	if ta := call.TypeArguments(); len(ta) >= 1 {
		s.typesLookup[pikkuFuncId] = []*checker.Type{s.Checker.GetTypeFromTypeNode(ta[0])}
		return
	}
	funcProp := s.Checker.GetPropertyOfType(s.Checker.GetTypeAtLocation(call), "func")
	if funcProp == nil {
		return
	}
	sig := s.firstCallSignature(s.Checker.GetTypeOfSymbolAtLocation(funcProp, call))
	if sig == nil {
		return
	}
	if ps := sig.Parameters(); len(ps) >= 2 {
		if t := s.Checker.GetTypeOfSymbolAtLocation(ps[1], call); t.Flags()&checker.TypeFlagsVoidLike == 0 {
			s.typesLookup[pikkuFuncId] = []*checker.Type{t}
		}
	}
}

func (s *Context) ensureInlineWiringFunction(pikkuFuncId, fallbackName string, funcInit *ast.Node, isHelper bool) {
	s.ensureFunctionMetadata(pikkuFuncId, fallbackName, funcInit, isHelper)
	if m := s.State.Functions.Meta.At(pikkuFuncId); m != nil && m.Sessionless == nil && ast.IsCallExpression(funcInit) && ast.IsIdentifier(funcInit.Expression()) {
		m.Sessionless = tsutil.BoolPtr(s.resolveCalleeName(funcInit, isPikkuFunc) != "pikkuFunc")
	}
}

func (s *Context) resolveToPikkuFuncCall(n *ast.Node) *ast.Node {
	if tsutil.IsPikkuCall(n) {
		return n
	}
	if ast.IsIdentifier(n) {
		if decl := tsutil.FirstDecl(s.resolveAlias(s.Checker.GetSymbolAtLocation(n))); decl != nil && ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
			return s.resolveToPikkuFuncCall(decl.Initializer())
		}
	}
	return nil
}

func (s *Context) firstCallSignature(t *checker.Type) *checker.Signature {
	if sigs := s.Checker.GetSignaturesOfType(t, checker.SignatureKindCall); len(sigs) > 0 {
		return sigs[0]
	}
	if t.IsUnion() {
		for _, m := range t.Types() {
			if sigs := s.Checker.GetSignaturesOfType(m, checker.SignatureKindCall); len(sigs) > 0 {
				return sigs[0]
			}
		}
	}
	return nil
}

func (s *Context) resolveFuncConfigTypes(m *FunctionMeta, pikkuFuncId string, call *ast.Node) {
	if len(m.Inputs) > 0 {
		return
	}
	configType := s.Checker.GetTypeAtLocation(call)
	funcProp := s.Checker.GetPropertyOfType(configType, "func")
	if funcProp == nil {
		return
	}
	sig := s.firstCallSignature(s.Checker.GetTypeOfSymbolAtLocation(funcProp, call))
	if sig == nil {
		return
	}
	if ps := sig.Parameters(); len(ps) >= 2 {
		if n := s.resolveTypeName(s.Checker.GetTypeOfSymbolAtLocation(ps[1], call), pikkuFuncId, "Input"); n != "" {
			m.Inputs, m.InputSchemaName = []string{n}, tsutil.StrPtr(n)
		}
	}
	if n := s.resolveTypeName(s.unwrapPromiseOrVoid(s.Checker.GetReturnTypeOfSignature(sig)), pikkuFuncId, "Output"); n != "" {
		m.Outputs, m.OutputSchemaName = []string{n}, tsutil.StrPtr(n)
	}

	// resolveFromConfigTypeArgs
	var typeArgs []*checker.Type
	if a := configType.Alias(); a != nil {
		typeArgs = a.TypeArguments()
	} else if configType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		typeArgs = s.Checker.GetTypeArguments(configType)
	}
	if len(typeArgs) < 2 {
		return
	}
	if len(m.Inputs) == 0 {
		if n := s.resolveTypeName(typeArgs[0], pikkuFuncId, "Input"); n != "" {
			m.Inputs, m.InputSchemaName = []string{n}, tsutil.StrPtr(n)
		}
	}
	if len(m.Outputs) == 0 {
		if n := s.resolveTypeName(s.unwrapPromiseOrVoid(typeArgs[1]), pikkuFuncId, "Output"); n != "" {
			m.Outputs, m.OutputSchemaName = []string{n}, tsutil.StrPtr(n)
		}
	}
}

// computeInputTypes is add-http-route.ts's helper of the same name.
func (s *Context) computeInputTypes(method, input string, query, params []string) {
	if input == "" {
		return
	}
	body := []string{}
	if method == "post" || method == "put" || method == "patch" {
		body = tsutil.Dedupe(append(append([]string{}, query...), params...))
	}
	s.State.HTTP.MetaInputTypes.Set(input, state.MetaInputTypes{
		Query: append([]string{}, query...), Params: append([]string{}, params...), Body: body,
	})
}

// routeInputKeys is getRouteInputKeys: the input type's property names, or
// the input schema's when only that is known. ok is false when neither is.
func (s *Context) routeInputKeys(funcName string) ([]string, bool) {
	if ts := s.typesLookup[funcName]; len(ts) > 0 {
		keys := []string{}
		for _, p := range s.Checker.GetPropertiesOfType(ts[0]) {
			keys = append(keys, p.Name)
		}
		return keys, true
	}
	if m := s.resolveFunctionMeta(funcName); m != nil && m.InputSchemaName != nil {
		if raw, ok := s.State.Schemas.Get(*m.InputSchemaName); ok {
			var schema struct {
				Properties *state.Record[state.Raw] `json:"properties"`
			}
			if raw.Decode(&schema) == nil && schema.Properties != nil {
				return schema.Properties.Keys(), true
			}
		}
	}
	return nil, false
}

func missingFrom(want, have []string) []string {
	var out []string
	for _, w := range want {
		if !slices.Contains(have, w) {
			out = append(out, w)
		}
	}
	return out
}
