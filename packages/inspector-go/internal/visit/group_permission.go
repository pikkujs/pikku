package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-permission.ts: pikkuPermission, pikkuAuth and
// pikkuPermissionFactory definitions.

func init() {
	Register(Visitor{Name: "addPermission", Phase: PhaseSetup, Order: OrderAddPermission, Visit: (*Context).addPermission})
}

func isInsidePermissionContainer(node *ast.Node) bool {
	for cur := node.Parent; cur != nil; cur = cur.Parent {
		if ast.IsCallExpression(cur) && ast.IsIdentifier(cur.Expression()) && cur.Expression().Text() == "pikkuPermissionFactory" {
			return true
		}
	}
	return false
}

func (s *Context) addPermission(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	switch node.Expression().Text() {
	case "pikkuPermission":
		s.addPermissionDefinition(node, false)
	case "pikkuAuth":
		s.addPermissionDefinition(node, true)
	case "pikkuPermissionFactory":
		s.addPermissionFactory(node)
	}
}

// addPermissionDefinition handles pikkuPermission and pikkuAuth. pikkuAuth's
// second parameter is the session, not a wires bag, and it never needs data.
func (s *Context) addPermissionDefinition(node *ast.Node, isAuth bool) {
	if isInsidePermissionContainer(node) {
		return
	}
	wrapper, example := "pikkuPermission", "myPermission"
	if isAuth {
		wrapper, example = "pikkuAuth", "myAuth"
	}
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	arg := args[0]
	var handler *ast.Node
	var name, description *string
	switch {
	case ast.IsObjectLiteralExpression(arg):
		name, description = nameAndDescription(arg)
		fn := s.getPropertyAssignmentInitializer(arg, "func", true)
		if !tsutil.IsFunctionLike(fn) {
			s.Log.Error("• " + wrapper + " object missing required 'func' property.")
			return
		}
		handler = fn
	case tsutil.IsFunctionLike(arg):
		handler = arg
	default:
		s.Log.Error("• Handler for " + wrapper + " is not a function.")
		return
	}

	services := servicesOf(handler)
	wires := WiresMeta{Optimized: true, Wires: []string{}}
	if !isAuth {
		wires = extractUsedWires(handler, 2)
	}
	id, exportedName, ok := s.definitionId(node, wrapper, example)
	if !ok {
		return
	}

	requiresData := true
	if isAuth {
		requiresData = false
	} else if p := tsutil.ParamAt(handler, 1); p != nil && ast.IsIdentifier(p.Name()) && strings.HasPrefix(p.Name().Text(), "_") {
		requiresData = false
	}
	def := &state.MiddlewareDefinition{
		Services: services, Wires: wiresOrNil(wires), SourceFile: fileOf(node), Position: startOf(node),
		ExportedName: nullableString(exportedName), Name: name, Description: description,
	}
	if !requiresData {
		def.RequiresData = tsutil.BoolPtr(false)
	}
	s.State.Permissions.Definitions.Set(id, def)

	if isAuth {
		s.Log.Debugf("• Found auth permission with services: %s%s", joinServices(services), describe(name, description))
		return
	}
	authOnly := ""
	if !requiresData {
		authOnly = " (auth-only)"
	}
	s.Log.Debugf("• Found permission with services: %s%s%s", joinServices(services), describe(name, description), authOnly)
}

func (s *Context) addPermissionFactory(node *ast.Node) {
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	factory := args[0]
	if !tsutil.IsFunctionLike(factory) {
		s.Log.Error("• Handler for pikkuPermissionFactory is not a function.")
		return
	}
	services := state.ServicesMeta{Optimized: false, Services: []string{}}
	wires := WiresMeta{Optimized: true, Wires: []string{}}
	if call := findCall(factory, "pikkuPermission"); call != nil && len(call.Arguments()) > 0 {
		if h := call.Arguments()[0]; tsutil.IsFunctionLike(h) {
			services = servicesOf(h)
			wires = extractUsedWires(h, 2)
		}
	} else if body := factory.Body(); tsutil.IsFunctionLike(body) {
		services = servicesOf(body)
		wires = extractUsedWires(body, 2)
	}
	id, exportedName, ok := s.definitionId(node, "pikkuPermissionFactory", "myPermission")
	if !ok {
		return
	}
	s.State.Permissions.Definitions.Set(id, &state.MiddlewareDefinition{
		Services: services, Wires: wiresOrNil(wires), SourceFile: fileOf(node), Position: startOf(node),
		ExportedName: nullableString(exportedName), Factory: tsutil.BoolPtr(true),
	})
	s.Log.Debugf("• Found permission factory with services: %s", joinServices(services))
}
