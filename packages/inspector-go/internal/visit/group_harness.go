package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// pikkuHarness and pikkuHarnessGateAgent have no body and are read here.
// pikkuHarnessGate has one, so addFunctions reads it as a function and
// readHarnessGate adds its harness fields.

func init() {
	Register(Visitor{Name: "addHarness", Phase: PhaseRoutes, Order: OrderAddHarness, Visit: (*Context).addHarness})
}

const (
	harnessWrapper          = "pikkuHarness"
	harnessGateWrapper      = "pikkuHarnessGate"
	harnessGateAgentWrapper = "pikkuHarnessGateAgent"
)

var harnessSeverities = map[string]bool{"low": true, "medium": true, "high": true}

// defaultHarnessWrites is what a gate may change when it declares no `writes`.
var defaultHarnessWrites = []string{".pikku/**"}

type harnessGateConfig struct {
	failOn string
	writes []string
}

// readHarnessGate reads a pikkuHarnessGate's name, failOn and writes. It
// reports and returns nil when one of them is not readable from source.
func (s *Context) readHarnessGate(obj *ast.Node, name string) *harnessGateConfig {
	if !ast.IsObjectLiteralExpression(obj) {
		s.Log.Critical(diag.InvalidValue, "A harness gate is declared with a config that is not an inline object: `"+tsutil.NodeText(obj)+
			"`. Its name, failOn and writes have to be readable from source.")
		return nil
	}
	if name == "" {
		s.Log.Critical(diag.MissingName, "Harness gate is missing the required 'name' property.")
		return nil
	}
	if !tsutil.GetPropertyValue(obj, "description").Truthy() {
		s.Log.Critical(diag.MissingDescription, fmt.Sprintf("Harness gate '%s' is missing the required 'description' property.", name))
		return nil
	}
	failOn, ok := s.harnessFailOn(obj, "Harness gate '"+name+"'")
	if !ok {
		return nil
	}
	writes := defaultHarnessWrites
	if p := tsutil.FindPropertyAssignment(obj, "writes"); p != nil {
		if writes, ok = literalStrings(p.Initializer()); !ok {
			s.Log.Critical(diag.InvalidValue, fmt.Sprintf("Harness gate '%s' has a writes that is not an inline array of path patterns: `%s`. "+
				"The engine checks every change the gate makes against it, so it has to be readable from source.", name, tsutil.NodeText(p.Initializer())))
			return nil
		}
	}
	return &harnessGateConfig{failOn: failOn, writes: writes}
}

func (s *Context) harnessFailOn(obj *ast.Node, label string) (string, bool) {
	failOn := tsutil.GetPropertyValue(obj, "failOn").AsString()
	if !harnessSeverities[failOn] {
		s.Log.Critical(diag.InvalidValue, label+" has no failOn of 'low', 'medium' or 'high' readable from source. "+
			"It is the lowest finding severity that fails the gate.")
		return "", false
	}
	return failOn, true
}

// literalStrings is the elements of an inline array of string literals.
func literalStrings(n *ast.Node) ([]string, bool) {
	n = tsutil.UnwrapAs(n)
	if !ast.IsArrayLiteralExpression(n) {
		return nil, false
	}
	out := []string{}
	for _, e := range n.Elements() {
		if !ast.IsStringLiteral(e) {
			return nil, false
		}
		out = append(out, e.Text())
	}
	return out, true
}

func (s *Context) harnessState() *state.Harness {
	if s.State.Harness == nil {
		s.State.Harness = &state.Harness{}
	}
	return s.State.Harness
}

func (s *Context) addHarness(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	callee := node.Expression().Text()
	if callee != harnessWrapper && callee != harnessGateAgentWrapper {
		return
	}
	args := node.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return
	}
	obj := args[0]
	label := "Harness"
	if callee == harnessGateAgentWrapper {
		label = "Harness gate agent"
	}
	name := tsutil.GetPropertyValue(obj, "name").AsString()
	if name == "" {
		s.Log.Critical(diag.MissingName, label+" is missing the required 'name' property.")
		return
	}
	description := tsutil.GetPropertyValue(obj, "description")
	if !description.Truthy() {
		s.Log.Critical(diag.MissingDescription, fmt.Sprintf("%s '%s' is missing the required 'description' property.", label, name))
		return
	}
	exportedName := s.extractFunctionName(node).exportedName
	sourceFile := ast.GetSourceFileOfNode(node).FileName()

	if callee == harnessGateAgentWrapper {
		s.addHarnessGateAgent(obj, name, truthyString(description), sourceFile, exportedName)
		return
	}

	agent, ok := s.harnessModel(objectProperty(obj, "agent"), fmt.Sprintf("Harness '%s' has no agent model", name))
	if !ok {
		return
	}
	gates, ok := s.resolveHarnessGates(obj, name)
	if !ok {
		return
	}
	s.harnessState().HarnessesMeta.Set(name, &state.HarnessMeta{
		Name: name, Description: truthyString(description), Harness: true,
		Agent: state.HarnessAgentMeta{Model: agent}, Gates: gates,
		SourceFile: sourceFile, ExportedName: exportedName,
	})
}

func (s *Context) addHarnessGateAgent(obj *ast.Node, name, description, sourceFile, exportedName string) {
	label := "Harness gate agent '" + name + "'"
	if gate := s.State.Functions.Meta.At(name); gate != nil && gate.Harness != nil {
		s.Log.Critical(diag.DuplicateFunctionName, fmt.Sprintf("%s has the name of the harness gate in '%s'. A harness names its gates, so the two must differ.", label, gate.SourceFile))
		return
	}
	model, ok := s.harnessModel(obj, label+" has no model")
	if !ok {
		return
	}
	goal := tsutil.GetPropertyValue(obj, "goal").AsString()
	if goal == "" {
		s.Log.Critical(diag.InvalidValue, label+" has no goal readable from source. The goal is what the reviewer is asked to check.")
		return
	}
	failOn, ok := s.harnessFailOn(obj, label)
	if !ok {
		return
	}
	s.harnessState().GateAgentsMeta.Set(name, &state.HarnessGateAgentMeta{
		Name: name, Description: description, Harness: true,
		Model: model, Goal: goal, FailOn: failOn,
		SourceFile: sourceFile, ExportedName: exportedName,
	})
}

// harnessModel reads the string literal `model` of obj.
func (s *Context) harnessModel(obj *ast.Node, missing string) (string, bool) {
	model := ""
	if obj != nil {
		model = tsutil.GetPropertyValue(obj, "model").AsString()
	}
	if model == "" {
		s.Log.Critical(diag.MissingModel, missing+" readable from source. Give `model` as a string literal.")
		return "", false
	}
	return model, true
}

// objectProperty is the inline object literal assigned to name, or nil.
func objectProperty(obj *ast.Node, name string) *ast.Node {
	p := tsutil.FindPropertyAssignment(obj, name)
	if p == nil {
		return nil
	}
	if init := tsutil.UnwrapAs(p.Initializer()); ast.IsObjectLiteralExpression(init) {
		return init
	}
	return nil
}

// resolveHarnessGates reads `gates`: gate names, references to declared gates
// and gate agents, `.with({ failOn })` on such a reference, and spreads of
// const arrays of these, followed to their declarations.
func (s *Context) resolveHarnessGates(obj *ast.Node, harnessName string) ([]state.HarnessGateEntry, bool) {
	p := tsutil.FindPropertyAssignment(obj, "gates")
	if p == nil {
		s.Log.Critical(diag.InvalidValue, fmt.Sprintf("Harness '%s' has no gates. List the gates that must pass, by name or by reference.", harnessName))
		return nil, false
	}
	gates := []state.HarnessGateEntry{}
	ok := s.collectHarnessGates(p.Initializer(), harnessName, &gates, map[*ast.Node]bool{})
	return gates, ok
}

func (s *Context) collectHarnessGates(list *ast.Node, harnessName string, out *[]state.HarnessGateEntry, seen map[*ast.Node]bool) bool {
	arr := s.constArrayLiteral(list, seen)
	if arr == nil {
		s.notStaticGates(harnessName, list)
		return false
	}
	for _, el := range arr.Elements() {
		if ast.IsSpreadElement(el) {
			if !s.collectHarnessGates(el.Expression(), harnessName, out, seen) {
				return false
			}
			continue
		}
		entry, ok := s.harnessGateEntry(el)
		if !ok {
			s.notStaticGates(harnessName, el)
			return false
		}
		*out = append(*out, entry)
	}
	return true
}

func (s *Context) notStaticGates(harnessName string, n *ast.Node) {
	s.Log.Critical(diag.InvalidValue, fmt.Sprintf("Harness '%s' lists gates that are not readable from source: `%s`. "+
		"Use a gate name, a declared gate or gate agent (optionally `.with({ failOn })`), or a spread of a const array of these.",
		harnessName, tsutil.NodeText(n)))
}

// constArrayLiteral is n when it is an inline array, or the array a const
// identifier is initialised with.
func (s *Context) constArrayLiteral(n *ast.Node, seen map[*ast.Node]bool) *ast.Node {
	n = tsutil.UnwrapAs(tsutil.UnwrapNonNullParens(n))
	if ast.IsArrayLiteralExpression(n) {
		return n
	}
	init := s.constInitializer(n)
	if init == nil || seen[init] {
		return nil
	}
	seen[init] = true
	init = tsutil.UnwrapAs(init)
	if ast.IsArrayLiteralExpression(init) {
		return init
	}
	return nil
}

// constInitializer is the initializer of the const an identifier refers to.
func (s *Context) constInitializer(n *ast.Node) *ast.Node {
	if !ast.IsIdentifier(n) {
		return nil
	}
	for _, decl := range s.declsOf(n) {
		if ast.IsVariableDeclaration(decl) && decl.Initializer() != nil && ast.IsVariableDeclarationList(decl.Parent) &&
			decl.Parent.Flags&ast.NodeFlagsConst != 0 {
			return decl.Initializer()
		}
	}
	return nil
}

func (s *Context) harnessGateEntry(el *ast.Node) (state.HarnessGateEntry, bool) {
	el = tsutil.UnwrapAs(el)
	if ast.IsStringLiteral(el) {
		return state.HarnessGateEntry{Name: el.Text()}, true
	}
	if ast.IsCallExpression(el) && ast.IsPropertyAccessExpression(el.Expression()) && el.Expression().Name().Text() == "with" {
		name, ok := s.harnessGateReference(el.Expression().Expression())
		args := el.Arguments()
		if !ok || len(args) != 1 || !ast.IsObjectLiteralExpression(args[0]) {
			return state.HarnessGateEntry{}, false
		}
		failOn := tsutil.GetPropertyValue(args[0], "failOn").AsString()
		if !harnessSeverities[failOn] {
			return state.HarnessGateEntry{}, false
		}
		return state.HarnessGateEntry{Name: name, FailOn: failOn}, true
	}
	name, ok := s.harnessGateReference(el)
	return state.HarnessGateEntry{Name: name}, ok
}

// harnessGateReference is the name of the gate or gate agent an identifier
// refers to.
func (s *Context) harnessGateReference(n *ast.Node) (string, bool) {
	init := s.constInitializer(n)
	if init == nil || !ast.IsCallExpression(init) || !ast.IsIdentifier(init.Expression()) {
		return "", false
	}
	callee := init.Expression().Text()
	if callee != harnessGateWrapper && callee != harnessGateAgentWrapper {
		return "", false
	}
	args := init.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return "", false
	}
	name := tsutil.GetPropertyValue(args[0], "name").AsString()
	return name, name != ""
}
