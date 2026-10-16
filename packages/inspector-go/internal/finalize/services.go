package finalize

import (
	"encoding/json"
	"regexp"
	"slices"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Ports of the service-aggregation half of utils/post-process.ts.

// authHandlerFuncID is inspector-constants.ts AUTH_HANDLER_FUNC_ID.
const authHandlerFuncID = "authHandler"

// stampAuthHandlerServices copies the services add-auth inspected from the
// pikkuBetterAuth source onto the generated auth handler's meta, whose own
// func is an opaque property access. Runs before aggregateRequiredServices.
func stampAuthHandlerServices(st *state.State) {
	def := authDefinition(st)
	if def == nil {
		return
	}
	handler, ok := st.Functions.Meta.Get(authHandlerFuncID)
	if !ok || handler == nil {
		return
	}
	services := []string{}
	if def.Services != nil && def.Services.Services != nil {
		services = append(services, (*def.Services.Services)...)
	}
	optimized := def.Services != nil && def.Services.Optimized
	handler.Services = state.ServicesMeta{Optimized: optimized, Services: services}
}

type authDef struct {
	Services *servicesMeta `json:"services"`
}

// authDefinition is state.auth.definition, nil when it is null.
func authDefinition(st *state.State) *authDef {
	if st.Auth.Definition == nil {
		return nil
	}
	d := decode[authDef](encode(st.Auth.Definition))
	return &d
}

// extractAllServices applies the SingletonServices / Services names analysis
// resolved (state.serviceTypes); skipped when analysis did not resolve them.
func extractAllServices(st *state.State) {
	resolved := st.ServiceTypes
	if resolved == nil {
		return
	}
	agg := &st.ServiceAggregation
	if resolved.SingletonServices != nil {
		agg.AllSingletonServices = slices.Clone(*resolved.SingletonServices)
		if agg.AllSingletonServices == nil {
			agg.AllSingletonServices = state.Strings{}
		}
	}
	if resolved.Services != nil {
		singleton := map[string]bool{}
		for _, s := range agg.AllSingletonServices {
			singleton[s] = true
		}
		wire := state.Strings{}
		for _, s := range *resolved.Services {
			if !singleton[s] {
				wire = append(wire, s)
			}
		}
		slices.Sort(wire)
		agg.AllWireServices = wire
		wireSet := map[string]bool{}
		for _, s := range wire {
			wireSet[s] = true
		}
		markSingletonServicesOnly(st, wireSet)
	}
}

// markSingletonServicesOnly marks the functions that never read a wire
// service, so the runner can skip createWireServices for them.
func markSingletonServicesOnly(st *state.State, wireServices map[string]bool) {
	st.Functions.Meta.Each(func(_ string, meta *state.FunctionMeta) {
		if meta == nil {
			return
		}
		usesWire := slices.ContainsFunc(meta.Services.Services, func(s string) bool { return wireServices[s] })
		if meta.Services.Optimized && !usesWire {
			t := true
			meta.SingletonServicesOnly = &t
		} else {
			meta.SingletonServicesOnly = nil
		}
	})
}

var internalServices = map[string]bool{"rpc": true, "mcp": true, "channel": true, "userSession": true}

var defaultServices = map[string]bool{"config": true, "logger": true, "variables": true, "schema": true, "secrets": true}

var aggregateHTTPMethods = []string{"get", "post", "put", "patch", "delete", "head", "options"}

// aggregateRequiredServices collects every service the wired functions,
// middleware, permissions and implicit platform features need into
// serviceAggregation.requiredServices.
func aggregateRequiredServices(st *state.State) {
	extractAllServices(st)

	agg := &st.ServiceAggregation
	required := &agg.RequiredServices

	addList := func(services []string) {
		for _, s := range services {
			if !internalServices[s] {
				required.Add(s)
			}
		}
	}
	addRaw := func(services *servicesMeta) {
		if services == nil || services.Services == nil {
			return
		}
		addList(*services.Services)
	}
	expandGroups := func(list []wireRef) {
		for _, item := range list {
			switch {
			case item.Type == "tag":
				if g, ok := st.Middleware.TagMiddleware.Get(item.Tag); ok {
					addRaw(decode[groupMeta](encode(g)).Services)
				}
			case item.Type == "http" && item.Route != nil:
				if g, ok := st.HTTP.RouteMiddleware.Get(*item.Route); ok {
					addRaw(decode[groupMeta](encode(g)).Services)
				}
			}
		}
	}
	expandRawWirings := func(meta state.Record[state.Raw]) {
		meta.Each(func(_ string, r state.Raw) { expandGroups(decode[withMiddleware](r).Middleware) })
	}

	// 1. Services from used functions.
	for _, id := range agg.UsedFunctions.Values() {
		if meta, ok := st.Functions.Meta.Get(id); ok && meta != nil {
			addList(meta.Services.Services)
		}
	}

	// 1b. The auth factory's services, from the definition: on a clean run
	// the generated handler does not exist yet.
	if def := authDefinition(st); def != nil {
		addRaw(def.Services)
	}

	// 2. Used middleware.
	for _, name := range agg.UsedMiddleware.Values() {
		if r, ok := st.Middleware.Definitions.Get(name); ok {
			addRaw(decode[definitionMeta](encode(r)).Services)
		}
	}

	// 3. Used permissions.
	for _, name := range agg.UsedPermissions.Values() {
		if r, ok := st.Permissions.Definitions.Get(name); ok {
			addRaw(decode[definitionMeta](encode(r)).Services)
		}
	}

	// 4. Tag and HTTP-pattern middleware groups the wirings use.
	for _, method := range aggregateHTTPMethods {
		routes, ok := st.HTTP.Meta.Get(method)
		if !ok || routes == nil {
			continue
		}
		routes.Each(func(_ string, route *state.HTTPRouteMeta) {
			expandGroups(typedRefs(route.Middleware))
		})
	}
	expandRawWirings(st.Channels.Meta)
	st.QueueWorkers.Meta.Each(func(_ string, q *state.QueueWorkerMeta) {
		if q != nil {
			expandGroups(typedRefs(q.Middleware))
		}
	})
	expandRawWirings(st.ScheduledTasks.Meta)
	expandRawWirings(st.MCPEndpoints.ToolsMeta)
	expandRawWirings(st.MCPEndpoints.PromptsMeta)
	expandRawWirings(st.MCPEndpoints.ResourcesMeta)

	// 5. Services from wire service factories.
	st.WireServicesMeta.Each(func(_ string, services state.Strings) { addList(services) })

	// 6. Implicit platform services.
	hasWorkflows := st.Workflows.GraphMeta.Len() > 0 || st.Workflows.Meta.Len() > 0 ||
		slices.ContainsFunc(st.Functions.Meta.Keys(), func(id string) bool {
			return strings.HasPrefix(id, "workflowStart:") || strings.HasPrefix(id, "workflowStatus:") || strings.HasPrefix(id, "workflow:")
		})
	if hasWorkflows {
		required.Add("workflowService")
		required.Add("workflowRunService")
		required.Add("schedulerService")
		required.Add("queueService")
	}

	hasWebhookSources := false
	if st.Triggers.WebhookSourceMeta != nil {
		st.Triggers.WebhookSourceMeta.Each(func(_ string, r state.Raw) {
			src := decode[struct {
				Method json.RawMessage `json:"method"`
				Route  json.RawMessage `json:"route"`
			}](r)
			if st.Functions.Meta.Has("http:" + templateValue(src.Method) + ":" + templateValue(src.Route)) {
				hasWebhookSources = true
			}
		})
	}
	if hasWebhookSources || st.Functions.Meta.Has("queue:pikku-incoming-webhooks") {
		required.Add("incomingWebhookService")
		required.Add("queueService")
	}

	// 6b. Synthetic queue workers for workflow graph steps.
	st.Workflows.GraphMeta.Each(func(_ string, r state.Raw) {
		graph := decode[struct {
			Name   string          `json:"name"`
			Source string          `json:"source"`
			Nodes  json.RawMessage `json:"nodes"`
		}](r)
		if !truthy(graph.Nodes) || graph.Name == "" {
			return
		}
		if graph.Source == "scenario" {
			return
		}
		orch := "wf-orchestrator-" + toKebab(graph.Name)
		if !st.QueueWorkers.Meta.Has(orch) {
			st.QueueWorkers.Meta.Set(orch, &state.QueueWorkerMeta{Name: orch, PikkuFuncId: "pikkuWorkflowOrchestrator:" + graph.Name})
		}
		decodeObject(state.Raw(graph.Nodes)).Each(func(_ string, n state.Raw) {
			rpcName, ok := nodeRPCName(n)
			if !ok || rpcName == "" {
				return
			}
			funcID := rpcName
			if v, ok := st.RPC.InternalMeta.Get(rpcName); ok {
				funcID = v
			} else if v, ok := st.RPC.ExposedMeta.Get(rpcName); ok {
				funcID = v
			}
			meta, ok := st.Functions.Meta.Get(funcID)
			if !ok || meta == nil {
				meta = st.Functions.Meta.At(rpcName)
			}
			if meta == nil || meta.WorkflowQueued == nil || !*meta.WorkflowQueued {
				return
			}
			step := "wf-step-" + toKebab(rpcName)
			if !st.QueueWorkers.Meta.Has(step) {
				st.QueueWorkers.Meta.Set(step, &state.QueueWorkerMeta{Name: step, PikkuFuncId: "pikkuWorkflowWorker:" + rpcName})
			}
		})
	})

	if st.Agents.AgentsMeta.Len() > 0 {
		required.Add("agentStorage")
		required.Add("agentRunState")
		required.Add("agentRunService")
		required.Add("agentRunner")
	}
	if st.Channels.Meta.Len() > 0 {
		required.Add("eventHub")
	}
	if len(st.Scopes.Definitions) > 0 {
		required.Add("scopeService")
	}
	if len(st.FeatureFlags.Definitions) > 0 {
		required.Add("featureFlags")
	}
	if len(st.Analytics) > 0 {
		required.Add("analyticsService")
	}
	if len(st.Credentials.Definitions) > 0 {
		required.Add("credentialService")
	}

	// 7. Services consumed addons need from the parent project.
	type addonServices struct {
		services []string
		known    bool
	}
	addonFn := map[string]addonServices{}
	st.AddonFunctions.Each(func(ns string, fns *state.Record[*state.FunctionMeta]) {
		if fns == nil {
			return
		}
		fns.Each(func(id string, meta *state.FunctionMeta) {
			var services []string
			if meta != nil {
				services = meta.Services.Services
			}
			addonFn[ns+":"+id] = addonServices{services, true}
		})
	})
	parentDeclared := st.AddonRequiredParentServices
	parentDeclaredSet := map[string]bool{}
	for _, s := range parentDeclared {
		parentDeclaredSet[s] = true
	}
	usesAddonFn, addonFactoryNeeded := false, false
	for _, id := range agg.UsedFunctions.Values() {
		entry, ok := addonFn[id]
		if !ok {
			continue
		}
		usesAddonFn = true
		if entry.services == nil {
			addonFactoryNeeded = true
			continue
		}
		for _, s := range entry.services {
			if parentDeclaredSet[s] {
				required.Add(s)
			} else if !internalServices[s] && !defaultServices[s] {
				addonFactoryNeeded = true
			}
		}
	}
	if usesAddonFn && addonFactoryNeeded {
		for _, s := range parentDeclared {
			required.Add(s)
		}
	}

	// 8. An addon needs from its parent whatever its functions use minus what
	// its own factory builds.
	if st.AddonServicesFactorySeen {
		st.Functions.Meta.Each(func(_ string, meta *state.FunctionMeta) {
			if meta != nil {
				addList(meta.Services.Services)
			}
		})
		created := map[string]bool{}
		for _, s := range st.AddonCreatedServices {
			created[s] = true
		}
		parent := orderedSet{}
		for _, s := range parentDeclared {
			parent.add(s)
		}
		for _, s := range required.Values() {
			if !created[s] && !internalServices[s] && !defaultServices[s] {
				parent.add(s)
			}
		}
		st.AddonRequiredParentServices = state.Strings(parent.items)
		if st.AddonRequiredParentServices == nil {
			st.AddonRequiredParentServices = state.Strings{}
		}
	}
}

func typedRefs(refs []state.WireRef) []wireRef {
	out := make([]wireRef, 0, len(refs))
	for _, r := range refs {
		w := wireRef{Type: r.Type, Tag: r.Tag}
		if r.Route != "" {
			route := r.Route
			w.Route = &route
		}
		out = append(out, w)
	}
	return out
}

// nodeRPCName is `'rpcName' in node && node.rpcName` for a string rpcName.
func nodeRPCName(n state.Raw) (string, bool) {
	node := decode[struct {
		RPCName json.RawMessage `json:"rpcName"`
	}](n)
	return stringValue(node.RPCName)
}

var (
	kebabLowerUpper = regexp.MustCompile(`([a-z0-9])([A-Z])`)
	kebabUpperWord  = regexp.MustCompile(`([A-Z])([A-Z][a-z])`)
)

func toKebab(s string) string {
	s = kebabLowerUpper.ReplaceAllString(s, "$1-$2")
	s = kebabUpperWord.ReplaceAllString(s, "$1-$2")
	return strings.ToLower(s)
}
