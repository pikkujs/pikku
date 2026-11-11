package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-schedule.ts.

func init() {
	Register(Visitor{Name: "addSchedule", Phase: PhaseRoutes, Order: OrderAddSchedule, Visit: (*Context).addSchedule})
}

func (s *Context) addSchedule(node *ast.Node) {
	obj := wiringCall(node, "wireScheduler")
	if obj == nil {
		return
	}
	name := tsutil.GetPropertyValue(obj, "name").AsString()
	schedule := tsutil.GetPropertyValue(obj, "schedule")
	cm := s.wireMetaData(obj, "Scheduler", name)
	if cm.disabled {
		return
	}
	funcInit := s.getPropertyAssignmentInitializer(obj, "func", true)
	if funcInit == nil {
		s.Log.Critical(diag.MissingFunc, fmt.Sprintf("No valid 'func' property for scheduled task '%s'.", orNull(name)))
		return
	}
	pikkuFuncId, isHelper := s.wiringFuncId(funcInit, "scheduler", name)
	packageName := ""
	if ast.IsIdentifier(funcInit) {
		packageName = s.resolveAddonName(funcInit)
	}
	if name == "" || !schedule.Truthy() {
		return
	}
	s.ensureInlineWiringFunction(pikkuFuncId, name, funcInit, isHelper)
	middleware := s.resolveMiddleware(obj, cm.tagsOrNil())
	s.State.ServiceAggregation.UsedFunctions.Add(pikkuFuncId)
	s.addUsedWires(&FunctionMeta{Middleware: middleware})

	s.State.ScheduledTasks.Files.Add(ast.GetSourceFileOfNode(node).FileName())
	var o jsObject
	o.set("pikkuFuncId", pikkuFuncId)
	if packageName != "" {
		o.set("packageName", packageName)
	}
	o.set("name", name)
	o.set("schedule", propValue(schedule))
	o.setCommon(cm)
	o.set("middleware", middlewareValue(middleware))
	s.State.ScheduledTasks.Meta.Set(name, o.raw())
}

// orNull renders a missing name the way a JS template literal renders null.
func orNull(name string) string {
	if name == "" {
		return "null"
	}
	return name
}
