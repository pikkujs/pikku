package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Ports of utils/middleware.ts and utils/permissions.ts, plus the helpers the
// definition visitors (add-middleware.ts, add-permission.ts, add-auth.ts,
// add-approval-description.ts) share.

const tempPrefix = "__temp_"

// middlewareRef is utils/middleware.ts MiddlewareRef.
type middlewareRef struct {
	definitionId  string
	isFactoryCall bool
}

// extractMiddlewareRefs ports extractMiddlewareRefs.
func (s *Context) extractMiddlewareRefs(arrayNode *ast.Node) []middlewareRef {
	if arrayNode == nil || !ast.IsArrayLiteralExpression(arrayNode) {
		return nil
	}
	var refs []middlewareRef
	for _, e := range arrayNode.Elements() {
		switch {
		case ast.IsIdentifier(e):
			id := s.refId(e)
			if strings.HasPrefix(id, tempPrefix) {
				id = e.Text()
			}
			refs = append(refs, middlewareRef{definitionId: id})
		case ast.IsCallExpression(e):
			id := s.refId(e.Expression())
			if strings.HasPrefix(id, tempPrefix) && ast.IsIdentifier(e.Expression()) {
				id = e.Expression().Text()
			}
			refs = append(refs, middlewareRef{definitionId: id, isFactoryCall: true})
		}
	}
	return refs
}

func (s *Context) extractMiddlewarePikkuNames(arrayNode *ast.Node) []string {
	refs := s.extractMiddlewareRefs(arrayNode)
	names := make([]string, len(refs))
	for i, r := range refs {
		names[i] = r.definitionId
	}
	return names
}

// propertyInitializer is the `obj.properties.find(p => isPropertyAssignment(p)
// && isIdentifier(p.name) && p.name.text === name)?.initializer` the
// get*Node helpers share.
func propertyInitializer(obj *ast.Node, name string) *ast.Node {
	if p := tsutil.FindPropertyAssignment(obj, name); p != nil {
		return p.Initializer()
	}
	return nil
}

// isInline is `def?.exportedName === null`.
func isInline(defs *state.Record[*state.MiddlewareDefinition], name string) *bool {
	def := defs.At(name)
	return tsutil.BoolPtr(def != nil && def.ExportedName == nil)
}

func (s *Context) wireRefs(defs *state.Record[*state.MiddlewareDefinition], names []string) []WireRef {
	var out []WireRef
	for _, n := range names {
		out = append(out, WireRef{Type: "wire", Name: n, Inline: isInline(defs, n)})
	}
	return out
}

func (s *Context) tagRefs(groups *state.Map[*state.MiddlewareGroupMeta], tags []string) []WireRef {
	var out []WireRef
	for _, t := range tags {
		if groups.Has(t) {
			out = append(out, WireRef{Type: "tag", Tag: t})
		}
	}
	return out
}

// resolveMiddleware ports resolveMiddleware: tag groups, then the explicit
// `middleware: [...]` entries.
func (s *Context) resolveMiddleware(obj *ast.Node, tags []string) []WireRef {
	out := s.tagRefs(&s.State.Middleware.TagMiddleware, tags)
	if node := propertyInitializer(obj, "middleware"); node != nil {
		out = append(out, s.wireRefs(&s.State.Middleware.Definitions, s.extractMiddlewarePikkuNames(node))...)
	}
	return out
}

// resolveHTTPMiddleware ports resolveHTTPMiddlewareFromObject: matching
// addHTTPMiddleware patterns first, then resolveMiddleware.
func (s *Context) resolveHTTPMiddleware(route string, obj *ast.Node, tags []string) []WireRef {
	var out []WireRef
	for _, pattern := range s.State.HTTP.RouteMiddleware.Keys() {
		if tsutil.RouteMatchesPattern(route, pattern) {
			out = append(out, WireRef{Type: "http", Route: pattern})
		}
	}
	return append(out, s.resolveMiddleware(obj, tags)...)
}

// resolveChannelMiddleware ports resolveChannelMiddleware.
func (s *Context) resolveChannelMiddleware(obj *ast.Node, tags []string) []WireRef {
	out := s.tagRefs(&s.State.ChannelMiddleware.TagMiddleware, tags)
	if node := propertyInitializer(obj, "channelMiddleware"); node != nil {
		out = append(out, s.wireRefs(&s.State.ChannelMiddleware.Definitions, s.extractMiddlewarePikkuNames(node))...)
	}
	return out
}

// resolveAgentMiddleware ports resolveAgentMiddleware.
func (s *Context) resolveAgentMiddleware(obj *ast.Node) []WireRef {
	node := propertyInitializer(obj, "agentMiddleware")
	if node == nil {
		return nil
	}
	return s.wireRefs(&s.State.AgentMiddleware.Definitions, s.extractMiddlewarePikkuNames(node))
}

// extractPermissionPikkuNames ports utils/permissions.ts: an array, or a
// record whose values are permissions or arrays of them.
func (s *Context) extractPermissionPikkuNames(node *ast.Node) []string {
	var names []string
	var extract func(e *ast.Node)
	extract = func(e *ast.Node) {
		switch {
		case ast.IsIdentifier(e):
			names = append(names, s.refId(e))
		case ast.IsCallExpression(e):
			names = append(names, s.refId(e.Expression()))
		case ast.IsArrayLiteralExpression(e):
			for _, x := range e.Elements() {
				extract(x)
			}
		}
	}
	switch {
	case ast.IsArrayLiteralExpression(node):
		for _, e := range node.Elements() {
			extract(e)
		}
	case ast.IsObjectLiteralExpression(node):
		for _, prop := range node.Properties() {
			if ast.IsPropertyAssignment(prop) {
				extract(prop.Initializer())
			} else if ast.IsShorthandPropertyAssignment(prop) {
				extract(prop.Name())
			}
		}
	}
	return names
}

// resolvePermissions ports resolvePermissions: the explicit `permissions`
// references, flattened.
func (s *Context) resolvePermissions(obj *ast.Node) []WireRef {
	node := propertyInitializer(obj, "permissions")
	if node == nil {
		return nil
	}
	return s.wireRefs(&s.State.Permissions.Definitions, s.extractPermissionPikkuNames(node))
}

// --- shared by the definition visitors ---------------------------------------

// servicesOf ports utils/extract-services.ts extractServicesFromFunction.
func servicesOf(fn *ast.Node) state.ServicesMeta {
	m := state.ServicesMeta{Optimized: true, Services: []string{}}
	p := tsutil.ParamAt(fn, 0)
	if p == nil {
		return m
	}
	if ast.IsObjectBindingPattern(p.Name()) {
		m.Services = append(m.Services, tsutil.BindingNames(p)...)
	} else if ast.IsIdentifier(p.Name()) && !strings.HasPrefix(p.Name().Text(), "_") {
		m.Optimized = false
	}
	return m
}

// wiresOrNil is `wires.wires.length > 0 || !wires.optimized ? wires : undefined`.
func wiresOrNil(w WiresMeta) *WiresMeta {
	if len(w.Wires) > 0 || !w.Optimized {
		return &w
	}
	return nil
}

// startOf is node.getStart() as TS reports it (UTF-16 code units).
func startOf(n *ast.Node) int {
	return tsutil.UTF16Offset(ast.GetSourceFileOfNode(n).Text(), tsutil.NodeStart(n))
}

func fileOf(n *ast.Node) string { return ast.GetSourceFileOfNode(n).FileName() }

// nullableString is a `string | null` that TS writes as null when empty.
func nullableString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

// stringProp is `typeof getPropertyValue(obj, name) === 'string' ? v : undefined`.
func stringProp(obj *ast.Node, name string) *string {
	return tsutil.GetPropertyValue(obj, name).Str
}

// definitionId is extractFunctionName(node) with the `__temp_` fallback every
// definition visitor applies: the name of the variable or property the call
// is assigned to. ok is false (and the TS error logged) when there is none.
func (s *Context) definitionId(node *ast.Node, wrapper, example string) (id string, exportedName string, ok bool) {
	r := s.extractFunctionName(node)
	id = r.pikkuFuncId
	if strings.HasPrefix(id, tempPrefix) {
		parent := node.Parent
		switch {
		case ast.IsVariableDeclaration(parent) && ast.IsIdentifier(parent.Name()):
			id = parent.Name().Text()
		case ast.IsPropertyAssignment(parent) && ast.IsIdentifier(parent.Name()):
			id = parent.Name().Text()
		default:
			s.Log.Error("• " + wrapper + "() must be assigned to a variable or object property. " +
				"Extract it to a const: const " + example + " = " + wrapper + "(...)")
			return "", "", false
		}
	}
	return id, r.exportedName, true
}

// findCall is the `findPikkuXCall` walk: the first call to callee in
// pre-order, node itself included.
func findCall(node *ast.Node, callee string) *ast.Node {
	if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == callee {
		return node
	}
	var found *ast.Node
	node.ForEachChild(func(c *ast.Node) bool {
		found = findCall(c, callee)
		return found != nil
	})
	return found
}

func joinServices(m state.ServicesMeta) string { return strings.Join(m.Services, ", ") }
