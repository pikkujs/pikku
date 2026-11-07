//! Port of Go `internal/analyze/workflow_test.go`: the workflow extractors on
//! small projects, with Go's own expected metas.

use pikku_inspect::analyze;
use pikku_inspect::protocol::{Allow, Options, Request, Response};

const PRELUDE: &str = "declare const pikkuWorkflowFunc: any
declare const pikkuWorkflowComplexFunc: any
declare const pikkuWorkflowGraph: any
declare class WorkflowCancelledException { constructor(reason: string) }
";

fn run_project(name: &str, src: &str, allow_complex: bool) -> Response {
    let dir = std::env::temp_dir().join(format!("pikku-inspect-rs-wf-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("tsconfig.json"),
        r#"{"compilerOptions":{"strict":true,"module":"nodenext","target":"esnext"},"include":["*.ts"]}"#,
    )
    .unwrap();
    std::fs::write(dir.join("wf.ts"), format!("{PRELUDE}{src}")).unwrap();
    let dir = dir.canonicalize().unwrap();
    let mut opts = Options {
        tsconfig: dir.join("tsconfig.json").to_string_lossy().to_string(),
        root_dir: dir.to_string_lossy().to_string(),
        ..Default::default()
    };
    if allow_complex {
        opts.allow = Some(Allow { complex_workflows: true, ..Default::default() });
    }
    let req = Request { route_files: vec![dir.join("wf.ts").to_string_lossy().to_string()], options: opts, changed_files: vec![] };
    let res = analyze::run(&req, None).unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    res
}

fn meta_json(res: &Response, name: &str) -> String {
    let state = res.state.as_ref().unwrap();
    match state.workflows.meta.get(name) {
        Some(raw) => pikku_inspect::jsjson::to_string(raw).unwrap(),
        None => panic!("no workflow meta for {name}; diagnostics: {:?}", res.diagnostics),
    }
}

fn diagnostics_text(res: &Response) -> String {
    let mut out = String::new();
    for d in &res.diagnostics {
        out.push_str(d.code.as_deref().unwrap_or(""));
        out.push(' ');
        out.push_str(&d.message);
        out.push('\n');
    }
    out
}

#[test]
fn dsl_workflow_steps() {
    let res = run_project(
        "steps",
        "
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
      workflow.do('b', 'stepB', { msg: `hi ${data.name}` }),
    ])
    for (const id of data.ids) {
      await workflow.do('per id', 'handleId', { id })
      await workflow.sleep('gap', 500)
    }
    attempts = 2
    return { user, a }
  },
})
",
        false,
    );
    let want = concat!(
        r#"{"pikkuFuncId":"onboard","name":"onboard","steps":["#,
        r#"{"type":"rpc","stepName":"create user","rpcName":"createUser","outputVar":"user","inputs":{"email":{"from":"input","path":"email"},"res":{"from":"literal","value":"r1"}}},"#,
        r#"{"type":"branch","branches":[{"condition":{"type":"and","conditions":[{"type":"simple","expression":"user.active"},{"type":"simple","expression":"data.notify"}]},"steps":[{"type":"rpc","stepName":"notify","rpcName":"sendEmail","inputs":{"to":{"from":"outputVar","name":"user","path":"email"}},"options":{"retries":3}}]}],"elseSteps":[{"type":"sleep","stepName":"wait","duration":"1h"}]},"#,
        r#"{"type":"parallel","children":[{"type":"rpc","stepName":"a","rpcName":"stepA","outputVar":"a","inputs":"passthrough"},{"type":"rpc","stepName":"b","rpcName":"stepB","outputVar":"b","inputs":{"msg":{"from":"template","parts":["hi ",""],"expressions":[{"from":"input","path":"name"}]}}}]},"#,
        r#"{"type":"fanout","sourceVar":"data.ids","itemVar":"id","mode":"sequential","body":[{"type":"rpc","stepName":"per id","rpcName":"handleId","inputs":{"id":{"from":"item","path":"id"}}},{"type":"sleep","stepName":"gap","duration":500}],"timeBetween":"500ms"},"#,
        r#"{"type":"set","variable":"attempts","value":2},"#,
        r#"{"type":"return","outputs":{"user":{"from":"outputVar","name":"user"},"a":{"from":"outputVar","name":"a"}}}"#,
        r#"],"context":{"attempts":{"type":"number","default":0}},"dsl":true,"title":"Onboard","expose":null}"#,
    );
    assert_eq!(meta_json(&res, "onboard"), want);
    let st = res.state.as_ref().unwrap();
    for rpc in ["createUser", "sendEmail", "stepA", "stepB", "handleId"] {
        assert!(st.rpc.invoked_functions.has(rpc), "{rpc} not recorded as invoked");
    }
}

#[test]
fn dsl_workflow_rejections() {
    let res = run_project(
        "reject",
        "
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
",
        false,
    );
    let got = diagnostics_text(&res);
    for want in [
        "PKU641 Workflow 'loops' does not conform to DSL workflow rules:\n- Statement type 'WhileStatement' is not allowed in DSL workflows. Allowed: const/let, if/else, switch/case, for..of, return, throw, and workflow calls. If this should be supported, please report the node type: WhileStatement\n",
        "PKU641 Workflow 'inline' does not conform to DSL workflow rules:\n- Inline workflow.do with function argument is not allowed in DSL workflows. Use pikkuWorkflowComplexFunc instead.",
        "PKU643 'pikkuWorkflowComplexFunc' is used here, but this project has not enabled complex workflows.",
    ] {
        assert!(got.contains(want), "missing diagnostic {want:?} in:\n{got}");
    }
    assert!(
        res.state.as_ref().unwrap().rpc.invoked_functions.has("y"),
        "an invalid DSL workflow still records the functions it invokes"
    );
}

#[test]
fn complex_workflow_falls_back() {
    let res = run_project(
        "complex",
        "
export const complex = pikkuWorkflowComplexFunc(async ({}: any, data: any, { workflow }: any) => {
  await workflow.do('inline', async () => 1, { description: 'compute' })
  while (data.more) {
    await workflow.do('poll', 'pollIt', data)
  }
  await workflow.sleep('nap', 1000)
})
",
        true,
    );
    let want = r#"{"pikkuFuncId":"complex","name":"complex","steps":[{"type":"inline","stepName":"inline","description":"<dynamic>"},{"type":"rpc","stepName":"poll","rpcName":"pollIt"},{"type":"sleep","stepName":"nap","duration":1000}],"dsl":false}"#;
    assert_eq!(meta_json(&res, "complex"), want);
}

#[test]
fn workflow_graph() {
    let res = run_project(
        "graph",
        "
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
",
        false,
    );
    let st = res.state.as_ref().unwrap();
    let raw = st.workflows.graph_meta.get("review").unwrap_or_else(|| panic!("no graph meta: {}", diagnostics_text(&res)));
    let want = concat!(
        r#"{"name":"review","pikkuFuncId":"review","source":"graph","description":"Review","nodes":{"#,
        r#""fetch":{"nodeId":"fetch","rpcName":"fetchRows","input":{},"next":["notify","audit"],"retries":2},"#,
        r#""notify":{"nodeId":"notify","rpcName":"sendNote","input":{"rows":{"$ref":"fetch","path":"rows"},"text":{"$template":{"parts":["n="," x=",""],"expressions":[{"$ref":"fetch","path":"count"},{"$ref":"unknown"}]}},"limit":-5},"forEach":{"$ref":"fetch","path":"rows"}},"#,
        r#""audit":{"nodeId":"audit","rpcName":"writeAudit","input":{}}},"entryNodeIds":["fetch"]}"#,
    );
    assert_eq!(pikku_inspect::jsjson::to_string(raw).unwrap(), want);
    assert_eq!(st.workflows.graph_files.get("review").unwrap().exported_name, "review");
    assert!(st.rpc.invoked_functions.has("writeAudit"), "graph nodes are invoked functions");
}

/// A wide DSL / complex / scenario / graph fixture whose expected output is
/// the Go inspector's own end-to-end output (`inspector-parity/fixtures/workflow_edge/golden.json`,
/// key order included; analysis then finalize, as `--stdin` runs).
#[test]
fn workflow_edge_fixture_matches_go() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../inspector-parity/fixtures/workflow_edge").canonicalize().unwrap();
    let root = dir.to_string_lossy().to_string();
    let req = Request {
        route_files: vec![dir.join("wf.ts").to_string_lossy().to_string()],
        options: Options {
            tsconfig: dir.join("tsconfig.json").to_string_lossy().to_string(),
            root_dir: root.clone(),
            allow: Some(Allow { complex_workflows: true, ..Default::default() }),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let mut res = analyze::run(&req, None).unwrap();
    pikku_inspect::finalize::response(&mut res, &req.options).unwrap();
    let st = res.state.as_ref().unwrap();
    let enc = |v: &dyn erased::Ser| v.to_json().replace(&root, "<root>");
    let golden: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("golden.json")).unwrap()).unwrap();
    let text = |v: &serde_json::Value| pikku_inspect::jsjson::to_string(v).unwrap();
    assert_eq!(enc(&st.workflows), text(&golden["workflows"]), "state.workflows");
    assert_eq!(enc(&st.rpc.invoked_functions), text(&golden["invokedFunctions"]), "rpc.invokedFunctions");
    let diags: Vec<_> = res
        .diagnostics
        .iter()
        .filter(|d| matches!(d.code.as_deref(), Some("PKU641" | "PKU643" | "PKU675" | "PKU679")))
        .collect();
    assert_eq!(enc(&diags), text(&golden["diagnostics"]), "diagnostics");
}

mod erased {
    pub trait Ser {
        fn to_json(&self) -> String;
    }
    impl<T: serde::Serialize> Ser for T {
        fn to_json(&self) -> String {
            pikku_inspect::jsjson::to_string(self).unwrap()
        }
    }
}
