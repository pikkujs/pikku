package visit

import (
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-analytics.ts (and its helpers add-outgoing-webhook.ts
// shares).

func init() {
	Register(Visitor{Name: "addAnalytics", Phase: PhaseSetup, Order: OrderAddAnalytics, Visit: (*Context).addAnalytics})
}

// definerDeclaration matches `const <name> = <definer>(...)` and returns the
// call and the name identifier.
func (s *Context) definerDeclaration(node *ast.Node, definer string) (call, name *ast.Node) {
	if !ast.IsVariableDeclaration(node) {
		return nil, nil
	}
	init := node.Initializer()
	if init == nil || !ast.IsCallExpression(init) || !s.callsImportedDefiner(init.Expression(), definer) {
		return nil, nil
	}
	if name = node.Name(); !ast.IsIdentifier(name) {
		return nil, nil
	}
	return init, name
}

// moduleExportedName is add-analytics.ts exportedName: the name the module
// exports the declaration under.
func (s *Context) moduleExportedName(decl, name *ast.Node) (string, bool) {
	sf := ast.GetSourceFileOfNode(decl)
	modSym := s.Checker.GetSymbolAtLocation(sf.AsNode())
	if modSym == nil {
		modSym = sf.AsNode().Symbol()
	}
	declSym := s.Checker.GetSymbolAtLocation(name)
	if modSym == nil || declSym == nil {
		if s.isNamedExport(decl) {
			return name.Text(), true
		}
		return "", false
	}
	for _, exp := range s.Checker.GetExportsOfModule(modSym) {
		if s.resolveAlias(exp) == declSym {
			return tsutil.SymbolName(exp), true
		}
	}
	return "", false
}

// findObjectShape finds the `z.object({ ... })` shape anywhere in a call chain.
func findObjectShape(expr *ast.Node) *ast.Node {
	cur := expr
	for cur != nil && ast.IsCallExpression(cur) {
		callee := cur.Expression()
		if ast.IsPropertyAccessExpression(callee) && callee.Name().Text() == "object" {
			if args := cur.Arguments(); len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
				return args[0]
			}
		}
		if ast.IsPropertyAccessExpression(callee) {
			cur = callee.Expression()
		} else {
			cur = nil
		}
	}
	return nil
}

// readEventShape is an event's props as whitespace-collapsed source text; nil
// when no shape can be read.
func readEventShape(init *ast.Node) *state.Record[string] {
	shape := findObjectShape(init)
	if shape == nil {
		return nil
	}
	props := state.NewRecord[string]()
	for _, p := range shape.Properties() {
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		key, ok := literalKeyName(p.Name())
		if !ok {
			continue
		}
		props.Set(key, tsutil.CollapseWhitespace(tsutil.NodeText(p.Initializer())))
	}
	return props
}

func (s *Context) addAnalytics(node *ast.Node) {
	call, name := s.definerDeclaration(node, "defineAnalyticsEvents")
	if call == nil {
		return
	}
	file := ast.GetSourceFileOfNode(node).FileName()
	args := call.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		s.Log.Error("defineAnalyticsEvents in " + file + " must be called with an object literal keyed by event name, so the generated ingest knows what to union.")
		return
	}

	events := state.Strings{}
	props := state.NewRecord[*state.Record[string]]()
	for _, p := range args[0].Properties() {
		if ast.IsShorthandPropertyAssignment(p) {
			events = append(events, p.Name().Text())
			continue
		}
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		eventName, ok := literalKeyName(p.Name())
		if !ok {
			continue
		}
		events = append(events, eventName)
		if shape := readEventShape(p.Initializer()); shape != nil {
			props.Set(eventName, shape)
		}
	}

	if len(events) == 0 {
		s.Log.Error("defineAnalyticsEvents in " + file + " declares no events. Remove it or add one.")
		return
	}
	variable, ok := s.moduleExportedName(node, name)
	if !ok {
		s.Log.Error("defineAnalyticsEvents in " + file + " is assigned to '" + name.Text() +
			"', which the module does not export. The generated ingest imports every declaration by name, so export it.")
		return
	}
	if props.Len() == 0 {
		props = nil
	}

	for _, d := range s.State.Analytics {
		if d.File == file && d.Variable == variable {
			d.Events = events
			d.Props = props
			return
		}
	}
	for _, eventName := range events {
		for _, d := range s.State.Analytics {
			if slices.Contains(d.Events, eventName) {
				s.Log.Error("Analytics event '" + eventName + "' is declared twice: " + d.File + " and " + file +
					". An event name belongs to one declaration.")
				return
			}
		}
	}
	s.State.Analytics = append(s.State.Analytics, &state.AnalyticsDeclaration{File: file, Variable: variable, Events: events, Props: props})
}
