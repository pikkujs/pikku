package finalize

import (
	"encoding/json"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// validateWorkflowGraphAddons (post-process.ts), validateSingleStepWorkflows
// (validate-single-step-workflows.ts) and validateSchemaWiringSeparation
// (post-process.ts).

type graphMeta struct {
	Name        string          `json:"name"`
	PikkuFuncId string          `json:"pikkuFuncId"`
	Source      string          `json:"source"`
	Nodes       json.RawMessage `json:"nodes"`
}

func graphNodes(g graphMeta) []state.Raw {
	var out []state.Raw
	decodeObject(state.Raw(g.Nodes)).Each(func(_ string, n state.Raw) { out = append(out, n) })
	return out
}

func validateWorkflowGraphAddons(log *diag.Logger, st *state.State) {
	wired := false
	st.RPC.WireAddonDeclarations.Each(func(_ string, r state.Raw) {
		if d := decode[addonDecl](r); d.Package != nil && *d.Package == "@pikku/addon-graph" {
			wired = true
		}
	})
	if wired {
		return
	}
	st.Workflows.GraphMeta.Each(func(name string, r state.Raw) {
		for _, n := range graphNodes(decode[graphMeta](r)) {
			rpcName, ok := nodeRPCName(n)
			if !ok || !strings.HasPrefix(rpcName, "graph:") {
				continue
			}
			if st.Functions.Meta.At(rpcName) != nil {
				continue
			}
			log.Critical(diag.WorkflowGraphAddonNotWired,
				"Workflow graph '"+name+"' references '"+rpcName+"' but @pikku/addon-graph is not wired. "+
					"Enable \"scaffold\": { \"graph\": true } in pikku.config.json (and install @pikku/addon-graph), "+
					"or wire it manually with wireAddon({ name: 'graph', package: '@pikku/addon-graph' }).")
		}
	})
}

var durableFlows = map[string]bool{"sleep": true, "suspend": true, "approval": true, "parallel": true, "fanout": true}

func validateSingleStepWorkflows(log *diag.Logger, st *state.State) {
	st.Workflows.GraphMeta.Each(func(name string, r state.Raw) {
		g := decode[graphMeta](r)
		if g.Source == "scenario" {
			return
		}
		file := ""
		if f, ok := st.Workflows.Files.Get(g.PikkuFuncId); ok {
			file = f.Path
		}
		if file == "" {
			if f, ok := st.Workflows.GraphFiles.Get(name); ok {
				file = f.Path
			}
		}
		if file == "" {
			return
		}
		rpcSteps := 0
		durable := false
		for _, n := range graphNodes(g) {
			node := decode[struct {
				RPCName json.RawMessage `json:"rpcName"`
				Flow    json.RawMessage `json:"flow"`
			}](n)
			if truthy(node.RPCName) {
				rpcSteps++
			}
			if flow, ok := stringValue(node.Flow); ok && durableFlows[flow] {
				durable = true
			}
		}
		if rpcSteps > 1 || durable {
			return
		}
		runs := "a single RPC step"
		if rpcSteps == 0 {
			runs = "no RPC step"
		}
		log.Diagnostic(diag.Warn, diag.SingleStepWorkflow,
			"Workflow '"+name+"' ("+file+") runs "+runs+" "+
				"and never sleeps, suspends or fans out, so it buys nothing a workflow is for. "+
				"Call the function directly, or enqueue it on a queue worker if it must survive a restart.")
	})
}

func validateSchemaWiringSeparation(log *diag.Logger, st *state.State) {
	var schemaFiles orderedSet
	st.SchemaLookup.Each(func(_ string, ref state.SchemaRef) { schemaFiles.add(ref.SourceFile) })

	wiringFiles := map[string]bool{}
	for _, f := range st.HTTP.Files.Values() {
		wiringFiles[f] = true
	}
	addGroupFiles := func(groups state.Map[state.Raw]) {
		groups.Each(func(_ string, r state.Raw) {
			g := decode[groupMeta](r)
			wiringFiles[g.SourceFile] = true
			for _, reg := range g.AdditionalRegistrations {
				wiringFiles[reg.SourceFile] = true
			}
		})
	}
	addGroupFiles(rawMap(st.HTTP.RouteMiddleware))
	addGroupFiles(rawMap(st.Middleware.TagMiddleware))

	for _, file := range schemaFiles.items {
		if !wiringFiles[file] {
			continue
		}
		var schemas []string
		st.SchemaLookup.Each(func(name string, ref state.SchemaRef) {
			if ref.SourceFile == file {
				schemas = append(schemas, name)
			}
		})
		log.Critical(diag.SchemaAndWiringColocated,
			"File '"+file+"' contains both Zod schemas ("+strings.Join(schemas, ", ")+") and wiring calls (wireHTTPRoutes, addPermission, etc.). "+
				"These must be in separate files because the CLI imports schema files at runtime, which triggers wiring side-effects that crash without server context. "+
				"Move the route/wiring definitions to a dedicated wiring file.")
	}
}
