package main

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// inspector-parity/fixtures/harness declares local stand-ins for the
// @pikku/core/harness declarations, so it needs no install.
func inspectHarnessFixture(t *testing.T) protocol.Response {
	t.Helper()
	root, _ := filepath.Abs("../../../../inspector-parity/fixtures/harness")
	req := protocol.Request{
		RouteFiles: findSourceFiles(filepath.ToSlash(root), []string{"src"}),
		Options:    protocol.Options{RootDir: root, Tsconfig: filepath.Join(root, "tsconfig.json")},
	}
	in, _ := json.Marshal(req)
	var out bytes.Buffer
	if err := runInspect(bytes.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	return decodeResponse(t, out.Bytes())
}

func TestHarnessGatesAreFunctions(t *testing.T) {
	st := inspectHarnessFixture(t).State

	check := st.Functions.Meta.At("check")
	if check == nil {
		t.Fatalf("gate 'check' missing from functions meta: %v", st.Functions.Meta.Keys())
	}
	if got := marshal(t, []any{check.Harness, check.FailOn, check.Writes, check.WorkflowRetries, check.WorkflowTimeout}); got != `[true,"high",[".pikku/**"],1,"5min"]` {
		t.Errorf("check = %s", got)
	}
	if got := marshal(t, st.Functions.Meta.At("format").Writes); got != `["**/*.{ts,tsx}"]` {
		t.Errorf("format writes = %s", got)
	}
	// A gate that writes nothing keeps its empty list: without one it would read as the default.
	if got := marshal(t, st.Functions.Meta.At("lint").Writes); got != `[]` {
		t.Errorf("lint writes = %s", got)
	}
	if st.RPC.InternalMeta.Has("check") || st.RPC.InternalFiles.Has("check") {
		t.Error("a gate is run by the harness engine, never registered as an RPC")
	}
	for _, refused := range []string{"bodiless", "loose", "computedWrites"} {
		if st.Functions.Meta.Has(refused) {
			t.Errorf("%s should not be registered", refused)
		}
	}
}

func TestHarnessAndGateAgentMeta(t *testing.T) {
	res := inspectHarnessFixture(t)
	h := res.State.Harness
	if h == nil {
		t.Fatal("state.harness missing")
	}
	if got := marshal(t, h.HarnessesMeta.Keys()); got != `["build","quick","repeatedSpread","typo"]` {
		t.Errorf("harnesses = %s", got)
	}
	if got := marshal(t, h.HarnessesMeta.At("build").Gates); got != `[{"name":"check"},{"name":"format"},{"name":"review","failOn":"medium"}]` {
		t.Errorf("build gates = %s", got)
	}
	if got := marshal(t, h.HarnessesMeta.At("quick").Gates); got != `[{"name":"check"}]` {
		t.Errorf("quick gates = %s", got)
	}
	if got := marshal(t, h.HarnessesMeta.At("repeatedSpread").Gates); got != `[{"name":"lint"}]` {
		t.Errorf("repeatedSpread gates = %s", got)
	}
	if got := h.HarnessesMeta.At("build").Agent.Model; got != "default" {
		t.Errorf("build agent model = %s", got)
	}
	review := h.GateAgentsMeta.At("review")
	if review == nil || !review.Harness || review.Model != "cheap" || review.Goal != "The diff adds no unused code" || review.FailOn != "high" {
		t.Errorf("review = %s", marshal(t, review))
	}
	if got := marshal(t, h.GateAgentsMeta.Keys()); got != `["review"]` {
		t.Errorf("gate agents = %s", got)
	}

	assertDiagnostics(t, res, []string{
		"Harness gate 'bodiless' has no body.",
		"Harness gate 'loose' has no failOn of 'low', 'medium' or 'high' readable from source.",
		"Harness gate 'computedWrites' has a writes that is not an inline array of path patterns: `paths`.",
		"Harness 'computed' lists gates that are not readable from source: `makeGates()`.",
		"Harness 'callEntry' lists gates that are not readable from source: `makeGates()[0]`.",
		"Harness 'noModel' has no agent model readable from source.",
		"Harness 'selfSpread' lists gates that are not readable from source: `selfSpread`.",
		"Harness gate agent 'goalless' has no goal readable from source.",
		"Harness gate agent 'check' has the name of the harness gate in",
		"Harness 'typo' (src/refusals.ts) lists gate 'chek', which is not declared in this project. Declared gates: check, format, lint, review.",
	})
}
