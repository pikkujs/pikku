package finalize

import (
	"sort"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// validateHarnessGateReferences refuses a harness that lists a gate no
// pikkuHarnessGate or pikkuHarnessGateAgent in the project declares.
func validateHarnessGateReferences(log *diag.Logger, st *state.State) {
	if st.Harness == nil {
		return
	}
	known := map[string]bool{}
	st.Functions.Meta.Each(func(id string, meta *state.FunctionMeta) {
		if meta != nil && meta.Harness != nil && *meta.Harness {
			known[id] = true
		}
	})
	for _, name := range st.Harness.GateAgentsMeta.Keys() {
		known[name] = true
	}
	declared := make([]string, 0, len(known))
	for name := range known {
		declared = append(declared, name)
	}
	sort.Strings(declared)
	st.Harness.HarnessesMeta.Each(func(name string, harness *state.HarnessMeta) {
		for _, gate := range harness.Gates {
			if known[gate.Name] {
				continue
			}
			log.Critical(diag.HarnessGateNotFound, "Harness '"+name+"' ("+jsRelative(st.RootDir, harness.SourceFile)+") lists gate '"+gate.Name+"', which is not declared in this project. "+
				"Declared gates: "+orNone(declared)+".")
		}
	})
}
