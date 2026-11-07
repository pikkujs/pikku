//! Port of Go `finalize/finalize_workflows.go`
//! (utils/workflow/graph/finalize-workflows.ts).

use super::contracts::{format_versioned_id, is_versioned_id, parse_versioned_id};
use super::convert_dsl_to_graph::{convert_dsl_to_graph, derive_workflow_plan, steps_of};
use super::hash::{canonical_json, hash_string};
use super::jsval::V;
use super::jv;
use crate::state::{Raw, State};

/// Converts every DSL workflow to a graph, stamps rpc versions and step
/// hashes, hashes the graph, and hashes graph workflows that were declared as
/// graphs.
pub fn finalize_workflows(st: &mut State) {
    let metas: Vec<(String, V)> = st.workflows.meta.iter().map(|(k, r)| (k.to_string(), jv(r))).collect();
    for (name, v) in metas {
        let meta = if v.is_obj() { v } else { V::obj() };
        let graph = convert_dsl_to_graph(&name, &meta);
        stamp_versions_on_graph(&graph, st);
        compute_step_hashes(&graph, st);
        graph.set("graphHash", V::str(compute_graph_hash(&graph)));
        if graph.get("source").is_str("dsl") {
            let (deterministic, planned) = derive_workflow_plan(&steps_of(&meta.get("steps")));
            graph.set("deterministic", V::Bool(deterministic));
            if !planned.is_empty() {
                graph.set("plannedSteps", V::arr(planned));
            }
        }
        st.workflows.graph_meta.set(name.as_str(), Raw::of(graph.to_json()));
    }
    let names: Vec<String> = st.workflows.graph_meta.keys().into_iter().map(String::from).collect();
    for name in names {
        let graph = jv(st.workflows.graph_meta.get(&name).unwrap());
        if !graph.is_obj() || graph.get("graphHash").truthy() {
            continue;
        }
        stamp_versions_on_graph(&graph, st);
        compute_step_hashes(&graph, st);
        graph.set("graphHash", V::str(compute_graph_hash(&graph)));
        st.workflows.graph_meta.set(name.as_str(), Raw::of(graph.to_json()));
    }
}

fn graph_node_objects(graph: &V) -> Vec<V> {
    let nodes = graph.get("nodes");
    nodes.keys().iter().map(|k| nodes.get(k)).filter(V::is_obj).collect()
}

fn stamp_versions_on_graph(graph: &V, st: &State) {
    for node in graph_node_objects(graph) {
        let rpc = node.get("rpcName");
        let Some(rpc) = rpc.as_str() else { continue };
        if is_versioned_id(rpc) {
            continue;
        }
        if let Some(version) = st.functions.meta.get(rpc).and_then(|m| m.version) {
            node.set("rpcName", V::str(format_versioned_id(rpc, version)));
        } else {
            let latest = find_latest_version(rpc, st);
            if latest > 0 {
                node.set("rpcName", V::str(format_versioned_id(rpc, latest)));
            }
        }
    }
}

fn find_latest_version(base: &str, st: &State) -> i64 {
    let mut max = 0;
    for id in st.functions.meta.keys() {
        let (b, v) = parse_versioned_id(id);
        if let Some(v) = v {
            if b == base && v > max {
                max = v;
            }
        }
    }
    max
}

fn compute_step_hashes(graph: &V, st: &State) {
    for node in graph_node_objects(graph) {
        let rpc = node.get("rpcName");
        let Some(rpc) = rpc.as_str() else { continue };
        let mut meta = st.functions.meta.get(rpc);
        if meta.is_none() {
            let (base, _) = parse_versioned_id(rpc);
            meta = st.functions.meta.get(&base);
        }
        let hash = meta.map(|m| m.contract_hash.clone()).unwrap_or_default();
        node.set("stepHash", V::str(hash_string(&format!("{}:{hash}", node.get("nodeId").template_string()), 12)));
    }
}

/// `computeGraphHash`: the topology hash, without notes.
pub fn compute_graph_hash(graph: &V) -> String {
    let nodes = graph.get("nodes");
    let for_hash = V::obj();
    for k in nodes.keys() {
        let mut n = nodes.get(&k);
        if n.is_obj() {
            let c = n.shallow_clone();
            c.delete("notes");
            n = c;
        }
        for_hash.set(&k, n);
    }
    hash_string(
        &canonical_json(&V::of(vec![
            ("source", graph.get("source")),
            ("context", graph.get("context")),
            ("nodes", for_hash),
            ("entryNodeIds", graph.get("entryNodeIds")),
        ])),
        12,
    )
}
