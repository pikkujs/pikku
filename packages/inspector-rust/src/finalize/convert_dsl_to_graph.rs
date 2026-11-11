//! Port of Go `finalize/convert_dsl_to_graph.go`:
//! utils/workflow/graph/convert-dsl-to-graph.ts and
//! utils/workflow/derive-workflow-plan.ts. Steps and nodes are JS values; the
//! members TS assigns `undefined` are set to `V::Undef` so they keep their key
//! position should a later step assign them.

use super::jsval::V;

fn make_node_id(step: &V, index: usize, prefix: &str) -> String {
    if step.has("stepName") && step.get("stepName").truthy() {
        return step.get("stepName").template_string();
    }
    format!("{prefix}_{index}")
}

fn is_terminal_flow(node: &V) -> bool {
    node.has("flow") && (node.get("flow").is_str("cancel") || node.get("flow").is_str("return"))
}

fn convert_input_source(source: &V) -> V {
    if !source.is_obj() {
        return V::Undef;
    }
    let from = source.get("from");
    match from.as_str() {
        Some("literal") => source.get("value"),
        Some("input") => V::of(vec![("$ref", V::str("trigger")), ("path", source.get("path"))]),
        Some("outputVar") => V::of(vec![("$ref", source.get("name")), ("path", source.get("path"))]),
        Some("item") => V::of(vec![("$ref", V::str("$item")), ("path", source.get("path"))]),
        Some("stateVar") => V::of(vec![("$state", source.get("name")), ("path", source.get("path"))]),
        Some("template") => {
            let mut exprs = V::Undef;
            if let V::Arr(arr) = source.get("expressions") {
                exprs = V::arr(arr.borrow().iter().map(convert_input_source).collect());
            }
            V::of(vec![("$template", V::of(vec![("parts", source.get("parts")), ("expressions", exprs)]))])
        }
        _ => source.get("value"),
    }
}

fn convert_inputs(node: &V, step: &V) {
    let inputs = step.get("inputs");
    if !inputs.truthy() {
        return;
    }
    if inputs.is_str("passthrough") {
        node.set("input", V::of(vec![("$passthrough", V::of(vec![("$ref", V::str("trigger"))]))]));
        return;
    }
    let input = V::obj();
    if inputs.is_obj() {
        for k in inputs.keys() {
            input.set(&k, convert_input_source(&inputs.get(&k)));
        }
    }
    node.set("input", input);
}

fn node_id(n: &V) -> String {
    n.get("nodeId").template_string()
}

/// `stepsOf`: an array's elements, each as an object (non-objects become `{}`).
pub fn steps_of(v: &V) -> Vec<V> {
    v.items().into_iter().map(|x| if x.is_obj() { x } else { V::obj() }).collect()
}

/// Sets `next` on the last node of a sub-sequence, unless it has one or is
/// terminal.
fn link_to_next(nodes: &[V], next: &V) {
    if !next.truthy() || nodes.is_empty() {
        return;
    }
    let last = &nodes[nodes.len() - 1];
    if !last.get("next").truthy() && !is_terminal_flow(last) {
        last.set("next", next.clone());
    }
}

fn convert_step_to_node(step: &V, index: usize, steps: &[V], prefix: &str) -> Vec<V> {
    let node_id_s = make_node_id(step, index, prefix);
    let nid = V::str(&node_id_s);
    let next = if index + 1 < steps.len() { V::str(make_node_id(&steps[index + 1], index + 1, prefix)) } else { V::Undef };
    let g = |k: &str| step.get(k);

    match g("type").as_str().unwrap_or("") {
        "rpc" => {
            let node = V::of(vec![("nodeId", nid), ("rpcName", g("rpcName")), ("stepName", g("stepName")), ("next", next)]);
            if g("virtualUser").truthy() {
                node.set("virtualUser", g("virtualUser"));
            }
            if g("expectEventually").truthy() {
                node.set("expectEventually", V::Bool(true));
            }
            convert_inputs(&node, step);
            if g("outputVar").truthy() {
                node.set("outputVar", g("outputVar"));
            }
            let opts = g("options");
            if opts.truthy() {
                node.set("options", V::of(vec![("retries", opts.get("retries")), ("retryDelay", opts.get("retryDelay"))]));
                if matches!(opts.get("compensate"), V::Bool(false)) {
                    node.set("compensate", V::Bool(false));
                }
            }
            vec![node]
        }
        "scenarioStep" => {
            let node = V::of(vec![
                ("nodeId", nid),
                ("rpcName", g("stepFunc")),
                ("stepName", g("stepName")),
                ("scenarioStepPhase", g("phase")),
                ("next", next),
            ]);
            if g("virtualUser").truthy() {
                node.set("virtualUser", g("virtualUser"));
            }
            convert_inputs(&node, step);
            if g("outputVar").truthy() {
                node.set("outputVar", g("outputVar"));
            }
            let opts = g("options");
            if opts.truthy() {
                node.set("options", V::of(vec![("retries", opts.get("retries")), ("retryDelay", opts.get("retryDelay"))]));
            }
            vec![node]
        }
        "sleep" => vec![V::of(vec![
            ("nodeId", nid),
            ("flow", V::str("sleep")),
            ("stepName", g("stepName")),
            ("duration", g("duration")),
            ("expression", g("expression")),
            ("next", next),
        ])],
        "suspend" => vec![V::of(vec![("nodeId", nid), ("flow", V::str("suspend")), ("reason", g("reason")), ("next", next)])],
        "milestone" => vec![V::of(vec![("nodeId", nid), ("flow", V::str("milestone")), ("reason", g("name")), ("next", next)])],
        "approval" => vec![V::of(vec![
            ("nodeId", nid),
            ("flow", V::str("approval")),
            ("reason", g("reason")),
            ("outputVar", g("outputVar")),
            ("expiry", g("expiry")),
            ("next", next),
        ])],
        "inline" => vec![V::of(vec![("nodeId", nid), ("flow", V::str("inline")), ("description", g("description")), ("next", next)])],
        "branch" => {
            let mut branch_nodes: Vec<V> = Vec::new();
            let branches = V::arr(vec![]);
            for (i, b) in steps_of(&g("branches")).iter().enumerate() {
                let bs = convert_steps_to_nodes(&steps_of(&b.get("steps")), &format!("{node_id_s}_branch{i}"));
                if !bs.is_empty() {
                    branches.push(V::of(vec![("condition", b.get("condition")), ("entry", bs[0].get("nodeId"))]));
                    link_to_next(&bs, &next);
                    branch_nodes.extend(bs);
                }
            }
            let mut else_nodes: Vec<V> = Vec::new();
            if g("elseSteps").truthy() {
                else_nodes = convert_steps_to_nodes(&steps_of(&g("elseSteps")), &format!("{node_id_s}_else"));
            }
            link_to_next(&else_nodes, &next);
            let else_entry = if else_nodes.is_empty() { V::Undef } else { else_nodes[0].get("nodeId") };
            let node = V::of(vec![("nodeId", nid), ("flow", V::str("branch")), ("branches", branches), ("elseEntry", else_entry), ("next", next)]);
            let mut out = vec![node];
            out.extend(branch_nodes);
            out.extend(else_nodes);
            out
        }
        "switch" => {
            let mut case_nodes: Vec<V> = Vec::new();
            let cases = V::arr(vec![]);
            let mut falling: Vec<V> = Vec::new();
            for (i, c) in steps_of(&g("cases")).iter().enumerate() {
                let cs = convert_steps_to_nodes(&steps_of(&c.get("steps")), &format!("{node_id_s}_case{i}"));
                if cs.is_empty() {
                    falling.push(V::of(vec![("value", c.get("value")), ("expression", c.get("expression"))]));
                    continue;
                }
                let entry = cs[0].get("nodeId");
                for p in falling.drain(..) {
                    cases.push(p.shallow_clone().set("entry", entry.clone()));
                }
                cases.push(V::of(vec![("value", c.get("value")), ("expression", c.get("expression")), ("entry", entry)]));
                link_to_next(&cs, &next);
                case_nodes.extend(cs);
            }
            let mut default_entry = V::Undef;
            if g("defaultSteps").truthy() {
                let ds = convert_steps_to_nodes(&steps_of(&g("defaultSteps")), &format!("{node_id_s}_default"));
                if !ds.is_empty() {
                    default_entry = ds[0].get("nodeId");
                    link_to_next(&ds, &next);
                    case_nodes.extend(ds);
                }
            }
            let trailing = if default_entry.nullish() { next.clone() } else { default_entry.clone() };
            if trailing.truthy() {
                for p in falling.drain(..) {
                    cases.push(p.shallow_clone().set("entry", trailing.clone()));
                }
            }
            let node = V::of(vec![
                ("nodeId", nid),
                ("flow", V::str("switch")),
                ("expression", g("expression")),
                ("cases", cases),
                ("defaultEntry", default_entry),
                ("next", next),
            ]);
            let mut out = vec![node];
            out.extend(case_nodes);
            out
        }
        "parallel" => {
            let mut child_nodes: Vec<V> = Vec::new();
            let entries = V::arr(vec![]);
            let children = steps_of(&g("children"));
            for (i, c) in children.iter().enumerate() {
                let cs = convert_step_to_node(c, i, &children, &format!("{node_id_s}_child"));
                if !cs.is_empty() {
                    entries.push(cs[0].get("nodeId"));
                    child_nodes.extend(cs);
                }
            }
            let node = V::of(vec![("nodeId", nid), ("flow", V::str("parallel")), ("children", entries), ("next", next)]);
            let mut out = vec![node];
            out.extend(child_nodes);
            out
        }
        "fanout" => {
            let mut child_nodes: Vec<V> = Vec::new();
            let body = steps_of(&g("body"));
            for (i, b) in body.iter().enumerate() {
                child_nodes.extend(convert_step_to_node(b, i, &body, &format!("{node_id_s}_item")));
            }
            let child_entry = if child_nodes.is_empty() { V::Undef } else { child_nodes[0].get("nodeId") };
            let node = V::of(vec![
                ("nodeId", nid),
                ("flow", V::str("fanout")),
                ("sourceVar", g("sourceVar")),
                ("itemVar", g("itemVar")),
                ("mode", g("mode")),
                ("childEntry", child_entry),
                ("timeBetween", g("timeBetween")),
                ("next", next),
            ]);
            let mut out = vec![node];
            out.extend(child_nodes);
            out
        }
        "filter" => vec![V::of(vec![
            ("nodeId", nid),
            ("flow", V::str("filter")),
            ("sourceVar", g("sourceVar")),
            ("itemVar", g("itemVar")),
            ("condition", g("condition")),
            ("outputVar", g("outputVar")),
            ("next", next),
        ])],
        "arrayPredicate" => vec![V::of(vec![
            ("nodeId", nid),
            ("flow", V::str("arrayPredicate")),
            ("mode", g("mode")),
            ("sourceVar", g("sourceVar")),
            ("itemVar", g("itemVar")),
            ("condition", g("condition")),
            ("outputVar", g("outputVar")),
            ("next", next),
        ])],
        "return" => vec![V::of(vec![("nodeId", nid), ("flow", V::str("return")), ("outputs", g("outputs")), ("spread", g("spread"))])],
        "cancel" => vec![V::of(vec![("nodeId", nid), ("flow", V::str("cancel")), ("reason", g("reason"))])],
        "set" => vec![V::of(vec![
            ("nodeId", nid),
            ("flow", V::str("set")),
            ("variable", g("variable")),
            ("value", g("value")),
            ("expression", g("expression")),
            ("next", next),
        ])],
        _ => vec![],
    }
}

fn convert_steps_to_nodes(steps: &[V], prefix: &str) -> Vec<V> {
    let mut all = Vec::new();
    for (i, s) in steps.iter().enumerate() {
        all.extend(convert_step_to_node(s, i, steps, prefix));
    }
    all
}

/// `convertDslToGraph`.
/// Drops an option a workflow did not set: the meta records it as null, and the
/// route gates read a flag only when it was declared.
fn declared_flag(v: V) -> V {
    match v {
        V::Bool(b) => V::Bool(b),
        _ => V::Undef,
    }
}

pub fn convert_dsl_to_graph(name: &str, meta: &V) -> V {
    let nodes = convert_steps_to_nodes(&steps_of(&meta.get("steps")), "step");
    let record = V::obj();
    for n in &nodes {
        record.set(&node_id(n), n.clone());
    }
    let mut entry = vec![];
    if !nodes.is_empty() {
        entry.push(nodes[0].get("nodeId"));
    }
    let source = if meta.get("scenario").truthy() {
        "scenario"
    } else if matches!(meta.get("dsl"), V::Bool(false)) {
        "complex"
    } else {
        "dsl"
    };
    let scenario = if meta.get("scenario").truthy() { V::Bool(true) } else { V::Undef };
    V::of(vec![
        ("name", V::str(name)),
        ("pikkuFuncId", meta.get("pikkuFuncId")),
        ("source", V::str(source)),
        ("scenario", scenario),
        ("title", meta.get("title")),
        ("description", meta.get("description")),
        ("tags", meta.get("tags")),
        ("expose", declared_flag(meta.get("expose"))),
        ("auth", declared_flag(meta.get("auth"))),
        ("skip", meta.get("skip")),
        ("virtualUsers", meta.get("virtualUsers")),
        ("context", meta.get("context")),
        ("nodes", record),
        ("entryNodeIds", V::arr(entry)),
    ])
}

// ---- derive-workflow-plan.ts ----

/// `deterministic` and `plannedSteps` (`None` when the workflow loops).
pub fn derive_workflow_plan(steps: &[V]) -> (bool, Vec<V>) {
    if contains_loop(steps) {
        return (false, vec![]);
    }
    (!contains_conditional(steps), collect_named_steps(steps))
}

fn contains_loop(steps: &[V]) -> bool {
    for s in steps {
        match s.get("type").as_str().unwrap_or("") {
            "fanout" => return true,
            "branch" => {
                if steps_of(&s.get("branches")).iter().any(|b| contains_loop(&steps_of(&b.get("steps")))) {
                    return true;
                }
                if s.get("elseSteps").truthy() && contains_loop(&steps_of(&s.get("elseSteps"))) {
                    return true;
                }
            }
            "switch" => {
                if steps_of(&s.get("cases")).iter().any(|c| contains_loop(&steps_of(&c.get("steps")))) {
                    return true;
                }
                if s.get("defaultSteps").truthy() && contains_loop(&steps_of(&s.get("defaultSteps"))) {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

fn contains_conditional(steps: &[V]) -> bool {
    steps.iter().any(|s| matches!(s.get("type").as_str(), Some("branch") | Some("switch")))
}

fn reason_to_label(reason: &str) -> String {
    let s: String = reason.chars().map(|c| if c == '-' || c == '_' { ' ' } else { c }).collect();
    let mut it = s.chars();
    match it.next() {
        None => s,
        Some(c) if matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}') => s,
        Some(c) => {
            let mut up = c.to_uppercase();
            let u = if up.len() == 1 { up.next().unwrap() } else { c };
            format!("{u}{}", it.as_str())
        }
    }
}

fn collect_named_steps(steps: &[V]) -> Vec<V> {
    let mut planned = Vec::new();
    for s in steps {
        match s.get("type").as_str().unwrap_or("") {
            "rpc" | "inline" | "sleep" => planned.push(V::of(vec![("stepName", s.get("stepName"))])),
            "suspend" => {
                let r = s.get("reason").template_string();
                planned.push(V::of(vec![("stepName", V::str(format!("__workflow_suspend:{r}"))), ("displayName", V::str(reason_to_label(&r)))]));
            }
            "milestone" => {
                let r = s.get("name").template_string();
                planned.push(V::of(vec![("stepName", V::str(format!("__milestone__:{r}"))), ("displayName", V::str(reason_to_label(&r)))]));
            }
            "approval" => {
                let r = s.get("reason").template_string();
                planned.push(V::of(vec![("stepName", V::str(format!("__workflow_approval:{r}"))), ("displayName", V::str(reason_to_label(&r)))]));
            }
            "parallel" => {
                for c in steps_of(&s.get("children")) {
                    planned.push(V::of(vec![("stepName", c.get("stepName"))]));
                }
            }
            "branch" => {
                for b in steps_of(&s.get("branches")) {
                    planned.extend(collect_named_steps(&steps_of(&b.get("steps"))));
                }
                if s.get("elseSteps").truthy() {
                    planned.extend(collect_named_steps(&steps_of(&s.get("elseSteps"))));
                }
            }
            "switch" => {
                for c in steps_of(&s.get("cases")) {
                    planned.extend(collect_named_steps(&steps_of(&c.get("steps"))));
                }
                if s.get("defaultSteps").truthy() {
                    planned.extend(collect_named_steps(&steps_of(&s.get("defaultSteps"))));
                }
            }
            _ => {}
        }
    }
    planned
}
