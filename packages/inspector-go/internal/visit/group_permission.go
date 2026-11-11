package visit

import (
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-permission.ts: pikkuPermission, pikkuAuth and
// pikkuPermissionFactory definitions, and addGlobalPermission registrations.

func init() {
	Register(Visitor{Name: "addPermission", Phase: PhaseSetup, Order: OrderAddPermission, Visit: (*Context).addPermission})
}

func (s *Context) isInsidePermissionContainer(node *ast.Node) bool {
	for cur := node.Parent; cur != nil; cur = cur.Parent {
		if ast.IsCallExpression(cur) && s.resolveCalleeName(cur, permissionHelpers) == "pikkuPermissionFactory" {
			return true
		}
	}
	return false
}

// isPropertyKey is isPropertyKey: a name that is the key of a property, not a
// reference to a variable.
func isPropertyKey(id *ast.Node) bool {
	p := id.Parent
	return (ast.IsPropertyAccessExpression(p) && p.Name() == id) ||
		(ast.IsPropertyAssignment(p) && p.Name() == id) ||
		(ast.IsBindingElement(p) && p.PropertyName() == id)
}

// neverReadsData is neverReadsData: whether a permission handler certainly
// ignores its data argument. Scoping is deliberately not worked out, and a rest
// parameter, a destructured argument and `arguments` count as a use, because a
// missed warning is better than a false one.
func neverReadsData(handler *ast.Node) bool {
	params := handler.Parameters()
	for i, p := range params {
		if i < 2 && p.AsParameterDeclaration().DotDotDotToken != nil {
			return false
		}
	}
	data := tsutil.ParamAt(handler, 1)
	name := ""
	if data != nil {
		if !ast.IsIdentifier(data.Name()) {
			return false
		}
		name = data.Name().Text()
		if strings.HasPrefix(name, "_") {
			return true
		}
	}

	referenced := false
	visit := func(n *ast.Node) {
		if ast.IsIdentifier(n) && (n.Text() == name || n.Text() == "arguments") && !isPropertyKey(n) {
			referenced = true
		}
	}
	for _, p := range params {
		if p != data {
			tsutil.WalkSelf(p, visit)
		}
	}
	tsutil.WalkSelf(handler.Body(), visit)
	return !referenced
}

// skipsWithoutSession is skipsWithoutSession: whether a permission's argument
// turns skipWithoutSession on, or might, since PKU587 must not flag what it
// cannot resolve.
func skipsWithoutSession(arg *ast.Node) bool {
	if !ast.IsObjectLiteralExpression(arg) {
		return false
	}
	for _, p := range arg.Properties() {
		if ast.IsSpreadAssignment(p) {
			return true
		}
		name := p.Name()
		if name == nil || (!ast.IsIdentifier(name) && !ast.IsStringLiteral(name)) || name.Text() != "skipWithoutSession" {
			continue
		}
		if !ast.IsPropertyAssignment(p) || unwrapExpression(p.Initializer()).Kind != ast.KindFalseKeyword {
			return true
		}
	}
	return false
}

// permissionCalls collects every pikkuPermission and pikkuAuth call under node.
func (s *Context) permissionCalls(node *ast.Node) []*ast.Node {
	var calls []*ast.Node
	var walk func(n *ast.Node)
	walk = func(n *ast.Node) {
		if ast.IsCallExpression(n) {
			if callee := s.resolveCalleeName(n, permissionHelpers); callee == "pikkuPermission" || callee == "pikkuAuth" {
				calls = append(calls, n)
			}
		}
		n.ForEachChild(func(c *ast.Node) bool {
			walk(c)
			return false
		})
	}
	walk(node)
	return calls
}

func (s *Context) addPermission(node *ast.Node) {
	switch s.resolveCalleeName(node, permissionHelpers) {
	case "pikkuPermission":
		s.addPermissionDefinition(node, false)
	case "pikkuAuth":
		s.addPermissionDefinition(node, true)
	case "pikkuPermissionFactory":
		s.addPermissionFactory(node)
	case "addGlobalPermission":
		s.addGlobalPermission(node)
	}
}

// addPermissionDefinition handles pikkuPermission and pikkuAuth. pikkuAuth's
// second parameter is the session, not a wires bag, and it never needs data.
func (s *Context) addPermissionDefinition(node *ast.Node, isAuth bool) {
	if s.isInsidePermissionContainer(node) {
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
	id, exportedName, ok := s.permissionDefinitionId(node, wrapper, example)
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
	// Only a function written here can be read, and `func` may have been
	// resolved through a variable. pikkuAuth is handed the session and nothing
	// else from the wire, so a check that reads any other wire cannot move.
	if !isAuth && (handler == arg || handler.Parent.Parent == arg) && wires.Optimized &&
		!slices.ContainsFunc(wires.Wires, func(wire string) bool { return wire != "session" }) &&
		neverReadsData(handler) {
		def.DataUnused = tsutil.BoolPtr(true)
	}
	if skipsWithoutSession(arg) {
		def.SkipWithoutSession = tsutil.BoolPtr(true)
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
	calls := s.permissionCalls(factory)
	body := factory.Body()
	if len(calls) > 0 && len(calls[0].Arguments()) > 0 {
		h := calls[0].Arguments()[0]
		if ast.IsObjectLiteralExpression(h) {
			h = s.getPropertyAssignmentInitializer(h, "func", true)
		}
		if tsutil.IsFunctionLike(h) {
			services = servicesOf(h)
			// pikkuAuth's second parameter is the session, not a wires bag.
			if s.resolveCalleeName(calls[0], permissionHelpers) != "pikkuAuth" {
				wires = extractUsedWires(h, 2)
			}
		}
	} else if len(calls) == 0 && tsutil.IsFunctionLike(body) {
		services = servicesOf(body)
		wires = extractUsedWires(body, 2)
	}
	// A plain function returned directly gets the guard from the factory, so
	// it has no option. Any other body cannot be read.
	skip := !tsutil.IsFunctionLike(body)
	if len(calls) > 0 {
		skip = slices.ContainsFunc(calls, func(call *ast.Node) bool {
			return len(call.Arguments()) == 0 || skipsWithoutSession(call.Arguments()[0])
		})
	}
	id, exportedName, ok := s.definitionId(node, "pikkuPermissionFactory", "myPermission")
	if !ok {
		return
	}
	def := &state.MiddlewareDefinition{
		Services: services, Wires: wiresOrNil(wires), SourceFile: fileOf(node), Position: startOf(node),
		ExportedName: nullableString(exportedName), Factory: tsutil.BoolPtr(true),
	}
	if skip {
		def.SkipWithoutSession = tsutil.BoolPtr(true)
	}
	s.State.Permissions.Definitions.Set(id, def)
	s.Log.Debugf("• Found permission factory with services: %s", joinServices(services))
}

// permissionDefinitionId is definitionId, except that a permission written
// inline in an addGlobalPermission([...]) array is named after where it sits.
func (s *Context) permissionDefinitionId(node *ast.Node, wrapper, example string) (string, string, bool) {
	if r := s.extractFunctionName(node); isTempId(r.pikkuFuncId) {
		if id := s.inlineGlobalPermissionId(node); id != "" {
			return id, r.exportedName, true
		}
	}
	return s.definitionId(node, wrapper, example)
}

// inlineGlobalPermissionId is inlineGlobalPermissionId: derived from where the
// permission sits, so the registration and the definition agree on it without
// either having to be visited first.
func (s *Context) inlineGlobalPermissionId(node *ast.Node) string {
	array := node.Parent
	if array == nil || !ast.IsArrayLiteralExpression(array) {
		return ""
	}
	call := array.Parent
	if call == nil || !ast.IsCallExpression(call) || len(call.Arguments()) == 0 || call.Arguments()[0] != array ||
		s.resolveCalleeName(call, permissionHelpers) != "addGlobalPermission" {
		return ""
	}
	rel, _ := filepath.Rel(s.RootDir, fileOf(node))
	return makeContextBasedId("global", "permission", rel, strconv.Itoa(startOf(node)))
}

// resolvePermissionLiteral is resolvePermissionLiteral: addGlobalPermission's
// argument followed to the array or object literal it was written as, through
// const declarations here or imported, or nil.
func (s *Context) resolvePermissionLiteral(argument *ast.Node) *ast.Node {
	cur := unwrapExpression(argument)
	for hops := 0; hops < 8 && cur != nil; hops++ {
		if ast.IsArrayLiteralExpression(cur) || ast.IsObjectLiteralExpression(cur) {
			return cur
		}
		if !ast.IsIdentifier(cur) {
			return nil
		}
		sym := s.Checker.GetSymbolAtLocation(cur)
		if sym != nil && sym.Flags&ast.SymbolFlagsAlias != 0 {
			sym = s.Checker.GetAliasedSymbol(sym)
		}
		if sym == nil {
			return nil
		}
		d := sym.ValueDeclaration
		if d == nil || !ast.IsVariableDeclaration(d) || d.Initializer() == nil {
			return nil
		}
		cur = unwrapExpression(d.Initializer())
	}
	return nil
}

func (s *Context) isNamedExportedFunction(decl *ast.Node) bool {
	if decl.Name() == nil {
		return false
	}
	flags := ast.GetCombinedModifierFlags(decl)
	if flags&ast.ModifierFlagsDefault != 0 {
		return false
	}
	if flags&ast.ModifierFlagsExport != 0 {
		return true
	}
	sf := ast.GetSourceFileOfNode(decl)
	modSym := s.Checker.GetSymbolAtLocation(sf.AsNode())
	sym := s.Checker.GetSymbolAtLocation(decl.Name())
	if modSym == nil || sym == nil {
		return false
	}
	for _, exported := range s.Checker.GetExportsOfModule(modSym) {
		resolved := exported
		if exported.Flags&ast.SymbolFlagsAlias != 0 {
			resolved = s.Checker.GetAliasedSymbol(exported)
		}
		if resolved == sym {
			return true
		}
	}
	return false
}

func isImmediatelyInvoked(fn *ast.Node) bool {
	cur := fn
	for cur.Parent != nil && ast.IsParenthesizedExpression(cur.Parent) {
		cur = cur.Parent
	}
	return cur.Parent != nil && ast.IsCallExpression(cur.Parent) && cur.Parent.Expression() == cur
}

// globalPermissionActivation is globalPermissionActivation: how the generated
// permissions file makes the call run. It returns reachable false when
// nothing ever calls it, and the factory to call when importing is not enough.
func (s *Context) globalPermissionActivation(call *ast.Node) (exportName string, reachable bool) {
	for cur := call.Parent; cur != nil && !ast.IsSourceFile(cur); cur = cur.Parent {
		if !(ast.IsArrowFunction(cur) || ast.IsFunctionExpression(cur) || ast.IsFunctionDeclaration(cur) ||
			ast.IsMethodDeclaration(cur) || ast.IsConstructorDeclaration(cur) ||
			ast.IsGetAccessorDeclaration(cur) || ast.IsSetAccessorDeclaration(cur)) {
			continue
		}
		if isImmediatelyInvoked(cur) {
			continue
		}
		if len(cur.Parameters()) > 0 {
			return "", false
		}
		if (ast.IsArrowFunction(cur) || ast.IsFunctionExpression(cur)) && ast.IsVariableDeclaration(cur.Parent) &&
			ast.IsIdentifier(cur.Parent.Name()) && s.isNamedExport(cur.Parent) {
			return cur.Parent.Name().Text(), true
		}
		if ast.IsFunctionDeclaration(cur) && cur.Name() != nil && s.isNamedExportedFunction(cur) {
			return cur.Name().Text(), true
		}
		return "", false
	}
	return "", true
}

func (s *Context) globalPermissionEntryId(entry *ast.Node) []string {
	switch {
	case ast.IsIdentifier(entry):
		if r := s.extractFunctionName(entry); !isTempId(r.pikkuFuncId) {
			return []string{r.pikkuFuncId}
		}
		return []string{entry.Text()}
	case ast.IsCallExpression(entry):
		if id := s.inlineGlobalPermissionId(entry); id != "" {
			return []string{id}
		}
		if p := entry.Parent; ast.IsPropertyAssignment(p) && ast.IsIdentifier(p.Name()) &&
			s.resolveCalleeName(entry, permissionHelpers) != "" {
			return []string{p.Name().Text()}
		}
		r := s.extractFunctionName(entry.Expression())
		if isTempId(r.pikkuFuncId) && ast.IsIdentifier(entry.Expression()) {
			return []string{entry.Expression().Text()}
		}
		return []string{r.pikkuFuncId}
	}
	return nil
}

func (s *Context) addGlobalPermission(node *ast.Node) {
	sourceFile := fileOf(node)
	var entries []*ast.Node
	var literal *ast.Node
	if args := node.Arguments(); len(args) > 0 {
		literal = s.resolvePermissionLiteral(args[0])
	}
	switch {
	case literal == nil:
		s.Log.Warn("• addGlobalPermission(...) in " + sourceFile + " is not given an array or object it can follow to a literal, so the services its permissions use cannot be seen.")
	case ast.IsArrayLiteralExpression(literal):
		entries = literal.AsArrayLiteralExpression().Elements.Nodes
	default:
		for _, p := range literal.AsObjectLiteralExpression().Properties.Nodes {
			switch {
			case ast.IsPropertyAssignment(p):
				entries = append(entries, p.Initializer())
			case ast.IsShorthandPropertyAssignment(p):
				entries = append(entries, p.Name())
			}
		}
	}

	definitionIds := state.Strings{}
	for _, entry := range entries {
		definitionIds = append(definitionIds, s.globalPermissionEntryId(entry)...)
	}

	exportName, reachable := s.globalPermissionActivation(node)
	if !reachable {
		s.Log.Warn("• addGlobalPermission(...) in " + sourceFile + " sits inside a function that nothing calls: only a call at the top level, or inside an exported function with no parameters, is run by the generated permissions file. This global permission is NOT registered. Export it as `export const name = () => { addGlobalPermission(...) }` or move it to the top level.")
		return
	}

	position := startOf(node)
	known := false
	for _, g := range s.State.Permissions.Global {
		if g.SourceFile == sourceFile && g.Position == position {
			known = true
		}
	}
	if !known {
		s.State.Permissions.Global = append(s.State.Permissions.Global, &state.GlobalPermissionRegistration{
			SourceFile: sourceFile, Position: position, ExportName: nullableString(exportName), DefinitionIds: definitionIds,
			TargetsPackage: len(node.Arguments()) > 1,
		})
	}
	s.Log.Debugf("• Found global permissions in %s: [%s]", sourceFile, strings.Join(definitionIds, ", "))
}
