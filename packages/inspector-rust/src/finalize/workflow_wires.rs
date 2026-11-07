//! Port of Go `finalize/workflow_wires.go`
//! (utils/workflow/graph/finalize-workflow-wires.ts).

use std::collections::{HashMap, HashSet};

use super::jsval::V;
use super::jv;
use crate::state::{Raw, State};

struct Parsed {
    workflow_name: String,
    start_node: String,
    has_start: bool,
}

fn parse_workflow_func_id(id: &str) -> Option<Parsed> {
    for prefix in ["workflowStart:", "workflow:"] {
        if let Some(rest) = id.strip_prefix(prefix) {
            return Some(Parsed { workflow_name: rest.to_string(), start_node: String::new(), has_start: false });
        }
    }
    if let Some(rest) = id.strip_prefix("graphStart:") {
        if let Some(i) = rest.find(':') {
            return Some(Parsed { workflow_name: rest[..i].to_string(), start_node: rest[i + 1..].to_string(), has_start: true });
        }
    }
    None
}

fn resolve_start_node(p: &Parsed, graph: &V) -> V {
    if p.has_start {
        return V::str(&p.start_node);
    }
    let arr = graph.get("entryNodeIds").items();
    arr.into_iter().next().unwrap_or(V::Undef)
}

/// Decodes workflows.graphMeta entries on demand and writes the touched ones
/// back.
struct GraphSet {
    decoded: HashMap<String, Option<V>>,
    dirty: HashSet<String>,
    graph_meta: Vec<(String, Raw)>,
}

impl GraphSet {
    fn new(st: &State) -> GraphSet {
        GraphSet {
            decoded: HashMap::new(),
            dirty: HashSet::new(),
            graph_meta: st.workflows.graph_meta.iter().map(|(k, r)| (k.to_string(), r.clone())).collect(),
        }
    }

    fn get(&mut self, name: &str) -> Option<V> {
        if let Some(o) = self.decoded.get(name) {
            return o.clone();
        }
        let o = self.graph_meta.iter().find(|(k, _)| k == name).and_then(|(_, raw)| {
            let v = match raw.value() {
                Some(j) => V::from_json(j),
                None => V::Null,
            };
            if v.truthy() && v.is_obj() { Some(v) } else { None }
        });
        self.decoded.insert(name.to_string(), o.clone());
        o
    }

    /// `graphMeta[parsed.workflowName]` for a pikkuFuncId.
    fn lookup(&mut self, func_id: &V) -> Option<(Parsed, V)> {
        let p = parse_workflow_func_id(func_id.as_str().unwrap_or(""))?;
        let graph = self.get(&p.workflow_name)?;
        Some((p, graph))
    }

    fn wires(&mut self, graph: &V) -> V {
        for (name, o) in &self.decoded {
            if o.as_ref().and_then(V::identity) == graph.identity() {
                self.dirty.insert(name.clone());
            }
        }
        if !graph.get("wires").truthy() {
            graph.set("wires", V::obj());
        }
        graph.get("wires")
    }

    fn flush(self, st: &mut State) {
        for (name, _) in &self.graph_meta {
            if self.dirty.contains(name) {
                if let Some(Some(g)) = self.decoded.get(name) {
                    st.workflows.graph_meta.set(name.as_str(), Raw::of(g.to_json()));
                }
            }
        }
    }
}

fn push_to(o: &V, key: &str, v: V) {
    if !o.get(key).truthy() {
        o.set(key, V::arr(vec![]));
    }
    if let V::Arr(a) = o.get(key) {
        a.borrow_mut().push(v);
    } else {
        o.set(key, V::arr(vec![v]));
    }
}

fn sub_object(o: &V, key: &str) -> V {
    if !o.get(key).truthy() {
        o.set(key, V::obj());
    }
    o.get(key)
}

fn record_values<'a, T: serde::Serialize + 'a>(items: impl Iterator<Item = (&'a str, &'a T)>) -> Vec<V> {
    items.map(|(_, v)| jv(v)).map(|v| if v.is_obj() { v } else { V::obj() }).collect()
}

/// `finalizeWorkflowHelperTypes`.
pub fn finalize_workflow_helper_types(st: &mut State) {
    let mut graphs = GraphSet::new(st);
    let keys: Vec<String> = st.functions.meta.keys().into_iter().map(String::from).collect();
    for k in keys {
        let (function_type, func_id) = {
            let m = st.functions.meta.get(&k).unwrap();
            (m.function_type.clone(), m.pikku_func_id.clone())
        };
        if function_type != "helper" || func_id.starts_with("workflowStatus:") {
            continue;
        }
        let Some((p, graph)) = graphs.lookup(&V::str(&func_id)) else { continue };
        let start_id = resolve_start_node(&p, &graph).template_string();
        let nodes = graph.get("nodes");
        let node = nodes.get(&start_id);
        if !node.truthy() || !node.is_obj() || !node.has("rpcName") {
            continue;
        }
        let Some(rpc) = st.functions.meta.get(&node.get("rpcName").template_string()) else { continue };
        let (schema, inputs) = (rpc.input_schema_name.clone(), rpc.inputs.clone());
        let meta = st.functions.meta.get_mut(&k).unwrap();
        if let Some(name) = schema.filter(|s| !s.is_empty()) {
            meta.input_schema_name = Some(name);
        }
        if !inputs.is_empty() {
            meta.inputs = inputs;
        }
    }
}

/// `finalizeWorkflowWires`.
pub fn finalize_workflow_wires(st: &mut State) {
    let mut g = GraphSet::new(st);

    // http
    let mut http: Vec<(String, String, String)> = Vec::new();
    for (method, routes) in st.http.meta.iter() {
        for (route, meta) in routes.iter() {
            http.push((method.to_string(), route.to_string(), meta.pikku_func_id.clone()));
        }
    }
    for (method, route, func_id) in http {
        if let Some((p, graph)) = g.lookup(&V::str(&func_id)) {
            let wires = g.wires(&graph);
            push_to(&wires, "http", V::of(vec![("route", V::str(&route)), ("method", V::str(&method)), ("startNode", resolve_start_node(&p, &graph))]));
        }
    }

    for meta in record_values(st.scheduled_tasks.meta.iter()) {
        if let Some((p, graph)) = g.lookup(&meta.get("pikkuFuncId")) {
            let wires = g.wires(&graph);
            push_to(&wires, "schedule", V::of(vec![("cron", meta.get("schedule")), ("startNode", resolve_start_node(&p, &graph))]));
        }
    }
    for meta in record_values(st.triggers.meta.iter()) {
        if let Some((p, graph)) = g.lookup(&meta.get("pikkuFuncId")) {
            let wires = g.wires(&graph);
            push_to(&wires, "trigger", V::of(vec![("name", meta.get("name")), ("startNode", resolve_start_node(&p, &graph))]));
        }
    }
    for meta in record_values(st.queue_workers.meta.iter()) {
        if let Some((p, graph)) = g.lookup(&meta.get("pikkuFuncId")) {
            let wires = g.wires(&graph);
            push_to(&wires, "queue", V::of(vec![("name", meta.get("name")), ("startNode", resolve_start_node(&p, &graph))]));
        }
    }

    scan_channels(&mut g, record_values(st.channels.meta.iter()));

    let str_of = |v: V| V::str(v.as_str().unwrap_or(""));
    let mcp = |items: Vec<V>, field: &str| -> Vec<(V, V)> { items.iter().map(|m| (m.get("pikkuFuncId"), str_of(m.get(field)))).collect() };
    let tools = mcp(st.mcp_endpoints.tools_meta.iter().map(|(_, m)| jv(m)).collect(), "name");
    let prompts = mcp(st.mcp_endpoints.prompts_meta.iter().map(|(_, m)| jv(m)).collect(), "name");
    let resources = mcp(st.mcp_endpoints.resources_meta.iter().map(|(_, m)| jv(m)).collect(), "uri");
    for (wires, key, field) in [(tools, "tool", "name"), (prompts, "prompt", "name"), (resources, "resource", "uri")] {
        for (func_id, value) in wires {
            if let Some((p, graph)) = g.lookup(&func_id) {
                let w = g.wires(&graph);
                let mcp = sub_object(&w, "mcp");
                push_to(&mcp, key, V::of(vec![(field, value), ("startNode", resolve_start_node(&p, &graph))]));
            }
        }
    }

    for program in record_values(st.cli.meta.programs.iter()) {
        visit_cli_commands(&mut g, &program.get("commands"), &program.get("program").template_string(), &[]);
    }
    g.flush(st);
}

fn scan_channels(g: &mut GraphSet, channels: Vec<V>) {
    for ch in channels {
        let wire = V::of(vec![("name", ch.get("name")), ("route", ch.get("route"))]);
        let mut target: Option<V> = None;
        for (key, field) in [("connect", "onConnect"), ("disconnect", "onDisconnect"), ("message", "onMessage")] {
            let handler = ch.get(key);
            if !handler.truthy() {
                continue;
            }
            if let Some((p, graph)) = g.lookup(&handler.get("pikkuFuncId")) {
                if target.is_none() {
                    target = Some(graph.clone());
                }
                wire.set(field, resolve_start_node(&p, &graph));
            }
        }
        let wirings = ch.get("messageWirings");
        for prop in wirings.keys() {
            let route_map = wirings.get(&prop);
            for value in route_map.keys() {
                let msg = route_map.get(&value);
                let Some((p, graph)) = g.lookup(&msg.get("pikkuFuncId")) else { continue };
                if target.is_none() {
                    target = Some(graph.clone());
                }
                sub_object(&wire, "onMessageRoute").set(&format!("{prop}:{value}"), resolve_start_node(&p, &graph));
            }
        }
        if let Some(t) = target {
            let w = g.wires(&t);
            push_to(&w, "channel", wire);
        }
    }
}

fn visit_cli_commands(g: &mut GraphSet, commands: &V, program: &str, path: &[String]) {
    for name in commands.keys() {
        let command = commands.get(&name);
        let mut current = path.to_vec();
        current.push(name.clone());
        if let Some((p, graph)) = g.lookup(&command.get("pikkuFuncId")) {
            let w = g.wires(&graph);
            push_to(&w, "cli", V::of(vec![("command", V::str(format!("{program} {}", current.join(" ")))), ("startNode", resolve_start_node(&p, &graph))]));
        }
        if command.get("subcommands").truthy() {
            visit_cli_commands(g, &command.get("subcommands"), program, &current);
        }
    }
}
