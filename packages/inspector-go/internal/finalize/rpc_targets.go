package finalize

import (
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// validateRpcTargets refuses a function whose `invokes` or `startsWorkflows`
// names something that does not exist (PKU944): the call would fail at run
// time, and `pikku graph` would draw an edge to nothing.
//
// A plain name is valid if it is a function id or an rpc name (internal,
// exposed or remote), a workflow, or a graph workflow. `ns:fn` is valid if the
// wired addon `ns` exposes `fn`. A namespace that is wired but whose function
// meta is not available (the addon is not installed or not built) cannot be
// checked and is skipped. A namespace that is not wired at all is an error.
//
// An addon package is not checked at all: the functions it invokes may be
// provided by the app that wires it (@pikku/addon-changes-cli invokes
// 'claimChanges', which the app supplies), and its namespaces are aliases the
// app maps.
func validateRpcTargets(log *diag.Logger, st *state.State, opts Options) {
	if opts.IsAddon {
		return
	}
	plain := func(name string) bool {
		if st.Functions.Meta.Has(name) || st.RPC.InternalMeta.Has(name) || st.RPC.ExposedMeta.Has(name) ||
			st.RPC.RemoteMeta.Has(name) || st.Workflows.Meta.Has(name) || st.Workflows.GraphMeta.Has(name) {
			return true
		}
		if i := strings.Index(name, "@"); i > 0 {
			return st.Functions.Meta.Has(name[:i]) || st.RPC.InternalMeta.Has(name[:i]) || st.RPC.ExposedMeta.Has(name[:i]) || st.Workflows.Meta.Has(name[:i])
		}
		return false
	}
	workflow := func(name string) bool {
		return st.Workflows.Meta.Has(name) || st.Workflows.GraphMeta.Has(name)
	}
	// resolves is "ok", "missing" or "unverifiable" for a namespaced name.
	namespaced := func(name string, isWorkflow bool) string {
		i := strings.Index(name, ":")
		if i <= 0 {
			return "missing"
		}
		ns, fn := name[:i], name[i+1:]
		available := false
		for _, rec := range []*state.Record[*state.Record[*state.FunctionMeta]]{&st.AddonFunctions, st.RemoteAddonFunctions} {
			if rec == nil {
				continue
			}
			if funcs, ok := rec.Get(ns); ok && funcs != nil {
				available = true
				if funcs.Has(fn) {
					return "ok"
				}
			}
		}
		if available {
			if isWorkflow {
				return "unverifiable" // an addon's workflows are not in its function meta
			}
			return "missing"
		}
		if _, declared := st.RPC.WireAddonDeclarations.Get(ns); declared {
			return "unverifiable"
		}
		return "missing"
	}
	st.Functions.Meta.Each(func(id string, m *state.FunctionMeta) {
		if m == nil {
			return
		}
		for _, name := range m.Invokes {
			if plain(name) || namespaced(name, false) != "missing" {
				continue
			}
			log.Critical(diag.RpcTargetNotFound, "• "+id+" invokes '"+name+"', but no function, workflow or wired addon function has that name. The call would fail at run time. Fix the name, or wire the addon that provides it.")
		}
		for _, name := range m.StartsWorkflows {
			if workflow(name) || namespaced(name, true) != "missing" {
				continue
			}
			log.Critical(diag.RpcTargetNotFound, "• "+id+" starts workflow '"+name+"', but no workflow has that name. The call would fail at run time. Fix the name, or wire the addon that provides it.")
		}
	})
}
