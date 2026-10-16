package visit

import (
	"fmt"
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Ports of add/add-file-extends-core-type.ts and add/add-file-with-factory.ts.

func init() {
	core := func(order int, typeName string, pick func(*state.State) *state.PathToNameAndType) {
		Register(Visitor{Name: "addFileExtendsCoreType " + typeName, Phase: PhaseSetup, Order: order,
			Visit: func(c *Context, n *ast.Node) { c.addFileExtendsCoreType(n, pick(c.State), typeName) }})
	}
	core(OrderCoreSingletonServices, "CoreSingletonServices", func(s *state.State) *state.PathToNameAndType { return &s.SingletonServicesTypeImportMap })
	core(OrderCoreServices, "CoreServices", func(s *state.State) *state.PathToNameAndType { return &s.WireServicesTypeImportMap })
	core(OrderCoreUserSession, "CoreUserSession", func(s *state.State) *state.PathToNameAndType { return &s.UserSessionTypeImportMap })
	core(OrderCoreConfig, "CoreConfig", func(s *state.State) *state.PathToNameAndType { return &s.ConfigTypeImportMap })

	factory := func(order int, typeName string, withState bool, pick func(*state.State) *state.PathToNameAndType) {
		Register(Visitor{Name: "addFileWithFactory " + typeName, Phase: PhaseSetup, Order: order,
			Visit: func(c *Context, n *ast.Node) { c.addFileWithFactory(n, pick(c.State), typeName, withState) }})
	}
	factory(OrderCreateSingletonServices, "CreateSingletonServices", true, func(s *state.State) *state.PathToNameAndType { return &s.SingletonServicesFactories })
	factory(OrderCreateWireServices, "CreateWireServices", true, func(s *state.State) *state.PathToNameAndType { return &s.WireServicesFactories })
	factory(OrderCreateConfig, "CreateConfig", false, func(s *state.State) *state.PathToNameAndType { return &s.ConfigFactories })
	factory(OrderServerLifecycle, "ServerLifecycle", false, func(s *state.State) *state.PathToNameAndType { return &s.ServerLifecycleFactories })
}

func appendNameAndType(m *state.PathToNameAndType, file string, e state.NameAndType) {
	vars, _ := m.Get(file)
	m.Set(file, append(vars, e))
}

func declarationPath(sym *ast.Symbol) *string {
	if d := tsutil.FirstDecl(sym); d != nil {
		return tsutil.StrPtr(ast.GetSourceFileOfNode(d).FileName())
	}
	return nil
}

func (s *Context) addFileExtendsCoreType(node *ast.Node, methods *state.PathToNameAndType, expected string) {
	if !ast.IsClassDeclaration(node) && !ast.IsInterfaceDeclaration(node) {
		return
	}
	fileName := ast.GetSourceFileOfNode(node).FileName()
	typeName := ""
	if node.Name() != nil {
		typeName = tsutil.NodeText(node.Name())
	}
	for _, t := range ast.GetExtendsHeritageClauseElements(node) {
		expr := t.Expression()
		if tsutil.NodeText(expr) != expected {
			continue
		}
		// Like the TS checker, the symbol of an imported name is the import
		// alias, so typePath is the file holding the import declaration.
		typePath := declarationPath(s.Checker.GetSymbolAtLocation(expr))
		if typeName == "" {
			kind := "interface"
			if ast.IsClassDeclaration(node) {
				kind = "class"
			}
			// TS throws here, which aborts inspection.
			s.Log.Error(fmt.Sprintf("Found anonymous %s extending %s in %s. Classes and interfaces that extend core types must have a name.", kind, expected, fileName))
			return
		}
		appendNameAndType(methods, fileName, state.NameAndType{Variable: typeName, Type: tsutil.StrPtr(typeName), TypePath: typePath})
		if sym := s.Checker.GetSymbolAtLocation(node.Name()); sym != nil {
			s.recordCoreTypeProperties(typeName, sym)
		}
	}
}

// recordCoreTypeProperties stands in for `typesLookup.set(typeName,
// [declaredType])`. Only the symbol is kept here: resolving the type's members
// during the sweep would create types earlier than TS does and change union
// and property order elsewhere. FinishCoreTypeProperties reads them at the end.
func (s *Context) recordCoreTypeProperties(typeName string, sym *ast.Symbol) {
	for i, e := range s.coreTypes {
		if e.name == typeName {
			s.coreTypes[i].sym = sym
			return
		}
	}
	s.coreTypes = append(s.coreTypes, coreType{typeName, sym})
}

type coreType struct {
	name string
	sym  *ast.Symbol
}

// FinishCoreTypeProperties fills state.coreTypeProperties: each core
// interface's property names, sorted — everything later readers take from
// those typesLookup entries (they test membership only). Sorted because
// typescript-go lists inherited members before own ones, TS the reverse.
func (s *Context) FinishCoreTypeProperties() {
	for _, ct := range s.coreTypes {
		props := state.Strings{}
		for _, p := range s.Checker.GetPropertiesOfType(s.Checker.GetDeclaredTypeOfSymbol(ct.sym)) {
			props = append(props, p.Name)
		}
		slices.Sort(props)
		if s.State.CoreTypeProperties == nil {
			s.State.CoreTypeProperties = state.NewRecord[state.Strings]()
		}
		s.State.CoreTypeProperties.Set(ct.name, props)
	}
}

var wrapperFactoryTypes = map[string]string{
	"pikkuConfig":            "CreateConfig",
	"pikkuAddonConfig":       "CreateConfig",
	"pikkuServices":          "CreateSingletonServices",
	"pikkuAddonServices":     "CreateSingletonServices",
	"pikkuWireServices":      "CreateWireServices",
	"pikkuAddonWireServices": "CreateWireServices",
	"pikkuServerLifecycle":   "ServerLifecycle",
}

func functionNodeOf(n *ast.Node) *ast.Node {
	if n != nil && (ast.IsArrowFunction(n) || ast.IsFunctionExpression(n)) {
		return n
	}
	return nil
}

// extractServicesFromFunction ports utils/extract-services.ts (services only).
func extractServicesFromFunction(fn *ast.Node) []string {
	services := []string{}
	if p := tsutil.ParamAt(fn, 0); p != nil && ast.IsObjectBindingPattern(p.Name()) {
		services = append(services, tsutil.BindingNames(p)...)
	}
	return services
}

func (s *Context) addFileWithFactory(node *ast.Node, methods *state.PathToNameAndType, expected string, withState bool) {
	if !ast.IsVariableDeclaration(node) {
		return
	}
	fileName := ast.GetSourceFileOfNode(node).FileName()
	variableName := tsutil.NodeText(node.Name())
	init := node.Initializer()

	if init != nil && ast.IsCallExpression(init) && ast.IsIdentifier(init.Expression()) {
		wrapper := init.Expression().Text()
		if wrapperFactoryTypes[wrapper] == expected {
			appendNameAndType(methods, fileName, state.NameAndType{
				Variable: variableName, Type: tsutil.StrPtr(expected),
				TypePath: declarationPath(s.Checker.GetSymbolAtLocation(init.Expression())),
			})
			if withState && len(init.Arguments()) > 0 {
				fn := functionNodeOf(init.Arguments()[0])
				if expected == "CreateWireServices" && fn != nil {
					s.State.WireServicesMeta.Set(variableName, extractServicesFromFunction(fn))
				}
				if (wrapper == "pikkuAddonServices" || wrapper == "pikkuAddonWireServices") && fn != nil {
					s.State.AddonServicesFactorySeen = true
					idx := 1
					if wrapper == "pikkuAddonWireServices" {
						idx = 0
					}
					forwarded := tsutil.Dedupe(extractForwardedServices(fn, idx))
					s.State.AddonRequiredParentServices = append(s.State.AddonRequiredParentServices, forwarded...)
					isForwarded := map[string]bool{}
					for _, f := range forwarded {
						isForwarded[f] = true
					}
					for _, name := range extractReturnedServices(fn) {
						if !isForwarded[name] {
							s.State.AddonCreatedServices = append(s.State.AddonCreatedServices, name)
						}
					}
				}
			}
			return
		}
	}

	typeNode := node.Type()
	if typeNode == nil || !ast.IsTypeReferenceNode(typeNode) {
		return
	}
	typeName := typeNode.AsTypeReferenceNode().TypeName
	var ident *ast.Node
	switch {
	case ast.IsIdentifier(typeName) && typeName.Text() == expected:
		ident = typeName
	case ast.IsQualifiedName(typeName) && typeName.AsQualifiedName().Right.Text() == expected:
		ident = typeName.AsQualifiedName().Right
	default:
		return
	}
	appendNameAndType(methods, fileName, state.NameAndType{
		Variable: variableName, Type: tsutil.StrPtr(tsutil.NodeText(typeName)),
		TypePath: declarationPath(s.Checker.GetSymbolAtLocation(ident)),
	})
	if expected == "CreateWireServices" && withState {
		if fn := functionNodeOf(init); fn != nil {
			s.State.WireServicesMeta.Set(variableName, extractServicesFromFunction(fn))
		}
	}
}

// extractForwardedServices: the names an addon factory destructures off the
// parent's services parameter, in the parameter list or from a
// `const { … } = <param>` in the body (not descending into callbacks that
// shadow the parameter).
func extractForwardedServices(fn *ast.Node, paramIndex int) []string {
	var forwarded []string
	param := tsutil.ParamAt(fn, paramIndex)
	if param == nil {
		return forwarded
	}
	collect := func(pattern *ast.Node) {
		for _, e := range pattern.Elements() {
			if e.AsBindingElement().DotDotDotToken != nil {
				continue
			}
			pn := e.PropertyName()
			switch {
			case pn != nil && ast.IsIdentifier(pn):
				forwarded = append(forwarded, pn.Text())
			case pn == nil && ast.IsIdentifier(e.Name()):
				forwarded = append(forwarded, e.Name().Text())
			case pn != nil && ast.IsIdentifier(e.Name()):
				// propertyName that is not an identifier (string/computed):
				// TS falls back to the local name.
				forwarded = append(forwarded, e.Name().Text())
			}
		}
	}
	if ast.IsObjectBindingPattern(param.Name()) {
		collect(param.Name())
		return forwarded
	}
	if !ast.IsIdentifier(param.Name()) {
		return forwarded
	}
	paramName := param.Name().Text()
	body := fn.Body()
	if body == nil || !ast.IsBlock(body) {
		return forwarded
	}
	var bindsName func(n *ast.Node) bool
	bindsName = func(n *ast.Node) bool {
		if ast.IsIdentifier(n) {
			return n.Text() == paramName
		}
		for _, e := range n.Elements() {
			if !ast.IsOmittedExpression(e) && bindsName(e.Name()) {
				return true
			}
		}
		return false
	}
	shadows := func(n *ast.Node) bool {
		if !ast.IsFunctionLike(n) {
			return false
		}
		for _, p := range n.Parameters() {
			if bindsName(p.Name()) {
				return true
			}
		}
		return false
	}
	var visit func(n *ast.Node) bool
	visit = func(n *ast.Node) bool {
		if ast.IsVariableDeclaration(n) && ast.IsObjectBindingPattern(n.Name()) && n.Initializer() != nil &&
			ast.IsIdentifier(n.Initializer()) && n.Initializer().Text() == paramName {
			collect(n.Name())
			return false
		}
		if shadows(n) {
			return false
		}
		n.ForEachChild(visit)
		return false
	}
	body.ForEachChild(visit)
	return forwarded
}

// extractReturnedServices: property names of the object literals the factory
// returns, skipping spreads and nested functions.
func extractReturnedServices(fn *ast.Node) []string {
	var returned []string
	collect := func(e *ast.Node) {
		for ast.IsParenthesizedExpression(e) {
			e = e.Expression()
		}
		if !ast.IsObjectLiteralExpression(e) {
			return
		}
		for _, p := range e.Properties() {
			if ast.IsSpreadAssignment(p) {
				continue
			}
			if n := p.Name(); n != nil && (ast.IsIdentifier(n) || ast.IsStringLiteral(n)) {
				returned = append(returned, n.Text())
			}
		}
	}
	body := fn.Body()
	if body == nil {
		return returned
	}
	if !ast.IsBlock(body) {
		collect(body)
		return returned
	}
	var visit func(n *ast.Node) bool
	visit = func(n *ast.Node) bool {
		if ast.IsFunctionDeclaration(n) || ast.IsFunctionExpression(n) || ast.IsArrowFunction(n) {
			return false
		}
		if ast.IsReturnStatement(n) && n.Expression() != nil {
			collect(n.Expression())
		}
		n.ForEachChild(visit)
		return false
	}
	body.ForEachChild(visit)
	return returned
}
