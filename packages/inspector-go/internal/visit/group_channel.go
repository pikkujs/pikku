package visit

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-channel.ts.

func init() {
	Register(Visitor{Name: "addChannel", Phase: PhaseRoutes, Order: OrderAddChannel, Visit: (*Context).addChannel})
}

// channelFuncRef is the connect / disconnect / message slot of ChannelMeta.
type channelFuncRef struct {
	PikkuFuncId string `json:"pikkuFuncId"`
	PackageName string `json:"packageName,omitempty"`
}

// channelMessageMeta is ChannelMessageMeta, one message-route entry.
type channelMessageMeta struct {
	PikkuFuncId string    `json:"pikkuFuncId"`
	PackageName string    `json:"packageName,omitempty"`
	Middleware  []WireRef `json:"middleware,omitempty"`
}

// channelMessageWirings is ChannelMeta['messageWirings']: channel key ->
// route key -> ChannelMessageMeta (Raw, so refChannel contracts copied from
// an addon keep their own shape).
type channelMessageWirings = state.Record[*state.Record[state.Raw]]

// channelMeta is ChannelMeta in the key order add-channel.ts assigns.
type channelMeta struct {
	Name              string                `json:"name"`
	Route             string                `json:"route"`
	Input             *string               `json:"input"`
	Params            []string              `json:"params,omitempty"`
	Query             []string              `json:"query,omitempty"`
	Connect           *channelFuncRef       `json:"connect"`
	Disconnect        *channelFuncRef       `json:"disconnect"`
	Message           *channelFuncRef       `json:"message"`
	MessageWirings    channelMessageWirings `json:"messageWirings"`
	Binary            *bool                 `json:"binary"` // getPropertyValue gives null when absent
	Auth              *bool                 `json:"auth,omitempty"`
	Summary           *string               `json:"summary,omitempty"`
	Description       *string               `json:"description,omitempty"`
	Errors            *[]string             `json:"errors,omitempty"`
	Tags              *[]string             `json:"tags,omitempty"`
	Middleware        []WireRef             `json:"middleware,omitempty"`
	ChannelMiddleware []WireRef             `json:"channelMiddleware,omitempty"`
}

// getObjectPropertyName is add-channel.ts getObjectPropertyName.
func getObjectPropertyName(name *ast.Node) (string, bool) {
	if name == nil {
		return "", false
	}
	switch {
	case ast.IsIdentifier(name), ast.IsStringLiteral(name), ast.IsNumericLiteral(name):
		return name.Text(), true
	case ast.IsComputedPropertyName(name):
		return "", false
	}
	return tsutil.NodeText(name), true
}

// getInitializerOf is add-channel.ts getInitializerOf.
func getInitializerOf(elem *ast.Node) *ast.Node {
	switch {
	case ast.IsPropertyAssignment(elem):
		return elem.Initializer()
	case ast.IsShorthandPropertyAssignment(elem):
		return elem.Name()
	}
	return nil
}

// handlerNameFromExpression is add-channel.ts getHandlerNameFromExpression.
func (s *Context) handlerNameFromExpression(expr *ast.Node) (string, bool) {
	switch {
	case ast.IsIdentifier(expr):
		if sym := s.Checker.GetSymbolAtLocation(expr); sym != nil {
			if decl := tsutil.FirstDecl(s.resolveAlias(sym)); decl != nil {
				if ast.IsVariableDeclaration(decl) && decl.Initializer() != nil {
					init := decl.Initializer()
					if ast.IsCallExpression(init) || ast.IsArrowFunction(init) || ast.IsFunctionExpression(init) {
						return s.extractFunctionName(init).pikkuFuncId, true
					}
				} else if ast.IsFunctionDeclaration(decl) {
					return s.extractFunctionName(decl).pikkuFuncId, true
				}
			}
		}
		return s.extractFunctionName(expr).pikkuFuncId, true
	case ast.IsCallExpression(expr):
		if ast.IsIdentifier(expr.Expression()) && expr.Expression().Text() == "ref" {
			if a := expr.Arguments(); len(a) > 0 && ast.IsStringLiteral(a[0]) {
				return a[0].Text(), true
			}
		}
		return s.extractFunctionName(expr).pikkuFuncId, true
	case ast.IsObjectLiteralExpression(expr):
		if fn := s.getPropertyAssignmentInitializer(expr, "func", true); fn != nil {
			return s.handlerNameFromExpression(fn)
		}
	}
	return "", false
}

// routeMiddleware is the `ts.isObjectLiteralExpression(init) ? ... : undefined`
// pair every message route resolves.
func (s *Context) channelRouteMiddleware(init *ast.Node, routeKey string) []WireRef {
	if !ast.IsObjectLiteralExpression(init) {
		return nil
	}
	cm := s.commonWireMeta(init, "Channel message", routeKey)
	var tags []string
	if cm.hasTags {
		tags = cm.tags
	}
	return s.resolveMiddleware(init, tags)
}

func setChannelMessage(routes *state.Record[state.Raw], routeKey string, m channelMessageMeta) {
	routes.Set(routeKey, state.RawOf(m))
}

// shorthandRoute is the shorthand-property branch of addMessagesRoutes:
// it reports whether the route was resolved and stored.
func (s *Context) shorthandRoute(routeElem, init *ast.Node, routeKey string, routes *state.Record[state.Raw]) bool {
	sym := s.Checker.GetShorthandAssignmentValueSymbol(routeElem)
	if sym == nil || len(sym.Declarations) == 0 {
		return false
	}
	decl := sym.Declarations[0]
	tryStore := func(target *ast.Node) bool {
		handler := s.extractFunctionName(target).pikkuFuncId
		if s.State.Functions.Meta.At(handler) == nil {
			return false
		}
		setChannelMessage(routes, routeKey, channelMessageMeta{
			PikkuFuncId: handler, Middleware: s.channelRouteMiddleware(init, routeKey),
		})
		return true
	}
	if ast.IsImportSpecifier(decl) {
		if imported := s.Checker.GetSymbolAtLocation(decl.Name()); imported != nil {
			if d := tsutil.FirstDecl(s.resolveAlias(imported)); d != nil {
				switch {
				case ast.IsVariableDeclaration(d) && d.Initializer() != nil:
					i := d.Initializer()
					if (ast.IsArrowFunction(i) || ast.IsFunctionExpression(i) || ast.IsCallExpression(i)) && tryStore(i) {
						return true
					}
				case ast.IsFunctionDeclaration(d):
					if tryStore(d) {
						return true
					}
				case ast.IsExportSpecifier(d):
					if exp := s.Checker.GetSymbolAtLocation(d.Name()); exp != nil {
						if ed := tsutil.FirstDecl(s.resolveAlias(exp)); ed != nil {
							if ast.IsVariableDeclaration(ed) && ed.Initializer() != nil {
								if tryStore(ed.Initializer()) {
									return true
								}
							} else if ast.IsFunctionDeclaration(ed) && tryStore(ed) {
								return true
							}
						}
					}
				}
			}
		}
		// As a fallback, look the function up by name.
		funcName := tsutil.NodeText(decl.Name())
		for _, key := range s.State.Functions.Meta.Keys() {
			parts := strings.Split(key, "_")
			filename := ""
			if len(parts) >= 3 {
				filename = parts[len(parts)-3]
			}
			if strings.HasSuffix(filename, funcName) {
				if s.State.Functions.Meta.At(key) == nil {
					s.Log.Critical(diag.FunctionMetadataNotFound, fmt.Sprintf("No function metadata found for handler '%s'", key))
					return true
				}
				setChannelMessage(routes, routeKey, channelMessageMeta{PikkuFuncId: key})
				return true
			}
		}
		return false
	}
	var actual *ast.Node
	if ast.IsVariableDeclaration(decl) {
		if i := decl.Initializer(); i != nil && (ast.IsArrowFunction(i) || ast.IsFunctionExpression(i) || ast.IsCallExpression(i)) {
			actual = i
		}
	} else if ast.IsFunctionDeclaration(decl) {
		actual = decl
	}
	return actual != nil && tryStore(actual)
}

// channelEntry is one property of onMessageWiring: its key and value.
type channelEntry struct {
	key   string
	keyOK bool
	init  *ast.Node
}

// addMessagesRoutes is add-channel.ts addMessagesRoutes.
func (s *Context) addMessagesRoutes(obj *ast.Node) *channelMessageWirings {
	onMsg := s.getPropertyAssignmentInitializer(obj, "onMessageWiring", true)
	if onMsg == nil || !ast.IsObjectLiteralExpression(onMsg) {
		return state.NewRecord[*state.Record[state.Raw]]()
	}
	var entries []channelEntry
	for _, chanElem := range onMsg.Properties() {
		init := getInitializerOf(chanElem)
		if init == nil {
			continue
		}
		key, ok := getObjectPropertyName(chanElem.Name())
		entries = append(entries, channelEntry{key, ok, init})
	}
	return s.addMessageRoutesOf(entries)
}

func (s *Context) addMessageRoutesOf(entries []channelEntry) *channelMessageWirings {
	result := state.NewRecord[*state.Record[state.Raw]]()
	for _, e := range entries {
		chanInit := e.init
		if ast.IsIdentifier(chanInit) {
			if resolved := s.resolveIdentifier(chanInit, "defineChannelRoutes"); resolved != nil && ast.IsObjectLiteralExpression(resolved) {
				chanInit = resolved
			}
		}
		if contract, ok := resolveRefContract(chanInit, "refChannel", &s.State.ExportedContracts.AddonChannel); ok {
			if !e.keyOK {
				continue
			}
			key := e.key
			routes, ok := rawObject(contract)
			if !ok {
				routes = state.NewRecord[state.Raw]()
			}
			result.Set(key, routes)
			continue
		}
		if !ast.IsObjectLiteralExpression(chanInit) {
			continue
		}
		if !e.keyOK {
			continue
		}
		channelKey := e.key
		routes := state.NewRecord[state.Raw]()
		result.Set(channelKey, routes)

		for _, routeElem := range chanInit.Properties() {
			init := getInitializerOf(routeElem)
			if init == nil {
				continue
			}
			routeKey, ok := getObjectPropertyName(routeElem.Name())
			if !ok {
				continue
			}
			if ast.IsShorthandPropertyAssignment(routeElem) && s.shorthandRoute(routeElem, init, routeKey, routes) {
				continue
			}

			handlerName, ok := s.handlerNameFromExpression(init)
			if !ok || handlerName == "" {
				s.Log.Error(fmt.Sprintf("Could not resolve handler for message route '%s'", routeKey))
				continue
			}
			if s.resolveFunctionMeta(handlerName) == nil {
				s.Log.Critical(diag.FunctionMetadataNotFound, fmt.Sprintf(
					"No function metadata found for channel handler '%s' on route '%s'. If this is an inline function, it must be exported for the inspector to discover it.",
					handlerName, routeKey))
				continue
			}
			middleware := s.channelRouteMiddleware(init, routeKey)
			packageName := ""
			if i := strings.Index(handlerName, ":"); i != -1 {
				if a := s.addons[handlerName[:i]]; a != nil {
					packageName = a.pkg
				}
			}
			setChannelMessage(routes, routeKey, channelMessageMeta{
				PikkuFuncId: handlerName, PackageName: packageName, Middleware: middleware,
			})
		}
	}
	return result
}

func (s *Context) addChannel(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	args := node.Arguments()
	switch node.Expression().Text() {
	case "defineChannelRoutes":
		exportName := s.exportedVariableNameOf(node)
		if exportName != "" && len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
			s.State.ExportedContracts.Channel.Set(exportName, state.RawOf(s.extractExportedChannelRoutes(args[0])))
		}
		return
	case "wireChannel":
	default:
		return
	}
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return
	}
	obj := args[0]
	nameV := tsutil.GetPropertyValue(obj, "name")
	name := nameV.AsString()
	route := tsutil.GetPropertyValue(obj, "route").AsString()
	if name == "" {
		s.Log.Critical(diag.MissingChannelName, "Channel name is required")
		return
	}

	params := []string{}
	if route != "" {
		p, err := tsutil.PathParams(route)
		if err != nil {
			// TS throws out of pathToRegexp here, which aborts inspection.
			s.Log.Error(err.Error())
			return
		}
		params = p
	}

	cm := s.commonWireMeta(obj, "Channel", name)
	if cm.disabled {
		return
	}
	var tags []string
	if cm.hasTags {
		tags = cm.tags
	}

	query := tsutil.GetPropertyValue(obj, "query").Strs
	binary := tsutil.GetPropertyValue(obj, "binary").Bool

	connect := s.getPropertyAssignmentInitializer(obj, "onConnect", true)
	disconnect := s.getPropertyAssignmentInitializer(obj, "onDisconnect", true)

	var message *channelFuncRef
	if onMsg := s.getPropertyAssignmentInitializer(obj, "onMessage", true); onMsg != nil {
		msgFuncId := s.extractFunctionName(onMsg).pikkuFuncId
		if isTempId(msgFuncId) {
			msgFuncId = makeContextBasedId("channel", name, "message")
		}
		if s.State.Functions.Meta.At(msgFuncId) == nil {
			s.Log.Critical(diag.FunctionMetadataNotFound, fmt.Sprintf("No function metadata found for onMessage handler '%s'", msgFuncId))
			return
		}
		message = &channelFuncRef{PikkuFuncId: msgFuncId}
		if ast.IsIdentifier(onMsg) {
			message.PackageName = s.resolveAddonName(onMsg)
		}
	}

	messageWirings := s.addMessagesRoutes(obj)

	middleware := s.resolveMiddleware(obj, tags)
	channelMiddleware := s.resolveChannelMiddleware(obj, tags)

	slot := func(n *ast.Node, kind string) *channelFuncRef {
		if n == nil {
			return nil
		}
		id := s.extractFunctionName(n).pikkuFuncId
		if isTempId(id) {
			id = makeContextBasedId("channel", name, kind)
		}
		ref := &channelFuncRef{PikkuFuncId: id}
		if ast.IsIdentifier(n) {
			ref.PackageName = s.resolveAddonName(n)
		}
		s.State.ServiceAggregation.UsedFunctions.Add(id)
		return ref
	}
	connectRef := slot(connect, "connect")
	disconnectRef := slot(disconnect, "disconnect")

	// A connect/disconnect handler addFunctions skipped (a local, unexported
	// pikkuChannelConnectionFunc) gets a partial entry, so the runtime knows
	// whether it is sessionless.
	var sessionless *bool
	if auth := tsutil.GetPropertyValue(obj, "auth").Bool; auth != nil && !*auth {
		sessionless = tsutil.BoolPtr(true)
	}
	for _, ref := range []*channelFuncRef{connectRef, disconnectRef} {
		if ref == nil || s.State.Functions.Meta.At(ref.PikkuFuncId) != nil {
			continue
		}
		var fm jsObject
		fm.set("pikkuFuncId", ref.PikkuFuncId)
		if sessionless != nil {
			fm.set("sessionless", true)
		}
		fm.set("inputSchemaName", state.Raw("null"))
		fm.set("outputSchemaName", state.Raw("null"))
		s.State.Functions.Meta.Set(ref.PikkuFuncId, &FunctionMeta{
			PikkuFuncId: ref.PikkuFuncId, Sessionless: sessionless, Verbatim: fm.raw(),
		})
	}

	if message != nil {
		s.State.ServiceAggregation.UsedFunctions.Add(message.PikkuFuncId)
	}
	messageWirings.Each(func(_ string, routes *state.Record[state.Raw]) {
		routes.Each(func(_ string, r state.Raw) {
			if rec, ok := rawObject(r); ok {
				var id string
				if v, ok := rec.Get("pikkuFuncId"); ok && v.Decode(&id) == nil {
					s.State.ServiceAggregation.UsedFunctions.Add(id)
				}
			}
		})
	})
	s.addUsedMiddleware(middleware)

	desc := fmt.Sprintf("Channel '%s'", name)
	for _, ref := range []*channelFuncRef{connectRef, disconnectRef, message} {
		if ref != nil && ref.PikkuFuncId != "" && !s.validateAuthSessionless(obj, ref.PikkuFuncId, desc, nil) {
			return
		}
	}

	meta := &channelMeta{
		Name: name, Route: route,
		Connect: connectRef, Disconnect: disconnectRef, Message: message,
		MessageWirings:    *messageWirings,
		Binary:            binary,
		Auth:              tsutil.GetPropertyValue(obj, "auth").Bool,
		Summary:           cm.summary,
		Description:       cm.description,
		Middleware:        middleware,
		ChannelMiddleware: channelMiddleware,
	}
	if len(params) > 0 {
		meta.Params = params
	}
	if len(query) > 0 {
		meta.Query = query
	}
	if cm.hasErrors {
		e := cm.errors
		meta.Errors = &e
	}
	if cm.hasTags {
		t := cm.tags
		meta.Tags = &t
	}
	s.State.Channels.Files.Add(ast.GetSourceFileOfNode(node).FileName())
	s.State.Channels.Meta.Set(name, state.RawOf(meta))
}

// extractExportedChannelRoutes is add-channel.ts extractExportedChannelRoutes:
// a defineChannelRoutes object read as the routes of one `contract` channel.
func (s *Context) extractExportedChannelRoutes(routes *ast.Node) *state.Record[state.Raw] {
	// addMessagesRoutes over a synthetic { onMessageWiring: { contract: routes } }.
	wirings := s.addMessageRoutesOf([]channelEntry{{key: "contract", keyOK: true, init: routes}})
	if c, ok := wirings.Get("contract"); ok && c != nil {
		return c
	}
	return state.NewRecord[state.Raw]()
}
