package main

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// Port of add/add-http-route.ts, add/add-http-routes.ts, add/add-queue-worker.ts
// and utils/ensure-function-metadata.ts.

type HTTPRouteMeta struct {
	PikkuFuncId       string    `json:"pikkuFuncId"`
	PackageName       string    `json:"packageName,omitempty"`
	Route             string    `json:"route"`
	SourceFile        string    `json:"sourceFile"`
	Method            string    `json:"method"`
	Auth              *bool     `json:"auth,omitempty"`
	Params            []string  `json:"params,omitempty"`
	Query             []string  `json:"query,omitempty"`
	Title             *string   `json:"title,omitempty"`
	Summary           *string   `json:"summary,omitempty"`
	Description       *string   `json:"description,omitempty"`
	Errors            []string  `json:"errors,omitempty"`
	Tags              []string  `json:"tags,omitempty"`
	Middleware        []WireRef `json:"middleware,omitempty"`
	Permissions       []WireRef `json:"permissions,omitempty"`
	SSE               *bool     `json:"sse,omitempty"`
	HeadersSchemaName string    `json:"headersSchemaName,omitempty"`
	GroupBasePath     string    `json:"groupBasePath,omitempty"`
	RequiresSession   bool      `json:"requiresSession"`
}

type QueueWorkerMeta struct {
	PikkuFuncId string    `json:"pikkuFuncId"`
	PackageName string    `json:"packageName,omitempty"`
	Name        string    `json:"name"`
	Summary     *string   `json:"summary,omitempty"`
	Description *string   `json:"description,omitempty"`
	Errors      []string  `json:"errors,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	Middleware  []WireRef `json:"middleware,omitempty"`
}

var httpMethods = []string{"get", "post", "put", "delete", "head", "patch", "options"}

func (s *state) visitRoutes(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	args := node.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return
	}
	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	switch node.Expression().Text() {
	case "wireHTTP":
		s.registerHTTPRoute(args[0], sourceFile, groupConfig{})
	case "wireHTTPRoutes":
		group := extractGroupConfig(args[0])
		if p := findPropertyAssignment(args[0], "routes"); p != nil {
			s.processRoutes(p.Initializer(), group, sourceFile)
		}
	case "wireQueueWorker":
		s.addQueueWorker(args[0], sourceFile)
	}
}

// --- wireHTTPRoutes -----------------------------------------------------------

type groupConfig struct {
	basePath string
	tags     []string
	auth     *bool
}

func extractGroupConfig(obj *ast.Node) groupConfig {
	g := groupConfig{basePath: getPropertyValue(obj, "basePath").asString()}
	g.tags = append([]string{}, getPropertyValue(obj, "tags").strs...)
	g.auth = getPropertyValue(obj, "auth").boolean
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

func (s *state) processRoutes(node *ast.Node, parent groupConfig, sourceFile string) {
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
			if p := findPropertyAssignment(node, "routes"); p != nil {
				s.processRoutes(p.Initializer(), merged, sourceFile)
			}
			return
		}
		for _, p := range node.Properties() {
			// refHTTP(...) addon contracts are not ported.
			if ast.IsPropertyAssignment(p) {
				s.processRoutes(p.Initializer(), parent, sourceFile)
			}
		}
	case ast.IsIdentifier(node):
		if resolved := s.resolveIdentifier(node, "defineHTTPRoutes"); resolved != nil {
			s.processRoutes(resolved, parent, sourceFile)
		}
	}
}

func (s *state) resolveIdentifier(node *ast.Node, unwrap ...string) *ast.Node {
	sym := s.resolveAlias(s.c.GetSymbolAtLocation(node))
	if sym == nil {
		return nil
	}
	decl := sym.ValueDeclaration
	if decl == nil {
		decl = firstDecl(sym)
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

func (s *state) registerHTTPRoute(obj *ast.Node, sourceFile string, group groupConfig) {
	routePath := getPropertyValue(obj, "route").asString()
	if routePath == "" {
		return
	}
	method := strings.ToLower(getPropertyValue(obj, "method").asString())
	if method == "" {
		method = "get"
	}
	fullRoute := group.basePath + routePath
	params, ok := pathParams(fullRoute)
	if !ok {
		return
	}
	cm := s.getCommonWireMetaData(obj)
	if cm.disabled {
		return
	}
	tags := append(append([]string{}, group.tags...), cm.tags...)
	query := getPropertyValue(obj, "query").strs

	funcInit := s.getPropertyAssignmentInitializer(obj, "func", true)
	if funcInit == nil {
		return // MISSING_FUNC
	}
	funcName := s.extractFunctionName(funcInit).pikkuFuncId
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
			return // addon metadata not available
		}
		funcName = refTarget
	} else {
		s.ensureFunctionMetadata(funcName, fullRoute, funcInit)
	}

	resolvedAuth := getPropertyValue(obj, "auth").boolean
	if resolvedAuth == nil {
		resolvedAuth = group.auth
	}
	if m := s.meta[funcName]; m != nil && m.Sessionless == nil && resolvedAuth != nil && !*resolvedAuth {
		m.Sessionless = boolPtr(true)
	}
	fnMeta := s.resolveFunctionMeta(funcName)
	if fnMeta == nil {
		return // FUNCTION_METADATA_NOT_FOUND
	}
	// validateAuthSessionless
	if resolvedAuth != nil && !*resolvedAuth && fnMeta.Sessionless != nil && !*fnMeta.Sessionless {
		return
	}
	// Route/query parameter validation against the input type only reports
	// errors; it is not ported.

	route := &HTTPRouteMeta{
		PikkuFuncId: funcName, PackageName: packageName, Route: fullRoute,
		SourceFile: sourceFile, Method: method, Auth: resolvedAuth,
		Title: cm.title, Summary: cm.summary, Description: cm.description, Errors: cm.errors,
		Middleware:    s.resolveHTTPMiddleware(fullRoute, obj, tags),
		Permissions:   s.resolvePermissions(obj),
		GroupBasePath: group.basePath,
	}
	if len(params) > 0 {
		route.Params = params
	}
	if len(query) > 0 {
		route.Query = query
	}
	if len(tags) > 0 {
		route.Tags = tags
	}
	if v := getPropertyValue(obj, "sse").boolean; v != nil && *v {
		route.SSE = boolPtr(true)
	}
	if h := s.getPropertyAssignmentInitializer(obj, "headers", true); h != nil && ast.IsIdentifier(h) {
		// TS also checks the schema vendor and registers a schemaLookup entry.
		route.HeadersSchemaName = strings.ToUpper(method) + "_" + strings.Trim(nonAlnum.ReplaceAllString(fullRoute, "_"), "_") + "_Headers"
	}
	if s.http[method] == nil {
		s.http[method] = map[string]*HTTPRouteMeta{}
	}
	s.http[method][fullRoute] = route
}

func (s *state) resolveHTTPMiddleware(route string, obj *ast.Node, tags []string) []WireRef {
	var out []WireRef
	for _, pattern := range s.httpRouteMiddleware {
		if routeMatchesPattern(route, pattern) {
			out = append(out, WireRef{Type: "http", Route: pattern})
		}
	}
	return append(out, s.resolveMiddleware(obj, tags)...)
}

func routeMatchesPattern(route, pattern string) bool {
	if route == pattern {
		return true
	}
	re := strings.ReplaceAll(regexp.QuoteMeta(pattern), `\*`, ".*")
	return regexp.MustCompile("^" + re + "$").MatchString(route)
}

// pathParams returns the `param` keys path-to-regexp v8 reports for a path:
// `:name` and `:"quoted"`, but not `*wildcard`s.
func pathParams(path string) ([]string, bool) {
	isIDStart := func(r rune) bool { return r == '$' || r == '_' || unicode.IsLetter(r) }
	isIDCont := func(r rune) bool { return isIDStart(r) || unicode.IsDigit(r) || r == '‌' || r == '‍' }
	rs := []rune(path)
	var params []string
	for i := 0; i < len(rs); i++ {
		switch rs[i] {
		case '\\':
			i++
		case ':', '*':
			kind := rs[i]
			j := i + 1
			var name string
			if j < len(rs) && rs[j] == '"' {
				k := j + 1
				for k < len(rs) && rs[k] != '"' {
					if rs[k] == '\\' {
						k++
					}
					k++
				}
				if k >= len(rs) {
					return nil, false
				}
				name = string(rs[j+1 : k])
				i = k
			} else {
				k := j
				for k < len(rs) && (k == j && isIDStart(rs[k]) || k > j && isIDCont(rs[k])) {
					k++
				}
				if k == j {
					return nil, false
				}
				name = string(rs[j:k])
				i = k - 1
			}
			if kind == ':' {
				params = append(params, name)
			}
		}
	}
	return params, true
}

// --- wireQueueWorker -----------------------------------------------------------

func (s *state) addQueueWorker(obj *ast.Node, sourceFile string) {
	name := getPropertyValue(obj, "name").asString()
	cm := s.getCommonWireMetaData(obj)
	if cm.disabled {
		return
	}
	funcInit := s.getPropertyAssignmentInitializer(obj, "func", true)
	if funcInit == nil {
		return
	}
	pikkuFuncId := s.extractFunctionName(funcInit).pikkuFuncId
	if strings.HasPrefix(pikkuFuncId, "__temp_") && name != "" {
		pikkuFuncId = "queue:" + name
	}
	packageName := ""
	if ast.IsIdentifier(funcInit) {
		packageName = s.resolveAddonName(funcInit)
	}
	if name == "" {
		return
	}
	s.ensureInlineWiringFunction(pikkuFuncId, name, funcInit)
	var tags []string
	if cm.hasTags {
		tags = cm.tags
	}
	s.queues[name] = &QueueWorkerMeta{
		PikkuFuncId: pikkuFuncId, PackageName: packageName, Name: name,
		Summary: cm.summary, Description: cm.description, Errors: cm.errors,
		Tags: tags, Middleware: s.resolveMiddleware(obj, tags),
	}
}

// --- ensure-function-metadata.ts ---------------------------------------------

func (s *state) ensureFunctionMetadata(pikkuFuncId, fallbackName string, funcInit *ast.Node) {
	m := s.meta[pikkuFuncId]
	if m == nil {
		if fallbackName == "" {
			fallbackName = pikkuFuncId
		}
		m = &FunctionMeta{
			PikkuFuncId: pikkuFuncId, FunctionType: "inline", Name: fallbackName,
			Services: ServicesMeta{Services: []string{}}, Inputs: []string{}, Outputs: []string{},
			inline: true,
		}
		s.meta[pikkuFuncId] = m
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

func (s *state) ensureInlineWiringFunction(pikkuFuncId, fallbackName string, funcInit *ast.Node) {
	s.ensureFunctionMetadata(pikkuFuncId, fallbackName, funcInit)
	if m := s.meta[pikkuFuncId]; m != nil && m.Sessionless == nil && ast.IsCallExpression(funcInit) && ast.IsIdentifier(funcInit.Expression()) {
		m.Sessionless = boolPtr(funcInit.Expression().Text() != "pikkuFunc")
	}
}

func (s *state) resolveToPikkuFuncCall(n *ast.Node) *ast.Node {
	if isPikkuCall(n) {
		return n
	}
	if ast.IsIdentifier(n) {
		if decl := firstDecl(s.resolveAlias(s.c.GetSymbolAtLocation(n))); decl != nil && ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
			return s.resolveToPikkuFuncCall(decl.Initializer())
		}
	}
	return nil
}

func (s *state) firstCallSignature(t *checker.Type) *checker.Signature {
	if sigs := s.c.GetSignaturesOfType(t, checker.SignatureKindCall); len(sigs) > 0 {
		return sigs[0]
	}
	if t.IsUnion() {
		for _, m := range t.Types() {
			if sigs := s.c.GetSignaturesOfType(m, checker.SignatureKindCall); len(sigs) > 0 {
				return sigs[0]
			}
		}
	}
	return nil
}

func (s *state) resolveFuncConfigTypes(m *FunctionMeta, pikkuFuncId string, call *ast.Node) {
	if len(m.Inputs) > 0 {
		return
	}
	configType := s.c.GetTypeAtLocation(call)
	funcProp := s.c.GetPropertyOfType(configType, "func")
	if funcProp == nil {
		return
	}
	sig := s.firstCallSignature(s.c.GetTypeOfSymbolAtLocation(funcProp, call))
	if sig == nil {
		return
	}
	if ps := sig.Parameters(); len(ps) >= 2 {
		if n := s.resolveTypeName(s.c.GetTypeOfSymbolAtLocation(ps[1], call), pikkuFuncId, "Input"); n != "" {
			m.Inputs, m.InputSchemaName = []string{n}, strPtr(n)
		}
	}
	if n := s.resolveTypeName(s.unwrapPromiseOrVoid(s.c.GetReturnTypeOfSignature(sig)), pikkuFuncId, "Output"); n != "" {
		m.Outputs, m.OutputSchemaName = []string{n}, strPtr(n)
	}

	// resolveFromConfigTypeArgs
	var typeArgs []*checker.Type
	if a := configType.Alias(); a != nil {
		typeArgs = a.TypeArguments()
	} else if configType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		typeArgs = s.c.GetTypeArguments(configType)
	}
	if len(typeArgs) < 2 {
		return
	}
	if len(m.Inputs) == 0 {
		if n := s.resolveTypeName(typeArgs[0], pikkuFuncId, "Input"); n != "" {
			m.Inputs, m.InputSchemaName = []string{n}, strPtr(n)
		}
	}
	if len(m.Outputs) == 0 {
		if n := s.resolveTypeName(s.unwrapPromiseOrVoid(typeArgs[1]), pikkuFuncId, "Output"); n != "" {
			m.Outputs, m.OutputSchemaName = []string{n}, strPtr(n)
		}
	}
}

// --- annotate-http-route-auth.ts ------------------------------------------------

func (s *state) annotateHTTPRouteAuth() {
	gated := map[string]bool{}
	for _, name := range s.addonOrder {
		d := s.addons[name]
		if d.pkg != "" && ((d.auth != nil && *d.auth) || len(d.scopes) > 0) {
			gated[d.pkg] = true
		}
	}
	for _, routes := range s.http {
		for _, r := range routes {
			m := s.resolveFunctionMeta(r.PikkuFuncId)
			r.RequiresSession = (m != nil && (m.Sessionless != nil && !*m.Sessionless ||
				m.Auth != nil && *m.Auth || len(m.Scopes) > 0)) ||
				(r.Auth != nil && *r.Auth) || (r.PackageName != "" && gated[r.PackageName])
		}
	}
}

// --- resolve-versions.ts (functions + http/queue references only) -------------

var versionedIdRe = regexp.MustCompile(`^(.+)@v(\d+)$`)

func (s *state) resolveLatestVersions() {
	type group struct {
		maxVersion  int
		hasExplicit bool
		unversioned string
	}
	groups := map[string]*group{}
	for id, m := range s.meta {
		base, version := id, -1
		if mm := versionedIdRe.FindStringSubmatch(id); mm != nil {
			base = mm[1]
			version, _ = strconv.Atoi(mm[2])
		} else if m.Version != nil {
			version = *m.Version
		}
		g := groups[base]
		if g == nil {
			g = &group{}
			groups[base] = g
		}
		if version >= 0 {
			if !g.hasExplicit || version > g.maxVersion {
				g.maxVersion = version
			}
			g.hasExplicit = true
		} else {
			g.unversioned = id
		}
	}
	for base, g := range groups {
		if !g.hasExplicit || g.unversioned == "" {
			continue
		}
		v := g.maxVersion + 1
		newId := formatVersionedId(base, v)
		m := s.meta[g.unversioned]
		delete(s.meta, g.unversioned)
		m.PikkuFuncId, m.Version = newId, &v
		s.meta[newId] = m
		for _, routes := range s.http {
			for _, r := range routes {
				if r.PikkuFuncId == g.unversioned {
					r.PikkuFuncId = newId
				}
			}
		}
		for _, q := range s.queues {
			if q.PikkuFuncId == g.unversioned {
				q.PikkuFuncId = newId
			}
		}
	}
}
