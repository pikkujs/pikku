package tsutil_test

import (
	"slices"
	"testing"

	"github.com/microsoft/typescript-go/shim/core"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/sourcescan"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Expected output is ts.createPrinter({removeComments: true}).printNode's.
func TestPrintNodeNonNull(t *testing.T) {
	for source, want := range map[string]string{
		"f(x!)":      "f(x!);",
		"f(a.b!, c)": "f(a.b!, c);",
		"f(x!.y!)":   "f(x!.y!);",
		"m.get(k!)!": "m.get(k!)!;",
		"new C(x!)":  "new C(x!);",
		"x!.y":       "x!.y;",
		"x!.y!.z()":  "x!.y!.z();",
		"x![0]":      "x![0];",
		"x!()":       "x!();",
		"(x!).y":     "(x!).y;",
		"if (x!) {}": "if (x!) { }",
		"g((x!))":    "g((x!));",
		"x!++":       "x!++;",
		"f(a, b!)":   "f(a, b!);",
		"f(x!)(y!)":  "f(x!)(y!);",
		"f<T>(x!)":   "f<T>(x!);",
	} {
		sf := sourcescan.Parse("a.ts", source, core.ScriptKindTS)
		if got := tsutil.PrintNode(sf.Statements.Nodes[0]); got != want {
			t.Errorf("PrintNode(%q) = %q, want %q", source, got, want)
		}
	}
}

func TestCollectStartedWorkflows(t *testing.T) {
	sf := sourcescan.Parse("a.ts", `async () => {
	await rpc.startWorkflow('literal', {})
	await rpc!.startWorkflow(name as any, {})
	await wire.rpc.startWorkflow(`+"`tpl`"+`, {})
	await republish(rpc, x)
	await provision({ rpc })
	await other({ rpc: wire.rpc })
	await workflowService.run(x, rpc)
	await unrelated(x)
}`, core.ScriptKindTS)
	got := tsutil.CollectStartedWorkflows(sf.Statements.Nodes[0])
	if !slices.Equal(got.Names, []string{"literal", "tpl"}) {
		t.Errorf("Names = %q", got.Names)
	}
	if !slices.Equal(got.Dynamic, []string{"rpc!.startWorkflow(name as any, {})"}) {
		t.Errorf("Dynamic = %q", got.Dynamic)
	}
	if !slices.Equal(got.RpcHandoffs, []string{"other", "provision", "republish"}) {
		t.Errorf("RpcHandoffs = %q", got.RpcHandoffs)
	}
}

func TestCollectInvokedRpcNames(t *testing.T) {
	sf := sourcescan.Parse("a.ts", `async () => {
	await rpc.invoke('a', {})
	await rpc!.remote(name, {})
	await other.invoke(name, {})
}`, core.ScriptKindTS)
	got := tsutil.CollectInvokedRpcNames(sf.Statements.Nodes[0])
	if !slices.Equal(got.Names, []string{"a"}) || !slices.Equal(got.Dynamic, []string{"rpc!.remote(name, {})"}) {
		t.Errorf("got %+v", got)
	}
}
