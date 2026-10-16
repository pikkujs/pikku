package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// The defineHTTPRoutes branch of add/add-http-routes.ts: an exported
// `const x = defineHTTPRoutes({...})` is serialized into
// exportedContracts.http[x] (serializeHTTPRoutesContract and friends).

// addExportedHTTPRoutes handles a defineHTTPRoutes call; it reports whether
// the node was one, as addHTTPRoutes returns after it either way.
func (s *Context) addExportedHTTPRoutes(node *ast.Node) bool {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != "defineHTTPRoutes" {
		return false
	}
	exportName := s.exportedVariableNameOf(node)
	args := node.Arguments()
	if exportName != "" && len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
		if contract, ok := s.serializeHTTPRoutesContract(args[0]); ok {
			s.State.ExportedContracts.HTTP.Set(exportName, contract)
		}
	}
	return true
}

// propJSON is a getPropertyValue result as JSON: null when absent.
func propJSON(v tsutil.PropValue) any {
	switch {
	case !v.Present:
		return state.Raw("null")
	case v.Bool != nil:
		return *v.Bool
	case v.Num != nil:
		return *v.Num
	case v.Str != nil:
		return *v.Str
	case v.Strs != nil:
		return v.Strs
	}
	return state.Raw("null")
}

// serializeHTTPRoutesContract is add-http-routes.ts serializeHTTPRoutesContract.
func (s *Context) serializeHTTPRoutesContract(node *ast.Node) (state.Raw, bool) {
	out := &jsObject{}
	if isRouteContract(node) {
		p := tsutil.FindPropertyAssignment(node, "routes")
		if p == nil || !ast.IsObjectLiteralExpression(p.Initializer()) {
			return nil, false
		}
		// ...extractGroupConfig(node): auth is undefined unless a boolean.
		g := extractGroupConfig(node)
		out.set("basePath", g.basePath)
		out.set("tags", g.tags)
		if g.auth != nil {
			out.set("auth", *g.auth)
		}
		out.set("routes", s.serializeHTTPRouteMap(p.Initializer()))
		return out.raw(), true
	}
	out.set("routes", s.serializeHTTPRouteMap(node))
	return out.raw(), true
}

// httpRouteMapKey is `prop.name.getText().replace(/^['"]|['"]$/g, ”)`.
func httpRouteMapKey(name *ast.Node) string {
	k := tsutil.NodeText(name)
	if strings.HasPrefix(k, "'") || strings.HasPrefix(k, `"`) {
		k = k[1:]
	}
	if strings.HasSuffix(k, "'") || strings.HasSuffix(k, `"`) {
		k = k[:len(k)-1]
	}
	return k
}

// serializeHTTPRouteMap is add-http-routes.ts serializeHTTPRouteMap.
func (s *Context) serializeHTTPRouteMap(node *ast.Node) *state.Record[state.Raw] {
	result := state.NewRecord[state.Raw]()
	for _, p := range node.Properties() {
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		key := httpRouteMapKey(p.Name())
		value := p.Initializer()
		switch {
		case ast.IsObjectLiteralExpression(value):
			switch {
			case isRouteConfig(value):
				if route, ok := s.serializeHTTPRouteConfig(value); ok {
					result.Set(key, route)
				}
			case isRouteContract(value):
				if c, ok := s.serializeHTTPRoutesContract(value); ok {
					result.Set(key, c)
				}
			default:
				result.Set(key, state.RawOf(s.serializeHTTPRouteMap(value)))
			}
		case ast.IsIdentifier(value):
			resolved := s.resolveIdentifier(value, "defineHTTPRoutes")
			if resolved == nil || !ast.IsObjectLiteralExpression(resolved) {
				continue
			}
			if isRouteContract(resolved) {
				if c, ok := s.serializeHTTPRoutesContract(resolved); ok {
					result.Set(key, c)
				}
			} else {
				result.Set(key, state.RawOf(s.serializeHTTPRouteMap(resolved)))
			}
		}
	}
	return result
}

// serializeHTTPRouteConfig is add-http-routes.ts serializeHTTPRouteConfig.
func (s *Context) serializeHTTPRouteConfig(obj *ast.Node) (state.Raw, bool) {
	method := tsutil.GetPropertyValue(obj, "method")
	route := tsutil.GetPropertyValue(obj, "route")
	funcInit := s.getPropertyAssignmentInitializer(obj, "func", true)
	if !method.Truthy() || !route.Truthy() || funcInit == nil {
		return nil, false
	}

	pikkuFuncId := s.extractFunctionName(funcInit).pikkuFuncId
	packageName := ""
	if ast.IsCallExpression(funcInit) && ast.IsIdentifier(funcInit.Expression()) && funcInit.Expression().Text() == "ref" {
		if a := funcInit.Arguments(); len(a) > 0 && ast.IsStringLiteral(a[0]) {
			pikkuFuncId = a[0].Text()
			if i := strings.Index(pikkuFuncId, ":"); i > 0 {
				if decl := s.addons[pikkuFuncId[:i]]; decl != nil {
					packageName = decl.pkg
				}
			}
		}
	} else if ast.IsIdentifier(funcInit) {
		packageName = s.resolveAddonName(funcInit)
	}

	out := &jsObject{}
	out.set("auth", propJSON(tsutil.GetPropertyValue(obj, "auth")))
	out.set("contentType", propJSON(tsutil.GetPropertyValue(obj, "contentType")))
	out.set("headers", orUndefined(tsutil.GetPropertyValue(obj, "headers")))
	out.set("method", propJSON(method))
	out.set("route", propJSON(route))
	out.set("sse", propJSON(tsutil.GetPropertyValue(obj, "sse")))
	out.set("tags", orUndefined(tsutil.GetPropertyValue(obj, "tags")))
	out.set("timeout", propJSON(tsutil.GetPropertyValue(obj, "timeout")))
	fn := &jsObject{}
	fn.set("pikkuFuncId", pikkuFuncId)
	if packageName != "" {
		fn.set("packageName", packageName)
	}
	out.set("func", fn.raw())
	return out.raw(), true
}
