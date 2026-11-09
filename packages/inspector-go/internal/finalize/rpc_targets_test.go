package finalize

import (
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func TestValidateRpcTargets(t *testing.T) {
	st := &state.State{}
	st.Functions.Meta.Set("exists", &state.FunctionMeta{})
	st.Functions.Meta.Set("caller", &state.FunctionMeta{
		Invokes: []string{
			"exists",        // a function
			"viaRpcName",    // an rpc name
			"flow",          // a workflow
			"stripe:charge", // addon function that exists
			"stripe:refund", // addon meta present, function missing
			"slack:post",    // wired, meta unavailable: skipped
			"ghost:run",     // namespace not wired
			"nope",          // missing
			"exists@v2",     // a version of a known function
		},
		StartsWorkflows: []string{"flow", "missingFlow", "stripe:anything"},
	})
	st.RPC.InternalMeta.Set("viaRpcName", "exists")
	st.Workflows.Meta.Set("flow", state.RawOf(map[string]any{}))
	charges := state.NewRecord[*state.FunctionMeta]()
	charges.Set("charge", &state.FunctionMeta{})
	st.AddonFunctions.Set("stripe", charges)
	st.RPC.WireAddonDeclarations.Set("slack", state.RawOf(map[string]any{"package": "@x/slack"}))

	log := &diag.Logger{}
	validateRpcTargets(log, st, Options{})
	var got []string
	for _, d := range log.Entries() {
		if d.Code != diag.RpcTargetNotFound || d.Level != diag.Critical {
			t.Errorf("unexpected %v %v", d.Level, d.Code)
		}
		got = append(got, d.Message)
	}
	want := []string{
		"• caller invokes 'stripe:refund', but",
		"• caller invokes 'ghost:run', but",
		"• caller invokes 'nope', but",
		"• caller starts workflow 'missingFlow', but",
	}
	if len(got) != len(want) {
		t.Fatalf("got %d: %s", len(got), strings.Join(got, "\n"))
	}
	for i, w := range want {
		if !strings.HasPrefix(got[i], w) {
			t.Errorf("[%d] %q, want prefix %q", i, got[i], w)
		}
	}

	log = &diag.Logger{}
	validateRpcTargets(log, st, Options{IsAddon: true})
	if n := len(log.Entries()); n != 0 {
		t.Errorf("addon package: %d diagnostics, want 0 (the app supplies what an addon invokes)", n)
	}
}
