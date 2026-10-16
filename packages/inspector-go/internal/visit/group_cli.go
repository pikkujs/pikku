package visit

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-cli.ts: addCLI and addCLIRenderers.
//
// Program, command and option metadata are ordered JS objects whose keys
// follow the source order of the wiring's properties, so they are built as
// ordered records (jsObject) rather than structs.

func init() {
	Register(Visitor{Name: "addCLI", Phase: PhaseRoutes, Order: OrderAddCLI, Visit: (*Context).addCLI})
	Register(Visitor{Name: "addCLIRenderers", Phase: PhaseRoutes, Order: OrderAddCLIRenderers, Visit: (*Context).addCLIRenderers})
}

type cliPositional struct {
	Name     string `json:"name"`
	Required bool   `json:"required"`
	Variadic bool   `json:"variadic,omitempty"`
}

type cliServices struct {
	Optimized bool     `json:"optimized"`
	Services  []string `json:"services"`
}

type cliRendererMeta struct {
	Name         string      `json:"name"`
	ExportedName string      `json:"exportedName,omitempty"`
	Services     cliServices `json:"services"`
	FilePath     string      `json:"filePath"`
}

// cliProgram carries the fields processCommands needs from its program.
type cliProgram struct {
	name string
	tags []string
}

func (s *Context) addCLI(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	args := node.Arguments()
	switch node.Expression().Text() {
	case "defineCLICommands":
		exportName := s.exportedVariableNameOf(node)
		if exportName != "" && len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
			cmds := s.processCLICommands(args[0], cliProgram{name: exportName})
			s.State.ExportedContracts.CLI.Set(exportName, state.RawOf(cmds))
		}
		return
	case "wireCLI":
	default:
		return
	}
	if len(args) != 1 || !ast.IsObjectLiteralExpression(args[0]) {
		return
	}
	s.State.CLI.Files.Add(ast.GetSourceFileOfNode(node).FileName())
	name, meta, ok := s.processCLIConfig(args[0])
	if !ok {
		return
	}
	s.State.CLI.Meta.Programs.Set(name, meta.raw())
}

// processCLIConfig is add-cli.ts processCLIConfig.
func (s *Context) processCLIConfig(obj *ast.Node) (string, *jsObject, bool) {
	program := cliProgram{}
	meta := &jsObject{}
	meta.set("program", "")
	meta.set("commands", state.NewRecord[state.Raw]())
	meta.set("options", state.NewRecord[state.Raw]())

	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		switch p.Name().Text() {
		case "program":
			if ast.IsStringLiteral(p.Initializer()) {
				program.name = p.Initializer().Text()
				meta.set("program", program.name)
			}
		case "tags":
			program.tags = tsutil.GetPropertyValue(obj, "tags").Strs
		}
	}
	if program.name == "" {
		return "", nil, false
	}
	if v := tsutil.GetPropertyValue(obj, "disabled").Bool; v != nil && *v {
		return "", nil, false
	}

	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		init := p.Initializer()
		switch p.Name().Text() {
		case "auth":
			if v := tsutil.GetPropertyValue(obj, "auth").Bool; v != nil {
				meta.set("auth", *v)
			}
		case "commands":
			if ast.IsObjectLiteralExpression(init) {
				meta.set("commands", s.processCLICommands(init, program))
			}
		case "options":
			if ast.IsObjectLiteralExpression(init) {
				meta.set("options", s.processCLIOptions(init, ""))
			}
		case "render":
			id := s.extractFunctionName(init).pikkuFuncId
			if isTempId(id) {
				id = makeContextBasedId("cli-render", program.name)
			}
			meta.set("defaultRenderName", id)
		}
	}
	return program.name, meta, true
}

func cliPropertyName(p *ast.Node) (string, bool) {
	n := p.Name()
	if ast.IsIdentifier(n) || ast.IsStringLiteral(n) {
		return n.Text(), true
	}
	return "", false
}

// processCLICommands is add-cli.ts processCommands.
func (s *Context) processCLICommands(obj *ast.Node, program cliProgram) *state.Record[state.Raw] {
	commands := state.NewRecord[state.Raw]()
	defaultCommand := ""
	hasDefault := false
	for _, p := range obj.Properties() {
		if ast.IsSpreadAssignment(p) {
			target := p.Expression()
			if ast.IsIdentifier(target) {
				target = s.resolveIdentifier(target, "defineCLICommands")
			}
			if target != nil && ast.IsObjectLiteralExpression(target) {
				spread := s.processCLICommands(target, program)
				spread.Each(func(k string, v state.Raw) { commands.Set(k, v) })
			} else if contract, ok := resolveRefContract(p.Expression(), "refCLI", &s.State.ExportedContracts.AddonCLI); ok {
				if rec, ok := rawObject(contract); ok {
					rec.Each(func(k string, v state.Raw) { commands.Set(k, v) })
				}
			}
			continue
		}
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		name, ok := cliPropertyName(p)
		if !ok {
			continue
		}
		cmd := s.processCLICommand(name, p.Initializer(), program, nil)
		if cmd == nil {
			continue
		}
		commands.Set(name, cmd.raw())
		if v, ok := cmd.rec.Get("isDefault"); ok && string(v) == "true" {
			if hasDefault {
				sf := ast.GetSourceFileOfNode(p)
				line, char := lineAndCharacter(p)
				// TS throws here, which aborts inspection.
				s.Log.Error(fmt.Sprintf("Multiple default commands found in CLI program \"%s\" at %s:%d:%d.\n", program.name, sf.FileName(), line+1, char+1) +
					fmt.Sprintf("Commands \"%s\" and \"%s\" are both marked as default.\n", defaultCommand, name) +
					"Only one command can be marked as default per program.")
				return commands
			}
			defaultCommand, hasDefault = name, true
		}
	}
	return commands
}

func newCLICommand(pikkuFuncId string) *jsObject {
	cmd := &jsObject{}
	cmd.set("pikkuFuncId", pikkuFuncId)
	cmd.set("positionals", []cliPositional{})
	cmd.set("options", state.NewRecord[state.Raw]())
	return cmd
}

// processCLICommand is add-cli.ts processCommand.
func (s *Context) processCLICommand(name string, node *ast.Node, program cliProgram, parentPath []string) *jsObject {
	fullPath := append(append([]string{}, parentPath...), name)

	if ast.IsIdentifier(node) || ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) {
		id := s.extractFunctionName(node).pikkuFuncId
		if isTempId(id) {
			id = makeContextBasedId("cli", append([]string{program.name}, fullPath...)...)
		}
		return newCLICommand(id)
	}
	if ast.IsCallExpression(node) {
		if ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "pikkuCLICommand" {
			if a := node.Arguments(); len(a) > 0 && ast.IsObjectLiteralExpression(a[0]) {
				return s.processCLICommand(name, a[0], program, parentPath)
			}
		}
		return nil
	}
	if !ast.IsObjectLiteralExpression(node) {
		return nil
	}

	meta := newCLICommand("")
	pikkuFuncId := ""
	var optionsNode *ast.Node
	var tags []string

	for _, p := range node.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		init := p.Initializer()
		switch p.Name().Text() {
		case "func":
			if ast.IsCallExpression(init) && ast.IsIdentifier(init.Expression()) && init.Expression().Text() == "ref" {
				a := init.Arguments()
				if len(a) == 0 || !ast.IsStringLiteral(a[0]) {
					// TS throws here, which aborts inspection.
					s.Log.Error("ref() call requires a string literal argument")
					return nil
				}
				pikkuFuncId = a[0].Text()
				ns := ""
				if i := strings.Index(pikkuFuncId, ":"); i != -1 {
					ns = pikkuFuncId[:i]
				}
				if ns != "" && s.addons[ns] == nil {
					s.Log.Error(fmt.Sprintf("Unknown addon namespace \"%s\" in \"%s\": no matching wireAddonDeclarations entry found", ns, pikkuFuncId))
					return nil
				}
				meta.set("pikkuFuncId", pikkuFuncId)
				if ns != "" {
					meta.set("packageName", s.addons[ns].pkg)
				}
			} else {
				extracted, isHelper := s.extractFunctionNameWithHelpers(init)
				pikkuFuncId = extracted.pikkuFuncId
				if isTempId(pikkuFuncId) {
					pikkuFuncId = makeContextBasedId("cli", append([]string{program.name}, fullPath...)...)
					if isHelper && s.State.Functions.Meta.At(pikkuFuncId) == nil {
						s.State.Functions.Meta.Set(pikkuFuncId, &FunctionMeta{
							PikkuFuncId: pikkuFuncId, FunctionType: "helper", Name: strings.Join(fullPath, " "),
							Services: ServicesMeta{Services: []string{}}, Inputs: []string{}, Outputs: []string{},
							Inline: true,
						})
					}
					s.ensureInlineWiringFunction(pikkuFuncId, strings.Join(fullPath, " "), init)
				}
				meta.set("pikkuFuncId", pikkuFuncId)
				if ast.IsIdentifier(init) {
					if pkg := s.resolveAddonName(init); pkg != "" {
						meta.set("packageName", pkg)
					}
				}
			}
		case "options":
			if ast.IsObjectLiteralExpression(init) {
				optionsNode = init
			}
		case "tags":
			tags = tsutil.GetPropertyValue(node, "tags").Strs
		}
	}

	allTags := append(append([]string{}, program.tags...), tags...)
	var tagArg []string
	if len(allTags) > 0 {
		tagArg = allTags
	}
	middleware := s.resolveMiddleware(node, tagArg)
	if middleware != nil {
		meta.set("middleware", middleware)
	}
	if len(allTags) > 0 {
		meta.set("tags", allTags)
	}

	for _, p := range node.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		init := p.Initializer()
		switch p.Name().Text() {
		case "parameters":
			if ast.IsStringLiteral(init) {
				positionals, err := parseCommandPattern(init.Text())
				if err != nil {
					// TS throws here, which aborts inspection.
					s.Log.Error(err.Error())
					return nil
				}
				meta.set("parameters", init.Text())
				meta.set("positionals", positionals)
			}
		case "description":
			if ast.IsStringLiteral(init) {
				meta.set("description", init.Text())
			}
		case "render":
			id := s.extractFunctionName(init).pikkuFuncId
			if isTempId(id) {
				id = makeContextBasedId("cli-render", append([]string{program.name}, fullPath...)...)
			}
			meta.set("renderName", id)
		case "options":
			if optionsNode != nil {
				opts, ok := s.processCLIOptionsChecked(optionsNode, pikkuFuncId)
				if !ok {
					return nil
				}
				meta.set("options", opts)
			}
		case "subcommands":
			subcommands := state.NewRecord[state.Raw]()
			var collect func(n *ast.Node)
			collect = func(n *ast.Node) {
				if contract, ok := resolveRefContract(n, "refCLI", &s.State.ExportedContracts.AddonCLI); ok {
					if rec, ok := rawObject(contract); ok {
						rec.Each(func(k string, v state.Raw) { subcommands.Set(k, v) })
					}
					return
				}
				target := n
				if ast.IsIdentifier(n) {
					target = s.resolveIdentifier(n, "defineCLICommands")
				}
				if target == nil || !ast.IsObjectLiteralExpression(target) {
					return
				}
				for _, sp := range target.Properties() {
					if ast.IsSpreadAssignment(sp) {
						collect(sp.Expression())
						continue
					}
					if !ast.IsPropertyAssignment(sp) {
						continue
					}
					subName, ok := cliPropertyName(sp)
					if !ok {
						continue
					}
					if sub := s.processCLICommand(subName, sp.Initializer(), program, fullPath); sub != nil {
						subcommands.Set(subName, sub.raw())
					}
				}
			}
			collect(init)
			meta.set("subcommands", subcommands)
		case "isDefault":
			switch init.Kind {
			case ast.KindTrueKeyword:
				meta.set("isDefault", true)
			case ast.KindFalseKeyword:
				meta.set("isDefault", false)
			}
		}
	}

	if pikkuFuncId != "" && !s.validateAuthSessionless(node, pikkuFuncId, fmt.Sprintf("CLI command '%s'", name), nil) {
		return nil
	}
	s.State.ServiceAggregation.UsedFunctions.Add(pikkuFuncId)
	s.addUsedMiddleware(middleware)
	return meta
}

// processCLIOptions is add-cli.ts processOptions for program-level options
// (no function to derive choices from).
func (s *Context) processCLIOptions(obj *ast.Node, pikkuFuncId string) *state.Record[state.Raw] {
	opts, _ := s.processCLIOptionsChecked(obj, pikkuFuncId)
	return opts
}

// processCLIOptionsChecked is add-cli.ts processOptions; ok is false where TS
// throws (manual choices outside the type's).
func (s *Context) processCLIOptionsChecked(obj *ast.Node, pikkuFuncId string) (*state.Record[state.Raw], bool) {
	options := state.NewRecord[state.Raw]()
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		optionName, ok := cliPropertyName(p)
		if !ok || !ast.IsObjectLiteralExpression(p.Initializer()) {
			continue
		}
		option := &jsObject{}
		var manualChoices []string
		hasManual := false
		for _, op := range p.Initializer().Properties() {
			if !ast.IsPropertyAssignment(op) || !ast.IsIdentifier(op.Name()) {
				continue
			}
			init := op.Initializer()
			switch key := op.Name().Text(); key {
			case "description", "short", "type":
				if ast.IsStringLiteral(init) {
					option.set(key, init.Text())
				}
			case "default":
				switch {
				case ast.IsStringLiteral(init):
					option.set("default", init.Text())
				case ast.IsNumericLiteral(init):
					f, _ := strconv.ParseFloat(init.Text(), 64)
					option.set("default", f)
				case init.Kind == ast.KindTrueKeyword:
					option.set("default", true)
				case init.Kind == ast.KindFalseKeyword:
					option.set("default", false)
				}
			case "choices":
				if ast.IsArrayLiteralExpression(init) {
					hasManual = true
					manualChoices = []string{}
					for _, e := range init.Elements() {
						if ast.IsStringLiteral(e) {
							manualChoices = append(manualChoices, e.Text())
						}
					}
				}
			}
		}

		var derived []string
		if pikkuFuncId != "" {
			if ts := s.typesLookup[pikkuFuncId]; len(ts) > 0 {
				derived = s.enumFromPropertyType(ts[0], optionName)
			}
			if derived == nil {
				derived = s.enumFromJsonSchema(pikkuFuncId, optionName)
			}
		}
		if derived == nil {
			derived = s.enumFromConfigType(optionName)
		}

		switch {
		case hasManual && derived != nil:
			var invalid []string
			for _, c := range manualChoices {
				if !containsString(derived, c) {
					invalid = append(invalid, c)
				}
			}
			if len(invalid) > 0 {
				sf := ast.GetSourceFileOfNode(obj)
				line, char := lineAndCharacter(p)
				// TS throws here, which aborts inspection.
				s.Log.Error(fmt.Sprintf("Invalid choices for option \"%s\" at %s:%d:%d.\n", optionName, sf.FileName(), line+1, char+1) +
					fmt.Sprintf("The following choices are not valid according to the type: %s.\n", strings.Join(invalid, ", ")) +
					fmt.Sprintf("Valid choices from type: %s.", strings.Join(derived, ", ")))
				return options, false
			}
			option.set("choices", manualChoices)
		case hasManual:
			option.set("choices", manualChoices)
		case derived != nil:
			option.set("choices", derived)
		}
		options.Set(optionName, option.raw())
	}
	return options, true
}

func containsString(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// enumFromPropertyType is add-cli.ts extractEnumFromPropertyType.
func (s *Context) enumFromPropertyType(t *checker.Type, propertyName string) []string {
	prop := s.Checker.GetPropertyOfType(t, propertyName)
	if prop == nil || prop.ValueDeclaration == nil {
		// TS asks for the type at an undefined location, which is the error type.
		return nil
	}
	pt := s.Checker.GetTypeOfSymbolAtLocation(prop, prop.ValueDeclaration)
	var values []string
	switch {
	case pt.IsUnion():
		for _, m := range pt.Types() {
			switch {
			case m.Flags()&checker.TypeFlagsStringLiteral != 0:
				if v, ok := m.AsLiteralType().Value().(string); ok {
					values = append(values, v)
				}
			case m.Flags()&checker.TypeFlagsEnumLiteral != 0:
				if v, ok := m.AsLiteralType().Value().(string); ok {
					values = append(values, v)
				} else if sym := m.Symbol(); sym != nil && sym.Name != "" {
					values = append(values, tsutil.SymbolName(sym))
				}
			}
		}
	case pt.Flags()&checker.TypeFlagsEnum != 0:
		if sym := pt.Symbol(); sym != nil {
			for _, member := range enumMembersInOrder(sym) {
				if member.ValueDeclaration == nil {
					continue
				}
				mt := s.Checker.GetTypeOfSymbolAtLocation(member, member.ValueDeclaration)
				if mt.Flags()&(checker.TypeFlagsStringLiteral|checker.TypeFlagsNumberLiteral|checker.TypeFlagsEnumLiteral) != 0 {
					if v, ok := mt.AsLiteralType().Value().(string); ok {
						values = append(values, v)
					}
				}
			}
		}
	case pt.Flags()&checker.TypeFlagsEnumLiteral != 0:
		if v, ok := pt.AsLiteralType().Value().(string); ok {
			values = append(values, v)
		}
	}
	if len(values) == 0 {
		return nil
	}
	return values
}

// enumMembersInOrder lists an enum's member symbols in declaration order,
// which is the order TS iterates `symbol.exports` in.
func enumMembersInOrder(sym *ast.Symbol) []*ast.Symbol {
	var out []*ast.Symbol
	seen := map[*ast.Symbol]bool{}
	for _, d := range sym.Declarations {
		if !ast.IsEnumDeclaration(d) {
			continue
		}
		for _, m := range d.Members() {
			if ms := m.Symbol(); ms != nil && !seen[ms] {
				seen[ms] = true
				out = append(out, ms)
			}
		}
	}
	return out
}

// enumFromJsonSchema is add-cli.ts extractEnumFromJsonSchema.
func (s *Context) enumFromJsonSchema(pikkuFuncId, propertyName string) []string {
	fn := s.resolveFunctionMeta(pikkuFuncId)
	if fn == nil || fn.InputSchemaName == nil || *fn.InputSchemaName == "" {
		return nil
	}
	raw, ok := s.State.Schemas.Get(*fn.InputSchemaName)
	if !ok || len(raw) == 0 {
		return nil
	}
	var schema struct {
		Properties map[string]struct {
			Enum  []any `json:"enum"`
			Type  any   `json:"type"`
			Items *struct {
				Enum []any `json:"enum"`
			} `json:"items"`
		} `json:"properties"`
	}
	if raw.Decode(&schema) != nil {
		return nil
	}
	prop, ok := schema.Properties[propertyName]
	if !ok {
		return nil
	}
	stringsOf := func(vs []any) []string {
		var out []string
		for _, v := range vs {
			if str, ok := v.(string); ok {
				out = append(out, str)
			}
		}
		return out
	}
	if out := stringsOf(prop.Enum); len(out) > 0 {
		return out
	}
	if prop.Type == "array" && prop.Items != nil {
		if out := stringsOf(prop.Items.Enum); len(out) > 0 {
			return out
		}
	}
	return nil
}

// enumFromConfigType is add-cli.ts extractEnumFromConfigType: the property
// on the project's CoreConfig extension (resolveCoreType over the config
// import map).
func (s *Context) enumFromConfigType(propertyName string) []string {
	var configSym *ast.Symbol
	s.State.ConfigTypeImportMap.Each(func(_ string, entries []state.NameAndType) {
		if configSym != nil {
			return
		}
		for _, e := range entries {
			if e.Type == nil {
				continue
			}
			for _, ct := range s.coreTypes {
				if ct.name == *e.Type && ct.sym != nil {
					configSym = ct.sym
					return
				}
			}
		}
	})
	if configSym == nil {
		if !s.cliConfigTypeWarned {
			s.cliConfigTypeWarned = true
			s.Log.Warn("Could not find Config type in typesLookup. " +
				"Make sure you have a Config interface extending CoreConfig in your codebase.")
		}
		return nil
	}
	return s.enumFromPropertyType(s.Checker.GetDeclaredTypeOfSymbol(configSym), propertyName)
}

// parseCommandPattern is add-cli.ts parseCommandPattern.
func parseCommandPattern(pattern string) ([]cliPositional, error) {
	positionals := []cliPositional{}
	for _, part := range strings.Split(pattern, " ") {
		if strings.TrimSpace(part) == "" {
			continue
		}
		var name string
		var required bool
		switch {
		case strings.HasPrefix(part, "<") && strings.HasSuffix(part, ">") && len(part) >= 2:
			name, required = part[1:len(part)-1], true
		case strings.HasPrefix(part, "[") && strings.HasSuffix(part, "]") && len(part) >= 2:
			name, required = part[1:len(part)-1], false
		default:
			return nil, fmt.Errorf("Invalid parameters pattern '%s': found literal word '%s'. "+
				"Parameters should only contain <required> or [optional] arguments. "+
				"Example: \"<env> [region]\" or \"<files...>\"", pattern, part)
		}
		if strings.HasSuffix(name, "...") {
			positionals = append(positionals, cliPositional{Name: name[:len(name)-3], Required: required, Variadic: true})
		} else {
			positionals = append(positionals, cliPositional{Name: name, Required: required})
		}
	}
	return positionals, nil
}

// servicesOfFunction is utils/extract-services.ts extractServicesFromFunction.
func servicesOfFunction(fn *ast.Node) cliServices {
	out := cliServices{Optimized: true, Services: []string{}}
	p := tsutil.ParamAt(fn, 0)
	if p == nil {
		return out
	}
	if ast.IsObjectBindingPattern(p.Name()) {
		out.Services = append(out.Services, tsutil.BindingNames(p)...)
	} else if ast.IsIdentifier(p.Name()) && !strings.HasPrefix(p.Name().Text(), "_") {
		out.Optimized = false
	}
	return out
}

// addCLIRenderers is add-cli.ts addCLIRenderers.
func (s *Context) addCLIRenderers(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != "pikkuCLIRender" {
		return
	}
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	r := s.extractFunctionName(node)
	filePath := ast.GetSourceFileOfNode(node).FileName()
	services := cliServices{Optimized: true, Services: []string{}}
	if fn := args[0]; ast.IsArrowFunction(fn) || ast.IsFunctionExpression(fn) {
		services = servicesOfFunction(fn)
	}
	s.State.CLI.Meta.Renderers.Set(r.pikkuFuncId, state.RawOf(cliRendererMeta{
		Name: r.pikkuFuncId, ExportedName: r.exportedName, Services: services, FilePath: filePath,
	}))
	if r.exportedName != "" {
		s.State.CLI.Files.Add(filePath)
	}
}

// updateChannelAndCLIReferences is the channels and CLI part of
// resolve-versions.ts updateWiringReferences.
func (s *Context) updateChannelAndCLIReferences(oldId, newId string) {
	for _, name := range s.State.Channels.Meta.Keys() {
		rec, ok := rawObject(s.State.Channels.Meta.At(name))
		if !ok {
			continue
		}
		for _, slot := range []string{"connect", "disconnect", "message"} {
			if v, ok := rec.Get(slot); ok {
				rec.Set(slot, rewriteFuncIdRaw(v, oldId, newId))
			}
		}
		if mw, ok := rec.Get("messageWirings"); ok {
			if channels, ok := rawObject(mw); ok {
				for _, ck := range channels.Keys() {
					routes, ok := rawObject(channels.At(ck))
					if !ok {
						continue
					}
					for _, rk := range routes.Keys() {
						routes.Set(rk, rewriteFuncIdRaw(routes.At(rk), oldId, newId))
					}
					channels.Set(ck, state.RawOf(routes))
				}
				rec.Set("messageWirings", state.RawOf(channels))
			}
		}
		s.State.Channels.Meta.Set(name, state.RawOf(rec))
	}

	var updateCommands func(r state.Raw) state.Raw
	updateCommands = func(r state.Raw) state.Raw {
		cmds, ok := rawObject(r)
		if !ok {
			return r
		}
		for _, k := range cmds.Keys() {
			cmd := rewriteFuncIdRaw(cmds.At(k), oldId, newId)
			if rec, ok := rawObject(cmd); ok {
				if sub, ok := rec.Get("subcommands"); ok {
					rec.Set("subcommands", updateCommands(sub))
					cmd = state.RawOf(rec)
				}
			}
			cmds.Set(k, cmd)
		}
		return state.RawOf(cmds)
	}
	for _, name := range s.State.CLI.Meta.Programs.Keys() {
		rec, ok := rawObject(s.State.CLI.Meta.Programs.At(name))
		if !ok {
			continue
		}
		if c, ok := rec.Get("commands"); ok {
			rec.Set("commands", updateCommands(c))
		}
		s.State.CLI.Meta.Programs.Set(name, state.RawOf(rec))
	}
}
