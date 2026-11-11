//! Port of Go `finalize/workflows.go`: validateWorkflowGraphAddons
//! (post-process.ts), validateSingleStepWorkflows
//! (validate-single-step-workflows.ts) and validateSchemaWiringSeparation
//! (post-process.ts).

use std::collections::HashSet;

use super::jsval::{OrderedSet, V};
use super::jv;
use crate::diag::{codes, Level, Logger};
use crate::state::State;

fn graph_nodes(graph: &V) -> Vec<V> {
    let nodes = graph.get("nodes");
    if !nodes.is_obj() {
        return vec![];
    }
    nodes.keys().iter().map(|k| nodes.get(k)).collect()
}

fn s(v: &V) -> String {
    v.as_str().unwrap_or("").to_string()
}

pub fn validate_workflow_graph_addons(log: &mut Logger, st: &State) {
    let wired = st.rpc.wire_addon_declarations.iter().any(|(_, r)| jv(r).get("package").is_str("@pikku/addon-graph"));
    if wired {
        return;
    }
    for (name, r) in st.workflows.graph_meta.iter() {
        for n in graph_nodes(&jv(r)) {
            let rpc = n.get("rpcName");
            let Some(rpc_name) = rpc.as_str() else { continue };
            if !rpc_name.starts_with("graph:") {
                continue;
            }
            if st.functions.meta.get(rpc_name).is_some() {
                continue;
            }
            log.critical(
                codes::WORKFLOW_GRAPH_ADDON_NOT_WIRED,
                format!(
                    "Workflow graph '{name}' references '{rpc_name}' but @pikku/addon-graph is not wired. Enable \"scaffold\": {{ \"graph\": true }} in pikku.config.json (and install @pikku/addon-graph), or wire it manually with wireAddon({{ name: 'graph', package: '@pikku/addon-graph' }})."
                ),
            );
        }
    }
}

fn is_durable_flow(f: &str) -> bool {
    matches!(f, "sleep" | "suspend" | "approval" | "parallel" | "fanout")
}

pub fn validate_single_step_workflows(log: &mut Logger, st: &State) {
    for (name, r) in st.workflows.graph_meta.iter() {
        let g = jv(r);
        if g.get("source").is_str("scenario") {
            continue;
        }
        let mut file = String::new();
        if let Some(f) = st.workflows.files.get(&s(&g.get("pikkuFuncId"))) {
            file = f.path.clone();
        }
        if file.is_empty() {
            if let Some(f) = st.workflows.graph_files.get(name) {
                file = f.path.clone();
            }
        }
        if file.is_empty() {
            continue;
        }
        let mut rpc_steps = 0;
        let mut durable = false;
        for n in graph_nodes(&g) {
            if n.get("rpcName").truthy() {
                rpc_steps += 1;
            }
            if let Some(flow) = n.get("flow").as_str() {
                if is_durable_flow(flow) {
                    durable = true;
                }
            }
        }
        if rpc_steps > 1 || durable {
            continue;
        }
        let runs = if rpc_steps == 0 { "no RPC step" } else { "a single RPC step" };
        log.diagnostic(
            Level::Warn,
            codes::SINGLE_STEP_WORKFLOW,
            format!(
                "Workflow '{name}' ({file}) runs {runs} and never sleeps, suspends or fans out, so it buys nothing a workflow is for. Call the function directly, or enqueue it on a queue worker if it must survive a restart."
            ),
        );
    }
}

pub fn validate_schema_wiring_separation(log: &mut Logger, st: &State) {
    let mut schema_files = OrderedSet::default();
    for (_, r) in st.schema_lookup.iter() {
        schema_files.add(r.source_file.clone());
    }
    let mut wiring_files: HashSet<String> = st.http.files.values().map(String::from).collect();
    let groups = st.http.route_middleware.iter().chain(st.middleware.tag_middleware.iter());
    for (_, g) in groups {
        wiring_files.insert(g.source_file.clone());
        for reg in &g.additional_registrations {
            wiring_files.insert(reg.source_file.clone());
        }
    }
    for file in &schema_files.items {
        if !wiring_files.contains(file) {
            continue;
        }
        let schemas: Vec<&str> = st.schema_lookup.iter().filter(|(_, r)| &r.source_file == file).map(|(n, _)| n).collect();
        log.critical(
            codes::SCHEMA_AND_WIRING_COLOCATED,
            format!(
                "File '{file}' contains both Zod schemas ({}) and wiring calls (wireHTTPRoutes, addPermission, etc.). These must be in separate files because the CLI imports schema files at runtime, which triggers wiring side-effects that crash without server context. Move the route/wiring definitions to a dedicated wiring file.",
                schemas.join(", ")
            ),
        );
    }
}
