package finalize

import (
	"fmt"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Port of utils/workflow/graph/finalize-workflows.ts.

// FinalizeWorkflows converts every DSL workflow to a graph, stamps rpc
// versions and step hashes, hashes the graph, and hashes graph workflows that
// were declared as graphs.
func FinalizeWorkflows(st *state.State) error {
	wf := &st.Workflows
	var err error
	wf.Meta.Each(func(name string, raw state.Raw) {
		if err != nil {
			return
		}
		v, perr := ParseRaw(raw)
		if perr != nil {
			err = fmt.Errorf("workflows.meta[%s]: %w", name, perr)
			return
		}
		meta := AsObject(v)
		if meta == nil {
			meta = NewObject()
		}
		graph := ConvertDslToGraph(name, meta)
		stampVersionsOnGraph(graph, st)
		computeStepHashes(graph, st)
		graph.Set("graphHash", ComputeGraphHash(graph))
		if graph.Get("source") == "dsl" {
			deterministic, planned := DeriveWorkflowPlan(stepsOf(meta.Get("steps")))
			graph.Set("deterministic", deterministic)
			if len(planned) > 0 {
				graph.Set("plannedSteps", planned)
			}
		}
		wf.GraphMeta.Set(name, ToRaw(graph))
	})
	if err != nil {
		return err
	}
	for _, name := range wf.GraphMeta.Keys() {
		raw := wf.GraphMeta.At(name)
		v, perr := ParseRaw(raw)
		if perr != nil {
			return fmt.Errorf("workflows.graphMeta[%s]: %w", name, perr)
		}
		graph := AsObject(v)
		if graph == nil || Truthy(graph.Get("graphHash")) {
			continue
		}
		stampVersionsOnGraph(graph, st)
		computeStepHashes(graph, st)
		graph.Set("graphHash", ComputeGraphHash(graph))
		wf.GraphMeta.Set(name, ToRaw(graph))
	}
	return nil
}

func graphNodeObjects(graph *Object) []*Object {
	nodes := AsObject(graph.Get("nodes"))
	var out []*Object
	for _, k := range nodes.Keys() {
		if n := AsObject(nodes.Get(k)); n != nil {
			out = append(out, n)
		}
	}
	return out
}

func stampVersionsOnGraph(graph *Object, st *state.State) {
	for _, node := range graphNodeObjects(graph) {
		rpc, ok := node.Get("rpcName").(string)
		if !ok || isVersionedId(rpc) {
			continue
		}
		if meta := st.Functions.Meta.At(rpc); meta != nil && meta.Version != nil {
			node.Set("rpcName", formatVersionedId(rpc, *meta.Version))
		} else if latest := findLatestVersion(rpc, st); latest > 0 {
			node.Set("rpcName", formatVersionedId(rpc, latest))
		}
	}
}

func findLatestVersion(base string, st *state.State) int {
	max := 0
	for _, id := range st.Functions.Meta.Keys() {
		if b, v := parseVersionedId(id); b == base && v >= 0 && v > max {
			max = v
		}
	}
	return max
}

func computeStepHashes(graph *Object, st *state.State) {
	for _, node := range graphNodeObjects(graph) {
		rpc, ok := node.Get("rpcName").(string)
		if !ok {
			continue
		}
		meta := st.Functions.Meta.At(rpc)
		if meta == nil {
			base, _ := parseVersionedId(rpc)
			meta = st.Functions.Meta.At(base)
		}
		hash := ""
		if meta != nil {
			hash = meta.ContractHash
		}
		node.Set("stepHash", HashString(TemplateString(node.Get("nodeId"))+":"+hash, 12))
	}
}

// ComputeGraphHash ports computeGraphHash: the topology hash, without notes.
func ComputeGraphHash(graph *Object) string {
	nodes := AsObject(graph.Get("nodes"))
	forHash := NewObject()
	for _, k := range nodes.Keys() {
		n := nodes.Get(k)
		if o := AsObject(n); o != nil {
			c := o.Clone()
			c.Delete("notes")
			n = c
		}
		forHash.Set(k, n)
	}
	return HashString(CanonicalJSON(Obj(
		"source", graph.Get("source"),
		"context", graph.Get("context"),
		"nodes", forHash,
		"entryNodeIds", graph.Get("entryNodeIds"),
	)), 12)
}
