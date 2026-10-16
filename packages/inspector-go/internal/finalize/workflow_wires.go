package finalize

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Port of utils/workflow/graph/finalize-workflow-wires.ts.

type parsedWorkflowFuncId struct {
	workflowName string
	startNode    string
	hasStart     bool
}

func parseWorkflowFuncId(id string) *parsedWorkflowFuncId {
	for _, prefix := range []string{"workflowStart:", "workflow:"} {
		if strings.HasPrefix(id, prefix) {
			return &parsedWorkflowFuncId{workflowName: id[len(prefix):]}
		}
	}
	if rest, ok := strings.CutPrefix(id, "graphStart:"); ok {
		if i := strings.Index(rest, ":"); i >= 0 {
			return &parsedWorkflowFuncId{workflowName: rest[:i], startNode: rest[i+1:], hasStart: true}
		}
	}
	return nil
}

func resolveStartNode(p *parsedWorkflowFuncId, graph *Object) any {
	if p.hasStart {
		return p.startNode
	}
	if arr := AsArray(graph.Get("entryNodeIds")); len(arr) > 0 {
		return arr[0]
	}
	return Undefined
}

// graphSet decodes workflows.graphMeta entries on demand and writes the
// touched ones back in place.
type graphSet struct {
	meta    *state.Record[state.Raw]
	decoded map[string]*Object
	dirty   map[string]bool
	err     error
}

func newGraphSet(st *state.State) *graphSet {
	return &graphSet{meta: &st.Workflows.GraphMeta, decoded: map[string]*Object{}, dirty: map[string]bool{}}
}

func (g *graphSet) get(name string) *Object {
	if o, ok := g.decoded[name]; ok {
		return o
	}
	raw, ok := g.meta.Get(name)
	var o *Object
	if ok {
		v, err := ParseRaw(raw)
		if err != nil && g.err == nil {
			g.err = fmt.Errorf("workflows.graphMeta[%s]: %w", name, err)
		}
		if Truthy(v) {
			o = AsObject(v)
		}
	}
	g.decoded[name] = o
	return o
}

// lookup is `graphMeta[parsed.workflowName]` for a pikkuFuncId.
func (g *graphSet) lookup(funcId any) (*parsedWorkflowFuncId, *Object) {
	s, _ := funcId.(string)
	p := parseWorkflowFuncId(s)
	if p == nil {
		return nil, nil
	}
	graph := g.get(p.workflowName)
	if graph == nil {
		return nil, nil
	}
	return p, graph
}

func (g *graphSet) wires(graph *Object) *Object {
	for name, o := range g.decoded {
		if o == graph {
			g.dirty[name] = true
		}
	}
	if !Truthy(graph.Get("wires")) {
		graph.Set("wires", NewObject())
	}
	return AsObject(graph.Get("wires"))
}

func (g *graphSet) flush() error {
	if g.err != nil {
		return g.err
	}
	for _, name := range g.meta.Keys() {
		if g.dirty[name] {
			g.meta.Set(name, ToRaw(g.decoded[name]))
		}
	}
	return nil
}

func pushTo(o *Object, key string, v any) {
	arr, _ := o.Get(key).([]any)
	if !Truthy(o.Get(key)) {
		arr = []any{}
	}
	o.Set(key, append(arr, v))
}

func subObject(o *Object, key string) *Object {
	if !Truthy(o.Get(key)) {
		o.Set(key, NewObject())
	}
	return AsObject(o.Get(key))
}

// toJS converts a typed state value into a JS value via its JSON encoding.
func toJS(v any) any {
	if r, ok := v.(state.Raw); ok {
		x, _ := ParseRaw(r)
		return x
	}
	b, err := json.Marshal(v)
	if err != nil {
		return Undefined
	}
	x, _ := Parse(b)
	return x
}

func recordValues[V any](r *state.Record[V]) []*Object {
	var out []*Object
	for _, k := range r.Keys() {
		if o := AsObject(toJS(r.At(k))); o != nil {
			out = append(out, o)
		} else {
			out = append(out, NewObject())
		}
	}
	return out
}

// FinalizeWorkflowHelperTypes ports finalizeWorkflowHelperTypes.
func FinalizeWorkflowHelperTypes(st *state.State) error {
	graphs := newGraphSet(st)
	var err error
	st.Functions.Meta.Each(func(_ string, meta *state.FunctionMeta) {
		if meta == nil || meta.FunctionType != "helper" || strings.HasPrefix(meta.PikkuFuncId, "workflowStatus:") {
			return
		}
		p, graph := graphs.lookup(meta.PikkuFuncId)
		if graph == nil {
			return
		}
		startID := TemplateString(resolveStartNode(p, graph))
		nodes := AsObject(graph.Get("nodes"))
		node := AsObject(nodes.Get(startID))
		if !Truthy(nodes.Get(startID)) || node == nil || !node.Has("rpcName") {
			return
		}
		rpc := st.Functions.Meta.At(TemplateString(node.Get("rpcName")))
		if rpc == nil {
			return
		}
		if rpc.InputSchemaName != nil && *rpc.InputSchemaName != "" {
			name := *rpc.InputSchemaName
			meta.InputSchemaName = &name
		}
		if len(rpc.Inputs) > 0 {
			meta.Inputs = rpc.Inputs
		}
	})
	if graphs.err != nil {
		err = graphs.err
	}
	return err
}

// FinalizeWorkflowWires ports finalizeWorkflowWires.
func FinalizeWorkflowWires(st *state.State) error {
	g := newGraphSet(st)

	// http
	for _, method := range st.HTTP.Meta.Keys() {
		routes := st.HTTP.Meta.At(method)
		if routes == nil {
			continue
		}
		for _, route := range routes.Keys() {
			meta := routes.At(route)
			if meta == nil {
				continue
			}
			p, graph := g.lookup(meta.PikkuFuncId)
			if graph == nil {
				continue
			}
			pushTo(g.wires(graph), "http", Obj("route", route, "method", method, "startNode", resolveStartNode(p, graph)))
		}
	}

	for _, meta := range recordValues(&st.ScheduledTasks.Meta) {
		if p, graph := g.lookup(meta.Get("pikkuFuncId")); graph != nil {
			pushTo(g.wires(graph), "schedule", Obj("cron", meta.Get("schedule"), "startNode", resolveStartNode(p, graph)))
		}
	}
	for _, meta := range recordValues(&st.Triggers.Meta) {
		if p, graph := g.lookup(meta.Get("pikkuFuncId")); graph != nil {
			pushTo(g.wires(graph), "trigger", Obj("name", meta.Get("name"), "startNode", resolveStartNode(p, graph)))
		}
	}
	for _, meta := range recordValues(&st.QueueWorkers.Meta) {
		if p, graph := g.lookup(meta.Get("pikkuFuncId")); graph != nil {
			pushTo(g.wires(graph), "queue", Obj("name", meta.Get("name"), "startNode", resolveStartNode(p, graph)))
		}
	}

	scanChannels(g, recordValues(&st.Channels.Meta))

	type mcpWire struct{ pikkuFuncId, value string }
	var tools, prompts, resources []mcpWire
	st.MCPEndpoints.ToolsMeta.Each(func(_ string, m *state.MCPToolMeta) {
		if m != nil {
			tools = append(tools, mcpWire{m.PikkuFuncId, m.Name})
		}
	})
	st.MCPEndpoints.PromptsMeta.Each(func(_ string, m *state.MCPPromptMeta) {
		if m != nil {
			prompts = append(prompts, mcpWire{m.PikkuFuncId, m.Name})
		}
	})
	st.MCPEndpoints.ResourcesMeta.Each(func(_ string, m *state.MCPResourceMeta) {
		if m != nil {
			resources = append(resources, mcpWire{m.PikkuFuncId, m.URI})
		}
	})
	for _, kind := range []struct {
		wires []mcpWire
		key   string
		field string
	}{
		{tools, "tool", "name"},
		{prompts, "prompt", "name"},
		{resources, "resource", "uri"},
	} {
		for _, w := range kind.wires {
			if p, graph := g.lookup(w.pikkuFuncId); graph != nil {
				mcp := subObject(g.wires(graph), "mcp")
				pushTo(mcp, kind.key, Obj(kind.field, w.value, "startNode", resolveStartNode(p, graph)))
			}
		}
	}

	for _, program := range recordValues(&st.CLI.Meta.Programs) {
		visitCLICommands(g, AsObject(program.Get("commands")), TemplateString(program.Get("program")), nil)
	}
	return g.flush()
}

func scanChannels(g *graphSet, channels []*Object) {
	for _, ch := range channels {
		wire := Obj("name", ch.Get("name"), "route", ch.Get("route"))
		var target *Object
		for _, h := range []struct{ key, field string }{
			{"connect", "onConnect"}, {"disconnect", "onDisconnect"}, {"message", "onMessage"},
		} {
			handler := ch.Get(h.key)
			if !Truthy(handler) {
				continue
			}
			if p, graph := g.lookup(AsObject(handler).Get("pikkuFuncId")); graph != nil {
				if target == nil {
					target = graph
				}
				wire.Set(h.field, resolveStartNode(p, graph))
			}
		}
		wirings := AsObject(ch.Get("messageWirings"))
		for _, prop := range wirings.Keys() {
			routeMap := AsObject(wirings.Get(prop))
			for _, value := range routeMap.Keys() {
				msg := AsObject(routeMap.Get(value))
				p, graph := g.lookup(msg.Get("pikkuFuncId"))
				if graph == nil {
					continue
				}
				if target == nil {
					target = graph
				}
				subObject(wire, "onMessageRoute").Set(prop+":"+value, resolveStartNode(p, graph))
			}
		}
		if target != nil {
			pushTo(g.wires(target), "channel", wire)
		}
	}
}

func visitCLICommands(g *graphSet, commands *Object, program string, path []string) {
	for _, name := range commands.Keys() {
		command := AsObject(commands.Get(name))
		current := append(append([]string(nil), path...), name)
		if p, graph := g.lookup(command.Get("pikkuFuncId")); graph != nil {
			pushTo(g.wires(graph), "cli", Obj("command", program+" "+strings.Join(current, " "), "startNode", resolveStartNode(p, graph)))
		}
		if Truthy(command.Get("subcommands")) {
			visitCLICommands(g, AsObject(command.Get("subcommands")), program, current)
		}
	}
}
