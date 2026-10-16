package visit

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-middleware.ts.

func init() {
	Register(Visitor{Name: "addMiddleware", Phase: PhaseSetup, Order: OrderAddMiddleware, Visit: (*Context).addMiddleware})
}

// recordMiddlewareGroup keeps every registration under one pattern or tag;
// the first stays primary.
func recordMiddlewareGroup(groups *state.Map[*state.MiddlewareGroupMeta], key string, group *state.MiddlewareGroupMeta) {
	existing, ok := groups.Get(key)
	if !ok {
		groups.Set(key, group)
		return
	}
	if existing.SourceFile == group.SourceFile && existing.Position == group.Position {
		return
	}
	for _, r := range existing.AdditionalRegistrations {
		if r.SourceFile == group.SourceFile && r.Position == group.Position {
			return
		}
	}
	existing.AdditionalRegistrations = append(existing.AdditionalRegistrations, state.MiddlewareRegistration{
		ExportName: group.ExportName, SourceFile: group.SourceFile, Position: group.Position, IsFactory: group.IsFactory,
	})
	existing.Count += group.Count
	existing.InstanceIds = append(append(state.Strings{}, existing.InstanceIds...), group.InstanceIds...)
	existing.Services = state.ServicesMeta{Optimized: false, Services: tsutil.Dedupe(append(append([]string{}, existing.Services.Services...), group.Services.Services...))}
}

type instanceEntry struct {
	definitionId  string
	isFactoryCall bool
}

// registerMiddlewareInstances gives each entry of one add*Middleware call an
// id unique across the inspection, and is idempotent per call site.
func registerMiddlewareInstances(instances *state.Record[*state.MiddlewareInstance], groupType, groupKey string, entries []instanceEntry, sourceFile string, position int) []string {
	prefix := makeContextBasedId(groupType, groupKey) + ":"
	var already []string
	instances.Each(func(id string, inst *state.MiddlewareInstance) {
		if inst.SourceFile == sourceFile && inst.Position == position && strings.HasPrefix(id, prefix) {
			already = append(already, id)
		}
	})
	if len(already) == len(entries) {
		if already == nil {
			return []string{}
		}
		return already
	}
	ids := []string{}
	next := 0
	for _, e := range entries {
		id := makeContextBasedId(groupType, groupKey, strconv.Itoa(next))
		for instances.Has(id) {
			next++
			id = makeContextBasedId(groupType, groupKey, strconv.Itoa(next))
		}
		instances.Set(id, &state.MiddlewareInstance{DefinitionId: e.definitionId, SourceFile: sourceFile, Position: position, IsFactoryCall: e.isFactoryCall})
		ids = append(ids, id)
		next++
	}
	return ids
}

func renameTempDefinitions(defs *state.Record[*state.MiddlewareDefinition], definitionIds []string, groupType, groupKey string) {
	var temps []int
	for i, id := range definitionIds {
		if strings.HasPrefix(id, tempPrefix) {
			temps = append(temps, i)
		}
	}
	for _, idx := range temps {
		oldId := definitionIds[idx]
		newId := makeContextBasedId(groupType, groupKey)
		if len(temps) != 1 {
			newId = makeContextBasedId(groupType, groupKey, strconv.Itoa(idx))
		}
		if existing := defs.At(oldId); existing != nil {
			defs.Delete(oldId)
			defs.Set(newId, existing)
		}
		definitionIds[idx] = newId
	}
}

func (s *Context) addMiddleware(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	switch node.Expression().Text() {
	case "pikkuMiddleware":
		s.addPikkuMiddleware(node)
	case "pikkuMiddlewareFactory":
		s.addPikkuMiddlewareFactory(node)
	case "addTagMiddleware":
		s.addMiddlewareGroup(node, groupKind{fn: "addTagMiddleware", groupType: "tag", keyWord: "tag", label: "Middleware group", logLabel: "tag middleware group"})
	case "addGlobalMiddleware":
		s.addGlobalMiddleware(node)
	case "addHTTPMiddleware":
		s.addMiddlewareGroup(node, groupKind{fn: "addHTTPMiddleware", groupType: "http", keyWord: "pattern", label: "HTTP middleware group", logLabel: "HTTP route middleware group"})
	case "pikkuChannelMiddleware":
		s.addPikkuChannelMiddleware(node)
	case "pikkuChannelMiddlewareFactory":
		s.addPikkuChannelMiddlewareFactory(node)
	case "pikkuAgentMiddleware":
		s.addPikkuAgentMiddleware(node)
	case "addChannelMiddleware":
		s.addMiddlewareGroup(node, groupKind{fn: "addChannelMiddleware", groupType: "tag", keyWord: "tag", label: "Channel middleware group", logLabel: "tag channel middleware group", channel: true})
	}
}

// nameAndDescription reads the object form's `name` / `description`.
func nameAndDescription(arg *ast.Node) (name, description *string) {
	return stringProp(arg, "name"), stringProp(arg, "description")
}

func describe(name, description *string) string {
	out := ""
	if name != nil && *name != "" {
		out += " (name: " + *name + ")"
	}
	if description != nil && *description != "" {
		out += " (description: " + *description + ")"
	}
	return out
}

func (s *Context) addPikkuMiddleware(node *ast.Node) {
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
			s.Log.Error("• pikkuMiddleware object missing required 'func' property.")
			return
		}
		handler = fn
	case tsutil.IsFunctionLike(arg):
		handler = arg
	default:
		s.Log.Error("• Handler for pikkuMiddleware is not a function.")
		return
	}
	services := servicesOf(handler)
	wires := extractUsedWires(handler, 1)
	id, exportedName, ok := s.definitionId(node, "pikkuMiddleware", "myMiddleware")
	if !ok {
		return
	}
	s.State.Middleware.Definitions.Set(id, &state.MiddlewareDefinition{
		Services: services, Wires: wiresOrNil(wires), SourceFile: fileOf(node), Position: startOf(node),
		ExportedName: nullableString(exportedName), Name: name, Description: description,
	})
	s.Log.Debugf("• Found middleware with services: %s%s", joinServices(services), describe(name, description))
}

func (s *Context) addPikkuMiddlewareFactory(node *ast.Node) {
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	factory := args[0]
	if !tsutil.IsFunctionLike(factory) {
		s.Log.Error("• Handler for pikkuMiddlewareFactory is not a function.")
		return
	}
	services := state.ServicesMeta{Optimized: false, Services: []string{}}
	wires := WiresMeta{Optimized: true, Wires: []string{}}
	var name, description *string
	if call := findCall(factory, "pikkuMiddleware"); call != nil && len(call.Arguments()) > 0 {
		mwArg := call.Arguments()[0]
		if ast.IsObjectLiteralExpression(mwArg) {
			name, description = nameAndDescription(mwArg)
			if fn := s.getPropertyAssignmentInitializer(mwArg, "func", true); tsutil.IsFunctionLike(fn) {
				services = servicesOf(fn)
				wires = extractUsedWires(fn, 1)
			}
		} else if tsutil.IsFunctionLike(mwArg) {
			services = servicesOf(mwArg)
			wires = extractUsedWires(mwArg, 1)
		}
	} else if body := factory.Body(); tsutil.IsFunctionLike(body) {
		services = servicesOf(body)
		wires = extractUsedWires(body, 1)
	}
	id, exportedName, ok := s.definitionId(node, "pikkuMiddlewareFactory", "myMiddleware")
	if !ok {
		return
	}
	s.State.Middleware.Definitions.Set(id, &state.MiddlewareDefinition{
		Services: services, Wires: wiresOrNil(wires), SourceFile: fileOf(node), Position: startOf(node),
		ExportedName: nullableString(exportedName), Factory: tsutil.BoolPtr(true), Name: name, Description: description,
	})
	s.Log.Debugf("• Found middleware factory with services: %s%s", joinServices(services), describe(name, description))
}

type groupKind struct {
	fn        string // addTagMiddleware / addHTTPMiddleware / addChannelMiddleware
	groupType string // instance id prefix: tag / http
	keyWord   string // tag / pattern, as the messages call the first argument
	label     string // the not-wrapped-in-a-factory warning's subject
	logLabel  string
	channel   bool
}

// addMiddlewareGroup handles addTagMiddleware, addHTTPMiddleware and
// addChannelMiddleware, which differ only in where they record.
func (s *Context) addMiddlewareGroup(node *ast.Node, k groupKind) {
	args := node.Arguments()
	if len(args) < 2 {
		return
	}
	keyArg, arrayArg := args[0], args[1]
	key := ""
	if ast.IsStringLiteral(keyArg) {
		key = keyArg.Text()
	}
	if key == "" {
		s.Log.Warn(fmt.Sprintf("• %s call without valid %s string", k.fn, k.keyWord))
		return
	}
	if !ast.IsArrayLiteralExpression(arrayArg) {
		s.Log.Error(fmt.Sprintf("• %s('%s', ...) must have a literal array as second argument", k.fn, key))
		return
	}
	refs := s.extractMiddlewareRefs(arrayArg)

	defs, instances, groups := &s.State.Middleware.Definitions, &s.State.Middleware.Instances, &s.State.Middleware.TagMiddleware
	switch {
	case k.channel:
		defs, instances, groups = &s.State.ChannelMiddleware.Definitions, &s.State.ChannelMiddleware.Instances, &s.State.ChannelMiddleware.TagMiddleware
		if len(refs) == 0 {
			s.Log.Warn(fmt.Sprintf("• addChannelMiddleware('%s', ...) has empty middleware array", key))
			return
		}
	case k.groupType == "http":
		groups = &s.State.HTTP.RouteMiddleware
	}

	definitionIds := make([]string, len(refs))
	for i, r := range refs {
		definitionIds[i] = r.definitionId
	}
	if len(definitionIds) > 0 {
		renameTempDefinitions(defs, definitionIds, k.groupType, key)
	}

	sourceFile := fileOf(node)
	position := startOf(node)
	entries := make([]instanceEntry, len(refs))
	for i, r := range refs {
		entries[i] = instanceEntry{definitionId: definitionIds[i], isFactoryCall: r.isFactoryCall}
	}
	instanceIds := registerMiddlewareInstances(instances, k.groupType, key, entries, sourceFile, position)

	allServices := []string{}
	for _, id := range definitionIds {
		if def := defs.At(id); def != nil {
			allServices = append(allServices, def.Services.Services...)
		}
	}
	allServices = tsutil.Dedupe(allServices)

	isFactory := false
	exportedName := ""
	if parent := node.Parent; parent != nil && ast.IsArrowFunction(parent) && len(parent.Parameters()) == 0 {
		isFactory = true
		if ap := parent.Parent; ap != nil && ast.IsVariableDeclaration(ap) && ast.IsIdentifier(ap.Name()) && s.isNamedExport(ap) {
			exportedName = ap.Name().Text()
		}
	}
	if !isFactory {
		exportedName = s.extractFunctionName(node).exportedName
	}
	if !isFactory && exportedName != "" {
		s.Log.Warn(fmt.Sprintf("• %s '%s' for %s '%s' is not wrapped in a factory function. "+
			"For tree-shaking, use: export const %s = () => %s('%s', [...])", k.label, exportedName, k.keyWord, key, exportedName, k.fn, key))
	}

	recordMiddlewareGroup(groups, key, &state.MiddlewareGroupMeta{
		ExportName: nullableString(exportedName), SourceFile: sourceFile, Position: position,
		Services:    state.ServicesMeta{Optimized: false, Services: allServices},
		Count:       len(refs),
		InstanceIds: instanceIds,
		IsFactory:   isFactory,
	})
	if k.groupType == "http" {
		s.State.HTTP.Files.Add(sourceFile)
	}
	mode := "direct"
	if isFactory {
		mode = "factory"
	}
	s.Log.Debugf("• Found %s: %s -> [%s] (%s)", k.logLabel, key, strings.Join(instanceIds, ", "), mode)
}

func (s *Context) addGlobalMiddleware(node *ast.Node) {
	args := node.Arguments()
	if len(args) == 0 || !ast.IsArrayLiteralExpression(args[0]) {
		s.Log.Error("• addGlobalMiddleware(...) must have a literal array as its only argument")
		return
	}
	refs := s.extractMiddlewareRefs(args[0])
	definitionIds := make([]string, len(refs))
	for i, r := range refs {
		definitionIds[i] = r.definitionId
	}
	if len(definitionIds) > 0 {
		renameTempDefinitions(&s.State.Middleware.Definitions, definitionIds, "global", "middleware")
	}
	sourceFile := fileOf(node)
	entries := make([]instanceEntry, len(refs))
	for i, r := range refs {
		entries[i] = instanceEntry{definitionId: definitionIds[i], isFactoryCall: r.isFactoryCall}
	}
	registerMiddlewareInstances(&s.State.Middleware.Instances, "global", "middleware", entries, sourceFile, startOf(node))
	s.State.Middleware.GlobalFiles.Add(sourceFile)
	s.State.HTTP.Files.Add(sourceFile)
	s.Log.Debugf("• Found global middleware group with %d entries", len(refs))
}

func (s *Context) addPikkuChannelMiddleware(node *ast.Node) {
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	if !tsutil.IsFunctionLike(args[0]) {
		s.Log.Error("• Handler for pikkuChannelMiddleware is not a function.")
		return
	}
	services := servicesOf(args[0])
	id, exportedName, ok := s.definitionId(node, "pikkuChannelMiddleware", "myMiddleware")
	if !ok {
		return
	}
	s.State.ChannelMiddleware.Definitions.Set(id, &state.MiddlewareDefinition{
		Services: services, SourceFile: fileOf(node), Position: startOf(node), ExportedName: nullableString(exportedName),
	})
	s.Log.Debugf("• Found channel middleware with services: %s", joinServices(services))
}

func (s *Context) addPikkuChannelMiddlewareFactory(node *ast.Node) {
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	factory := args[0]
	if !tsutil.IsFunctionLike(factory) {
		s.Log.Error("• Handler for pikkuChannelMiddlewareFactory is not a function.")
		return
	}
	services := state.ServicesMeta{Optimized: false, Services: []string{}}
	if call := findCall(factory, "pikkuChannelMiddleware"); call != nil && len(call.Arguments()) > 0 {
		if h := call.Arguments()[0]; tsutil.IsFunctionLike(h) {
			services = servicesOf(h)
		}
	} else if body := factory.Body(); tsutil.IsFunctionLike(body) {
		services = servicesOf(body)
	}
	id, exportedName, ok := s.definitionId(node, "pikkuChannelMiddlewareFactory", "myMiddleware")
	if !ok {
		return
	}
	s.State.ChannelMiddleware.Definitions.Set(id, &state.MiddlewareDefinition{
		Services: services, SourceFile: fileOf(node), Position: startOf(node), ExportedName: nullableString(exportedName),
		Factory: tsutil.BoolPtr(true),
	})
	s.Log.Debugf("• Found channel middleware factory with services: %s", joinServices(services))
}

func (s *Context) addPikkuAgentMiddleware(node *ast.Node) {
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	arg := args[0]
	if !ast.IsObjectLiteralExpression(arg) {
		s.Log.Error("• pikkuAgentMiddleware() requires an object literal argument.")
		return
	}
	all := []string{}
	for _, p := range arg.Properties() {
		if ast.IsPropertyAssignment(p) && tsutil.IsFunctionLike(p.Initializer()) {
			all = append(all, servicesOf(p.Initializer()).Services...)
		}
	}
	all = tsutil.Dedupe(all)
	services := state.ServicesMeta{Optimized: len(all) > 0, Services: all}
	id, exportedName, ok := s.definitionId(node, "pikkuAgentMiddleware", "myMiddleware")
	if !ok {
		return
	}
	s.State.AgentMiddleware.Definitions.Set(id, &state.MiddlewareDefinition{
		Services: services, SourceFile: fileOf(node), Position: startOf(node), ExportedName: nullableString(exportedName),
	})
	s.Log.Debugf("• Found AI middleware with services: %s", joinServices(services))
}
