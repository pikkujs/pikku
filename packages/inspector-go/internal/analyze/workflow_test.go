package analyze

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

const workflowPrelude = `declare const pikkuWorkflowFunc: any
declare const pikkuWorkflowComplexFunc: any
declare const pikkuWorkflowGraph: any
declare class WorkflowCancelledException { constructor(reason: string) }
`

func runWorkflowProject(t *testing.T, src string, allowComplex bool) *protocol.Response {
	t.Helper()
	dir := t.TempDir()
	files := map[string]string{
		"tsconfig.json": `{"compilerOptions":{"strict":true,"module":"nodenext","target":"esnext"},"include":["*.ts"]}`,
		"wf.ts":         workflowPrelude + src,
	}
	for name, text := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	opts := protocol.Options{Tsconfig: filepath.Join(dir, "tsconfig.json"), RootDir: dir}
	if allowComplex {
		opts.Allow = &protocol.Allow{ComplexWorkflows: true}
	}
	res, err := Run(protocol.Request{RouteFiles: []string{filepath.Join(dir, "wf.ts")}, Options: opts}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func workflowMeta(t *testing.T, res *protocol.Response, name string) string {
	t.Helper()
	raw, ok := res.State.Workflows.Meta.Get(name)
	if !ok {
		t.Fatalf("no workflow meta for %s; diagnostics: %+v", name, res.Diagnostics)
	}
	return string(raw)
}

func TestDSLWorkflowSteps(t *testing.T) {
	res := runWorkflowProject(t, `
const RESOURCE = 'r1'
export const onboard = pikkuWorkflowFunc({
  title: 'Onboard',
  func: async ({}: any, data: any, { workflow }: any) => {
    let attempts = 0
    const user = await workflow.do('create user', 'createUser', { email: data.email, res: RESOURCE })
    if (user.active && data.notify) {
      await workflow.do('notify', 'sendEmail', { to: user.email }, { retries: 3 })
    } else {
      await workflow.sleep('wait', '1h')
    }
    const [a, b] = await Promise.all([
      workflow.do('a', 'stepA', data),
      workflow.do('b', 'stepB', { msg: `+"`hi ${data.name}`"+` }),
    ])
    for (const id of data.ids) {
      await workflow.do('per id', 'handleId', { id })
      await workflow.sleep('gap', 500)
    }
    attempts = 2
    return { user, a }
  },
})
`, false)
	got := workflowMeta(t, res, "onboard")
	want := `{"pikkuFuncId":"onboard","name":"onboard","steps":[` +
		`{"type":"rpc","stepName":"create user","rpcName":"createUser","outputVar":"user","inputs":{"email":{"from":"input","path":"email"},"res":{"from":"literal","value":"r1"}}},` +
		`{"type":"branch","branches":[{"condition":{"type":"and","conditions":[{"type":"simple","expression":"user.active"},{"type":"simple","expression":"data.notify"}]},"steps":[{"type":"rpc","stepName":"notify","rpcName":"sendEmail","inputs":{"to":{"from":"outputVar","name":"user","path":"email"}},"options":{"retries":3}}]}],"elseSteps":[{"type":"sleep","stepName":"wait","duration":"1h"}]},` +
		`{"type":"parallel","children":[{"type":"rpc","stepName":"a","rpcName":"stepA","outputVar":"a","inputs":"passthrough"},{"type":"rpc","stepName":"b","rpcName":"stepB","outputVar":"b","inputs":{"msg":{"from":"template","parts":["hi ",""],"expressions":[{"from":"input","path":"name"}]}}}]},` +
		`{"type":"fanout","sourceVar":"data.ids","itemVar":"id","mode":"sequential","body":[{"type":"rpc","stepName":"per id","rpcName":"handleId","inputs":{"id":{"from":"item","path":"id"}}},{"type":"sleep","stepName":"gap","duration":500}],"timeBetween":"500ms"},` +
		`{"type":"set","variable":"attempts","value":2},` +
		`{"type":"return","outputs":{"user":{"from":"outputVar","name":"user"},"a":{"from":"outputVar","name":"a"}}}` +
		`],"context":{"attempts":{"type":"number","default":0}},"dsl":true,"title":"Onboard","expose":null}`
	if got != want {
		t.Errorf("meta mismatch\n got: %s\nwant: %s", got, want)
	}
	for _, rpc := range []string{"createUser", "sendEmail", "stepA", "stepB", "handleId"} {
		if !res.State.RPC.InvokedFunctions.Has(rpc) {
			t.Errorf("%s not recorded as invoked", rpc)
		}
	}
}

func diagnosticsText(res *protocol.Response) string {
	var b strings.Builder
	for _, d := range res.Diagnostics {
		b.WriteString(string(d.Code) + " " + d.Message + "\n")
	}
	return b.String()
}

func TestDSLWorkflowRejections(t *testing.T) {
	res := runWorkflowProject(t, `
export const loops = pikkuWorkflowFunc(async ({}: any, data: any, { workflow }: any) => {
  while (data.x) {}
  workflow.do('x', 'y', data)
})
export const inline = pikkuWorkflowFunc(async ({}: any, data: any, { workflow }: any) => {
  await workflow.do('x', async () => 1)
})
export const complex = pikkuWorkflowComplexFunc(async ({}: any, data: any, { workflow }: any) => {
  await workflow.do('x', 'y', data)
})
`, false)
	got := diagnosticsText(res)
	for _, want := range []string{
		"PKU641 Workflow 'loops' does not conform to DSL workflow rules:\n- Statement type 'WhileStatement' is not allowed in DSL workflows. Allowed: const/let, if/else, switch/case, for..of, return, throw, and workflow calls. If this should be supported, please report the node type: WhileStatement\n",
		"PKU641 Workflow 'inline' does not conform to DSL workflow rules:\n- Inline workflow.do with function argument is not allowed in DSL workflows. Use pikkuWorkflowComplexFunc instead.",
		"PKU643 'pikkuWorkflowComplexFunc' is used here, but this project has not enabled complex workflows.",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing diagnostic %q in:\n%s", want, got)
		}
	}
	if !res.State.RPC.InvokedFunctions.Has("y") {
		t.Error("an invalid DSL workflow still records the functions it invokes")
	}
}

func TestComplexWorkflowFallsBack(t *testing.T) {
	res := runWorkflowProject(t, `
export const complex = pikkuWorkflowComplexFunc(async ({}: any, data: any, { workflow }: any) => {
  await workflow.do('inline', async () => 1, { description: 'compute' })
  while (data.more) {
    await workflow.do('poll', 'pollIt', data)
  }
  await workflow.sleep('nap', 1000)
})
`, true)
	got := workflowMeta(t, res, "complex")
	want := `{"pikkuFuncId":"complex","name":"complex","steps":[{"type":"inline","stepName":"inline","description":"<dynamic>"},{"type":"rpc","stepName":"poll","rpcName":"pollIt"},{"type":"sleep","stepName":"nap","duration":1000}],"dsl":false}`
	if got != want {
		t.Errorf("meta mismatch\n got: %s\nwant: %s", got, want)
	}
}

func TestWorkflowGraph(t *testing.T) {
	res := runWorkflowProject(t, `
export const review = pikkuWorkflowGraph({
  description: 'Review',
  nodes: { fetch: 'fetchRows', notify: 'sendNote', audit: 'writeAudit' },
  config: {
    fetch: { next: ['notify', 'audit'], retries: 2 },
    notify: {
      input: (ref: any, template: any) => ({ rows: ref('fetch', 'rows'), text: template('n=$0 x=$1', [ref('fetch', 'count')]), limit: -5 }),
      forEach: (ref: any) => ref('fetch', 'rows'),
    },
  },
})
`, false)
	raw, ok := res.State.Workflows.GraphMeta.Get("review")
	if !ok {
		t.Fatalf("no graph meta: %s", diagnosticsText(res))
	}
	want := `{"name":"review","pikkuFuncId":"review","source":"graph","description":"Review","nodes":{` +
		`"fetch":{"nodeId":"fetch","rpcName":"fetchRows","input":{},"next":["notify","audit"],"retries":2},` +
		`"notify":{"nodeId":"notify","rpcName":"sendNote","input":{"rows":{"$ref":"fetch","path":"rows"},"text":{"$template":{"parts":["n="," x=",""],"expressions":[{"$ref":"fetch","path":"count"},{"$ref":"unknown"}]}},"limit":-5},"forEach":{"$ref":"fetch","path":"rows"}},` +
		`"audit":{"nodeId":"audit","rpcName":"writeAudit","input":{}}},"entryNodeIds":["fetch"]}`
	if string(raw) != want {
		t.Errorf("graph meta mismatch\n got: %s\nwant: %s", raw, want)
	}
	if f, ok := res.State.Workflows.GraphFiles.Get("review"); !ok || f.ExportedName != "review" {
		t.Errorf("graph file %+v", f)
	}
	if !res.State.RPC.InvokedFunctions.Has("writeAudit") {
		t.Error("graph nodes are invoked functions")
	}
}
