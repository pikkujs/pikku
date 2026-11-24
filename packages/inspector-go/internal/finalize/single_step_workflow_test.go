package finalize

import (
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// A DSL workflow of one RPC step is told it buys nothing; a complex workflow,
// whose inline steps (a harness run's gates and agent turns) are not in its
// graph, is not.
func TestSingleStepWorkflowSkipsComplexWorkflows(t *testing.T) {
	st := &state.State{}
	st.Workflows.GraphMeta = *state.NewRecord[state.Raw]()
	st.Workflows.Files = *state.NewMap[state.FileExport]()
	for name, source := range map[string]string{"oneStep": "dsl", "harnessRun": "complex"} {
		st.Workflows.GraphMeta.Set(name, state.Raw(`{"name":"`+name+`","pikkuFuncId":"`+name+`","source":"`+source+`","nodes":{"a":{"rpcName":"doIt"}}}`))
		st.Workflows.Files.Set(name, state.FileExport{Path: "src/" + name + ".ts", ExportedName: name})
	}

	log := &diag.Logger{}
	validateSingleStepWorkflows(log, st)

	var flagged []string
	for _, d := range log.Entries() {
		if d.Code == diag.SingleStepWorkflow {
			flagged = append(flagged, d.Message)
		}
	}
	if len(flagged) != 1 || !strings.HasPrefix(flagged[0], "Workflow 'oneStep'") {
		t.Fatalf("PKU644 = %q, want only oneStep", flagged)
	}
}
