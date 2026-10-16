package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-gateway.ts.

func init() {
	Register(Visitor{Name: "addGateway", Phase: PhaseRoutes, Order: OrderAddGateway, Visit: (*Context).addGateway})
}

func (s *Context) addGateway(node *ast.Node) {
	obj := wiringCall(node, "wireGateway")
	if obj == nil {
		return
	}
	name := tsutil.GetPropertyValue(obj, "name").AsString()
	typ := tsutil.GetPropertyValue(obj, "type")
	route := tsutil.GetPropertyValue(obj, "route")
	platform := tsutil.GetPropertyValue(obj, "platform")
	auth := tsutil.GetPropertyValue(obj, "auth")
	cm := s.wireMetaData(obj, "Gateway", name)
	if cm.disabled {
		return
	}
	funcInit := s.getPropertyAssignmentInitializer(obj, "func", true)
	if funcInit == nil {
		s.Log.Critical(diag.MissingFunc, fmt.Sprintf("No valid 'func' property for gateway '%s'.", orNull(name)))
		return
	}
	pikkuFuncId := s.wiringFuncId(funcInit, "gateway", name)
	packageName := ""
	if ast.IsIdentifier(funcInit) {
		packageName = s.resolveAddonName(funcInit)
	}
	if name == "" || !typ.Truthy() {
		return
	}
	s.ensureInlineWiringFunction(pikkuFuncId, name, funcInit)
	middleware := s.resolveMiddleware(obj, cm.tagsOrNil())
	s.State.ServiceAggregation.UsedFunctions.Add(pikkuFuncId)
	s.addUsedWires(&FunctionMeta{Middleware: middleware})

	file := ast.GetSourceFileOfNode(node).FileName()
	if typ.Str != nil && *typ.Str == "webhook" && route.Truthy() {
		r := propValue(route)
		for _, w := range []struct{ method, funcId string }{
			{"post", "gateway__" + name + "__post"},
			{"get", "gateway__" + name + "__verify"},
		} {
			var hm jsObject
			hm.set("pikkuFuncId", w.funcId)
			hm.set("route", r)
			hm.set("method", w.method)
			routeStr, _ := r.(string)
			s.State.HTTP.Meta.At(w.method).Set(routeStr, &HTTPRouteMeta{
				PikkuFuncId: w.funcId, Route: routeStr, Method: w.method, Verbatim: hm.raw(),
			})
			var fm jsObject
			fm.set("pikkuFuncId", w.funcId)
			fm.set("inputSchemaName", state.Raw("null"))
			fm.set("outputSchemaName", state.Raw("null"))
			fm.set("sessionless", true)
			s.State.Functions.Meta.Set(w.funcId, &FunctionMeta{
				PikkuFuncId: w.funcId, Sessionless: tsutil.BoolPtr(true), Verbatim: fm.raw(),
			})
		}
		s.State.HTTP.Files.Add(file)
	}

	s.State.Gateways.Files.Add(file)
	var o jsObject
	o.set("pikkuFuncId", pikkuFuncId)
	if packageName != "" {
		o.set("packageName", packageName)
	}
	o.set("name", name)
	o.set("type", propValue(typ))
	if route.Truthy() {
		o.set("route", propValue(route))
	}
	if platform.Truthy() {
		o.set("platform", propValue(platform))
	}
	if auth.Bool != nil {
		o.set("auth", *auth.Bool)
	}
	o.set("gateway", true)
	o.setCommon(cm)
	o.set("middleware", middlewareValue(middleware))
	s.State.Gateways.Meta.Set(name, o.raw())
}
