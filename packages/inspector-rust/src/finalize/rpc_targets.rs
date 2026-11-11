//! Port of Go `finalize/rpc_targets.go`: a function whose `invokes` or
//! `startsWorkflows` names something that does not exist is refused (PKU944).

use crate::diag::{Logger, codes};
use crate::protocol::Options;
use crate::state::State;

pub fn validate_rpc_targets(log: &mut Logger, st: &State, opts: &Options) {
    // An addon package is not checked: what it invokes may be provided by the
    // app that wires it, and its namespaces are aliases the app maps.
    if opts.is_addon {
        return;
    }
    let plain = |name: &str| -> bool {
        let known = |n: &str| {
            st.functions.meta.has(n)
                || st.rpc.internal_meta.has(n)
                || st.rpc.exposed_meta.has(n)
                || st.rpc.remote_meta.has(n)
                || st.workflows.meta.has(n)
                || st.workflows.graph_meta.has(n)
        };
        if known(name) {
            return true;
        }
        match name.find('@') {
            Some(i) if i > 0 => {
                let base = &name[..i];
                st.functions.meta.has(base)
                    || st.rpc.internal_meta.has(base)
                    || st.rpc.exposed_meta.has(base)
                    || st.workflows.meta.has(base)
            }
            _ => false,
        }
    };
    let workflow = |name: &str| st.workflows.meta.has(name) || st.workflows.graph_meta.has(name);
    // True when the namespaced name is missing, false when it resolves or cannot be checked.
    let namespaced_missing = |name: &str, is_workflow: bool| -> bool {
        let Some(i) = name.find(':').filter(|i| *i > 0) else { return true };
        let (ns, func) = (&name[..i], &name[i + 1..]);
        let mut available = false;
        let remote = st.remote_addon_functions.as_ref();
        for rec in [Some(&st.addon_functions), remote].into_iter().flatten() {
            if let Some(funcs) = rec.get(ns) {
                available = true;
                if funcs.has(func) {
                    return false;
                }
            }
        }
        if available {
            return !is_workflow; // an addon's workflows are not in its function meta
        }
        !st.rpc.wire_addon_declarations.has(ns)
    };
    for (id, m) in st.functions.meta.iter() {
        for name in &m.invokes {
            if plain(name) || !namespaced_missing(name, false) {
                continue;
            }
            log.critical(codes::RPC_TARGET_NOT_FOUND, format!(
                "• {id} invokes '{name}', but no function, workflow or wired addon function has that name. The call would fail at run time. Fix the name, or wire the addon that provides it."
            ));
        }
        for name in &m.starts_workflows {
            if workflow(name) || !namespaced_missing(name, true) {
                continue;
            }
            log.critical(codes::RPC_TARGET_NOT_FOUND, format!(
                "• {id} starts workflow '{name}', but no workflow has that name. The call would fail at run time. Fix the name, or wire the addon that provides it."
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{FunctionMeta, Raw, Record};
    use serde_json::json;

    #[test]
    fn refuses_missing_targets() {
        let mut st = State::default();
        st.functions.meta.set("exists", FunctionMeta::default());
        let mut caller = FunctionMeta::default();
        caller.fields.invokes = ["exists", "viaRpcName", "flow", "stripe:charge", "stripe:refund", "slack:post", "ghost:run", "nope", "exists@v2"]
            .map(String::from)
            .to_vec();
        caller.fields.starts_workflows = ["flow", "missingFlow", "stripe:anything"].map(String::from).to_vec();
        st.functions.meta.set("caller", caller);
        st.rpc.internal_meta.set("viaRpcName", "exists".to_string());
        st.workflows.meta.set("flow", Raw::of(json!({})));
        let mut charges = Record::default();
        charges.set("charge", FunctionMeta::default());
        st.addon_functions.set("stripe", charges);
        st.rpc.wire_addon_declarations.set("slack", Raw::of(json!({ "package": "@x/slack" })));

        let mut log = Logger::new();
        validate_rpc_targets(&mut log, &st, &Options::default());
        let got: Vec<String> = log.entries().iter().map(|d| d.message.clone()).collect();
        let want = [
            "\u{2022} caller invokes 'stripe:refund', but",
            "\u{2022} caller invokes 'ghost:run', but",
            "\u{2022} caller invokes 'nope', but",
            "\u{2022} caller starts workflow 'missingFlow', but",
        ];
        assert_eq!(got.len(), want.len());
        for (g, w) in got.iter().zip(want) {
            assert!(g.starts_with(w), "{g}");
        }
        let mut log = Logger::new();
        validate_rpc_targets(&mut log, &st, &Options { is_addon: true, ..Default::default() });
        assert_eq!(log.entries().len(), 0);
    }
}
