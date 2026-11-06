//! Unit coverage for the post-sweep validators (validate.go,
//! check_disabled.go): the messages are Go's, and the refusals are asserted as
//! well as the happy path.

use pikku_inspect::diag::Logger;
use pikku_inspect::program::{self, Options as ProgramOptions};
use pikku_inspect::state::{DisabledFunctionMeta, FunctionMeta, Raw, State};
use pikku_inspect::tsutil::walk;
use pikku_inspect::visit::{Context, Options};
use tsrs_ast::Kind;

fn raw(s: &str) -> Raw {
    Raw::of(serde_json::from_str(s).unwrap())
}

/// A context over a one-file program; `source` lets a test parse an object literal.
fn with_context(source: &str, f: impl FnOnce(&mut Context<'_>, Vec<tsrs_core::P<tsrs_ast::Node>>)) -> Logger {
    let dir = std::env::temp_dir().join(format!("pikku-rs-validators-{}-{}", std::process::id(), source.len()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("a.ts");
    std::fs::write(&file, source).unwrap();
    let mut p = program::create(
        &ProgramOptions { route_files: vec![file.to_string_lossy().into_owned()], ..Default::default() },
        None,
    )
    .unwrap();
    let files = p.project_files.clone();
    let mut objects = Vec::new();
    for sf in &files {
        walk(sf.as_node(), &mut |n| {
            if n.kind() == Kind::ObjectLiteralExpression {
                objects.push(n);
            }
        });
    }
    let mut state = State::default();
    state.root_dir = dir.to_string_lossy().into_owned();
    let mut log = Logger::new();
    {
        let mut ctx = Context::new(p.checker(), &mut state, &mut log, Options::default());
        f(&mut ctx, objects);
    }
    log
}

fn messages(log: &Logger) -> Vec<String> {
    log.entries().into_iter().map(|d| d.message).collect()
}

#[test]
fn webhook_source_triggers_refuse_undeclared_events_and_plain_receivers() {
    let log = with_context("export {}", |ctx, _| {
        ctx.state.triggers.webhook_source_meta = Some(Default::default());
        let wsm = ctx.state.triggers.webhook_source_meta.as_mut().unwrap();
        wsm.set("shop", raw(r#"{"name":"shop","receive":"recv","events":["order.paid","order.refunded"]}"#));
        wsm.set("open", raw(r#"{"name":"open","events":[]}"#));
        let mut recv = FunctionMeta::default();
        recv.func_wrapper = "pikkuFunc".into();
        ctx.state.functions.meta.set("recv", recv);
        ctx.state.triggers.meta.set("shop:order.paid", Default::default());
        ctx.state.triggers.meta.set("shop:order.cancelled", Default::default());
        ctx.state.triggers.meta.set("open:anything", Default::default());
        ctx.state.triggers.meta.set("unknown:x", Default::default());
        ctx.state.triggers.meta.set("no-colon", Default::default());
        ctx.validate_webhook_source_triggers();
    });
    assert_eq!(
        messages(&log),
        [
            "Webhook source 'shop' receives with 'recv', a pikkuFunc. Declare it with pikkuWebhookReceive so it is never callable as an RPC.",
            "Trigger 'shop:order.cancelled' listens for 'order.cancelled', which webhook source 'shop' does not declare. Declared: order.paid, order.refunded.",
        ]
    );
    // A receiver declared with pikkuWebhookReceive is accepted.
    let log = with_context("export {}", |ctx, _| {
        ctx.state.triggers.webhook_source_meta = Some(Default::default());
        ctx.state.triggers.webhook_source_meta.as_mut().unwrap().set("shop", raw(r#"{"name":"shop","receive":"recv"}"#));
        let mut recv = FunctionMeta::default();
        recv.func_wrapper = "pikkuWebhookReceive".into();
        recv.webhook_receive = Some(true);
        ctx.state.functions.meta.set("recv", recv);
        ctx.validate_webhook_source_triggers();
    });
    assert!(messages(&log).is_empty());
}

#[test]
fn disabled_workflow_steps_are_reported_per_workflow_in_name_order() {
    let log = with_context("export {}", |ctx, _| {
        ctx.state.functions.disabled = Some(Default::default());
        let d = ctx.state.functions.disabled.as_mut().unwrap();
        d.set("old", DisabledFunctionMeta { name: "old".into(), source_file: format!("{}/src/old.ts", ctx.root_dir), exported_name: String::new(), reason: "retired".into() });
        d.set("gone", DisabledFunctionMeta { name: "gone".into(), source_file: format!("{}/src/gone.ts", ctx.root_dir), exported_name: String::new(), reason: String::new() });
        ctx.state.workflows.meta.set("flow", raw(r#"{"steps":[{"rpcName":"old"},{"nested":{"rpcName":"gone"}},{"rpcName":"fine"},{"rpcName":7}]}"#));
        ctx.state.workflows.graph_meta.set("graph", raw(r#"{"nodes":{"a":{"rpcName":"old"}}}"#));
        ctx.check_disabled_workflow_steps();
    });
    assert_eq!(
        messages(&log),
        [
            "'gone' is disabled in src/gone.ts, but workflow 'flow' calls it as a step. Remove the step, or remove `disabled`.",
            "'old' is disabled (retired) in src/old.ts, but workflow 'flow' calls it as a step. Remove the step, or remove `disabled`.",
            "'old' is disabled (retired) in src/old.ts, but workflow graph 'graph' calls it as a step. Remove the step, or remove `disabled`.",
        ]
    );
    // Nothing disabled: nothing to check.
    let log = with_context("export {}", |ctx, _| {
        ctx.state.workflows.meta.set("flow", raw(r#"{"steps":[{"rpcName":"old"}]}"#));
        ctx.check_disabled_workflow_steps();
    });
    assert!(messages(&log).is_empty());
}

#[test]
fn function_disabled_reads_true_false_reasons_and_refuses_the_rest() {
    let src = "export const a = { disabled: true }; export const b = { disabled: 'why' }; export const c = { disabled: false }; \
               export const d = { disabled: someFlag }; export const e = { disabled: '' }; export const f = { x: 1 };";
    let mut got: Vec<Option<String>> = Vec::new();
    let log = with_context(src, |ctx, objects| {
        for (i, o) in objects.iter().enumerate() {
            got.push(ctx.read_function_disabled(*o, &format!("fn{i}")));
        }
    });
    assert_eq!(
        got,
        [Some(String::new()), Some("why".into()), None, Some(String::new()), Some(String::new()), None]
    );
    assert_eq!(
        messages(&log),
        [
            "'fn3' has a `disabled` the build cannot read. Use `true` or a non-empty string literal.",
            "'fn4' has a `disabled` the build cannot read. Use `true` or a non-empty string literal.",
        ]
    );
}
