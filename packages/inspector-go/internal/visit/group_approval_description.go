package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-approval-description.ts.

func init() {
	Register(Visitor{Name: "addApprovalDescription", Phase: PhaseSetup, Order: OrderAddApprovalDescription, Visit: (*Context).addApprovalDescription})
}

func (s *Context) addApprovalDescription(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != "pikkuApprovalDescription" {
		return
	}
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	handler := args[0]
	if !tsutil.IsFunctionLike(handler) {
		s.Log.Error("• Handler for pikkuApprovalDescription is not a function.")
		return
	}
	services := servicesOf(handler)
	wires := extractUsedWires(handler, 1)
	id, exportedName, ok := s.definitionId(node, "pikkuApprovalDescription", "myApproval")
	if !ok {
		return
	}
	s.State.Functions.ApprovalDescriptions.Set(id, &state.MiddlewareDefinition{
		Services: services, Wires: wiresOrNil(wires), SourceFile: fileOf(node), Position: startOf(node),
		ExportedName: nullableString(exportedName),
	})
	s.Log.Debugf("• Found approval description '%s' with services: %s", id, joinServices(services))
}
