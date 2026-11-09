package analyze

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

func classificationDiagnostics(t *testing.T, opts protocol.Options, dir string) []diag.Diagnostic {
	t.Helper()
	root, _ := filepath.Abs(dir)
	var files []string
	_ = filepath.Walk(filepath.Join(root, "src"), func(p string, info os.FileInfo, err error) error {
		if err == nil && strings.HasSuffix(p, ".ts") {
			files = append(files, p)
		}
		return nil
	})
	opts.RootDir, opts.Tsconfig = root, filepath.Join(root, "tsconfig.json")
	res, err := Run(protocol.Request{RouteFiles: files, Options: opts}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return res.Diagnostics
}

type classificationEntry struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// diagnostics.golden.json is the TypeScript inspector's output for the fixture,
// written by parity/classification-golden.ts, so this is a parity check on the
// messages byte for byte and not a snapshot of what Go happens to print.
func TestClassificationScan(t *testing.T) {
	got := []classificationEntry{}
	for _, d := range classificationDiagnostics(t, protocol.Options{ClassificationCheck: true}, "../../testdata/classification") {
		if d.Code == diag.SecretRevealedIntoSink || d.Code == diag.PiiIntoSink || d.Code == diag.PiiInOutput {
			got = append(got, classificationEntry{string(d.Code), d.Message})
		}
	}
	raw, err := os.ReadFile("../../testdata/classification/diagnostics.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var want []classificationEntry
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(got, want) {
		for i := 0; i < max(len(got), len(want)); i++ {
			var g, w classificationEntry
			if i < len(got) {
				g = got[i]
			}
			if i < len(want) {
				w = want[i]
			}
			if g != w {
				t.Errorf("diagnostic %d:\n  go: %s %q\n  ts: %s %q", i, g.Code, g.Message, w.Code, w.Message)
			}
		}
	}
}

// Off by default: it is a `pikku all --security` lint, not codegen.
func TestClassificationScanIsOptIn(t *testing.T) {
	for _, d := range classificationDiagnostics(t, protocol.Options{}, "../../testdata/classification") {
		if d.Code == diag.SecretRevealedIntoSink || d.Code == diag.PiiIntoSink || d.Code == diag.PiiInOutput {
			t.Fatalf("unexpected diagnostic without classificationCheck: %s", d.Message)
		}
	}
}

func TestPermissionsInBodyNeedsOptIn(t *testing.T) {
	const dir = "../../testdata/permissions-in-body"
	raw, err := os.ReadFile(dir + "/diagnostics.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var want []classificationEntry
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if len(want) != 1 {
		t.Fatalf("golden holds %d entries, want 1", len(want))
	}
	refused := false
	for _, d := range classificationDiagnostics(t, protocol.Options{}, dir) {
		if d.Code == diag.PermissionsInBodyNotAllowed {
			refused = true
			if d.Message != want[0].Message {
				t.Errorf("message differs:\n  go: %q\n  ts: %q", d.Message, want[0].Message)
			}
		}
	}
	if !refused {
		t.Error("permissionsInBody without allow.permissionsInBody was not refused")
	}
	for _, d := range classificationDiagnostics(t, protocol.Options{Allow: &protocol.Allow{PermissionsInBody: true}}, dir) {
		if d.Code == diag.PermissionsInBodyNotAllowed {
			t.Errorf("refused despite the opt-in: %s", d.Message)
		}
	}
}

// wire-rules: a computed rpc name (PKU941), a wire handed to any callee (PKU942)
// and a template workflow step name (PKU943) are critical; literal and const names, services, data and method
// calls are not. The Rust inspector asserts the same list in
// tests/visit_core_fixtures.rs.
func TestWireRules(t *testing.T) {
	var got []string
	for _, d := range classificationDiagnostics(t, protocol.Options{}, "../../testdata/wire-rules") {
		if d.Code == diag.RpcNameNotLiteral || d.Code == diag.WirePassedToHelper || d.Code == diag.WorkflowStepNameNotLiteral {
			if d.Level != "critical" {
				t.Errorf("%s is %s, want critical", d.Code, d.Level)
			}
			got = append(got, string(d.Code)+" "+d.Message)
		}
	}
	for _, w := range wireRulesWant {
		if !slices.Contains(got, w) {
			t.Errorf("missing %q\ngot:\n%s", w, strings.Join(got, "\n"))
		}
	}
	if len(got) != len(wireRulesWant) {
		t.Errorf("got %d diagnostics, want %d:\n%s", len(got), len(wireRulesWant), strings.Join(got, "\n"))
	}
}

const wireLeakTail = " — a wire stays bound to the function. What the callee does with it is invisible to the inspector (gates, wiring, rpc and workflow edges), so nothing can check it. Make the call in the handler itself, or pass plain data."

var wireRulesWant = []string{
	"PKU941 • computedNames calls rpc.invoke(name) with a computed name — the deploy planner cannot bind its unit to the callee's, so the call fails with \"No service binding\" if the two are deployed apart. Use a literal RPC name.",
	"PKU941 • computedNames calls rpc.mesh(`x:${name}`) with a computed name — the deploy planner cannot bind its unit to the callee's, so the call fails with \"No service binding\" if the two are deployed apart. Use a literal RPC name.",
	"PKU941 • computedNames calls rpc.startWorkflow(name) with a computed name — the deploy planner cannot bundle that workflow's meta into computedNames's unit, so the deployed call fails with \"Workflow not found\" unless the unit has it for another reason. Use a literal workflow name.",
	"PKU942 • leaksWires passes the wire to helper()" + wireLeakTail,
	"PKU942 • leaksWires passes wire.rpc to helper()" + wireLeakTail,
	"PKU942 • leaksWires passes wire.channel to helper()" + wireLeakTail,
	"PKU942 • leaksWires passes wire.http to helper()" + wireLeakTail,
	"PKU942 • leaksWires passes wire.workflow to helper()" + wireLeakTail,
	"PKU942 • leaksWires passes wire.rpc to util.run()" + wireLeakTail,
	"PKU942 • leaksWires passes wire.rpc to new Keeper()" + wireLeakTail,
	"PKU942 • leaksDestructured passes wire.rpc to helper()" + wireLeakTail,
	"PKU942 • closures passes wire.rpc to helper()" + wireLeakTail,
	"PKU942 • localForwards passes wire.rpc to helper()" + wireLeakTail,
	"PKU942 • callsModuleHelper passes wire.rpc to moduleHelper()" + wireLeakTail,
	"PKU942 • callsUserHelper passes wire.rpc to helper()" + wireLeakTail,
	"PKU942 • callsUnresolved passes wire.rpc to untyped.run()" + wireLeakTail,
	"PKU942 • callsUnresolved passes wire.rpc to untyped['run']()" + wireLeakTail,
	"PKU942 • callsWrapper passes wire.rpc to wrapper()" + wireLeakTail,
	"PKU943 • Workflow 'templateStep' calls workflow.do(`prefix:${data.name}`) with an rpc name the inspector cannot read. The step would be missing from the workflow graph, so it cannot be replayed, migrated or found by `pikku graph`. Use a string literal or a const of one.",
}
