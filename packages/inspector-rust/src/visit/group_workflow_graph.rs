//! Port of Go `visit/group_workflow_graph.go`: add/add-workflow-graph.ts.

use std::sync::LazyLock;

use regex::Regex;
use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::workflow_dsl::literal_scalar;
use super::workflow_jsobj::{Js, JsObj, jo, js_number};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::FileExport;
use crate::tsutil::file_name_of;

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addWorkflowGraph",
        phase: Phase::Routes,
        order: order::ADD_WORKFLOW_GRAPH,
        visit: |c, n| c.add_workflow_graph(n),
    });
}

static TEMPLATE_REF_PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\$(\d+)").unwrap());

fn unwrap_as_paren(mut n: P<Node>) -> P<Node> {
    while crate::tsutil::is_as_expression(n) || ast::is_parenthesized_expression(n) {
        n = n.expression().unwrap();
    }
    n
}

/// An identifier or string-literal property name.
fn graph_prop_key(p: P<Node>) -> Option<&'static str> {
    let name = p.name()?;
    if ast::is_identifier(name) || ast::is_string_literal(name) { Some(name.text()) } else { None }
}

fn string_arg(args: &[P<Node>], i: usize) -> Js {
    match args.get(i) {
        Some(a) if ast::is_string_literal(*a) => Js::from(a.text()),
        _ => Js::Undef,
    }
}

/// add-workflow-graph.ts extractAstValue; `Js::Undef` for anything it cannot read.
fn extract_graph_ast_value(expr: P<Node>, ref_param: &str, template_param: &str, item_param: &str) -> Js {
    let expr = unwrap_as_paren(expr);
    if let Some(v) = literal_scalar(expr) {
        return v;
    }
    if ast::is_call_expression(expr) && expr.expression().is_some_and(ast::is_identifier) {
        let callee = expr.expression().unwrap().text();
        let args = expr.arguments();
        if callee == ref_param {
            let node_id = match args.first() {
                Some(a) if ast::is_string_literal(*a) => a.text(),
                _ => "unknown",
            };
            return Js::Obj(jo!("$ref" => node_id, "path" => string_arg(args, 1)));
        } else if !item_param.is_empty() && callee == item_param {
            return Js::Obj(jo!("$ref" => "$item", "path" => string_arg(args, 0)));
        } else if !template_param.is_empty() && callee == template_param {
            let template_str = match args.first() {
                Some(a) if ast::is_string_literal(*a) => a.text(),
                _ => "",
            };
            let mut refs: Vec<JsObj> = vec![];
            if args.len() > 1 && ast::is_array_literal_expression(args[1]) {
                for el in args[1].elements() {
                    if let Js::Obj(o) = extract_graph_ast_value(*el, ref_param, template_param, item_param) {
                        if o.has("$ref") {
                            refs.push(o);
                        }
                    }
                }
            }
            let mut parts: Vec<String> = vec![];
            let mut exprs: Vec<JsObj> = vec![];
            let mut last = 0;
            for m in TEMPLATE_REF_PATTERN.captures_iter(template_str) {
                let whole = m.get(0).unwrap();
                parts.push(template_str[last..whole.start()].to_string());
                let idx = m[1].parse::<usize>().unwrap_or(usize::MAX);
                if idx < refs.len() {
                    exprs.push(refs[idx].clone());
                } else {
                    exprs.push(jo!("$ref" => "unknown"));
                }
                last = whole.end();
            }
            parts.push(template_str[last..].to_string());
            return Js::Obj(jo!("$template" => jo!("parts" => parts, "expressions" => exprs)));
        }
    }
    if ast::is_array_literal_expression(expr) {
        return Js::Arr(
            expr.elements().iter().map(|el| extract_graph_ast_value(*el, ref_param, template_param, item_param)).collect(),
        );
    }
    if ast::is_object_literal_expression(expr) {
        let mut obj = JsObj::new();
        for p in expr.properties() {
            if !ast::is_property_assignment(*p) {
                continue;
            }
            if let Some(key) = graph_prop_key(*p).filter(|k| !k.is_empty()) {
                obj.set(key, extract_graph_ast_value(p.initializer().unwrap(), ref_param, template_param, item_param));
            }
        }
        return Js::Obj(obj);
    }
    if ast::is_prefix_unary_expression(expr) {
        let pu = expr.as_prefix_unary_expression();
        if pu.operator() == Kind::MinusToken && ast::is_numeric_literal(pu.operand()) {
            return Js::Num(-js_number(pu.operand().text()));
        }
    }
    Js::Undef
}

fn param_name(f: P<Node>, i: usize) -> Option<&'static str> {
    let params = f.parameters();
    params.get(i).and_then(|p| p.name()).filter(|n| ast::is_identifier(*n)).map(|n| n.text())
}

fn extract_graph_input_mapping(n: P<Node>) -> JsObj {
    let mut input = JsObj::new();
    if !ast::is_arrow_function(n) {
        return input;
    }
    let mut body_obj: Option<P<Node>> = None;
    let body = n.body().unwrap();
    if ast::is_object_literal_expression(body) {
        body_obj = Some(body);
    } else if ast::is_parenthesized_expression(body) {
        if ast::is_object_literal_expression(body.expression().unwrap()) {
            body_obj = body.expression();
        }
    } else if ast::is_block(body) {
        for st in body.statements() {
            if ast::is_return_statement(*st) {
                if let Some(e) = st.expression().filter(|e| ast::is_object_literal_expression(*e)) {
                    body_obj = Some(e);
                }
            }
        }
    }
    let Some(body_obj) = body_obj else { return input };
    let ref_param = param_name(n, 0).unwrap_or("ref");
    let template_param = param_name(n, 1).unwrap_or("template");
    let item_param = param_name(n, 2).unwrap_or("");
    for p in body_obj.properties() {
        if !ast::is_property_assignment(*p) {
            continue;
        }
        let Some(key) = graph_prop_key(*p).filter(|k| !k.is_empty()) else { continue };
        let v = extract_graph_ast_value(p.initializer().unwrap(), ref_param, template_param, item_param);
        if !v.is_undef() {
            input.set(key, v);
        }
    }
    input
}

fn extract_for_each_config(n: P<Node>) -> Js {
    let n = unwrap_as_paren(n);
    if ast::is_string_literal(n) {
        return Js::Obj(jo!("$ref" => n.text()));
    }
    if ast::is_arrow_function(n) {
        let ref_param = param_name(n, 0).unwrap_or("ref");
        let mut body = n.body().unwrap();
        if ast::is_block(body) {
            for st in body.statements() {
                if ast::is_return_statement(*st) {
                    if let Some(e) = st.expression() {
                        body = e;
                    }
                }
            }
        }
        if !ast::is_expression(body) {
            return Js::Undef;
        }
        if let Js::Obj(o) = extract_graph_ast_value(body, ref_param, "", "") {
            if o.get("$ref").as_str().is_some() {
                return Js::Obj(o);
            }
        }
    }
    Js::Undef
}

fn string_literals(arr: P<Node>) -> Vec<String> {
    arr.elements().iter().filter(|e| ast::is_string_literal(**e)).map(|e| e.text().to_string()).collect()
}

fn extract_next_config(n: P<Node>) -> Js {
    let n = unwrap_as_paren(n);
    if ast::is_string_literal(n) {
        return Js::from(n.text());
    }
    if ast::is_array_literal_expression(n) {
        return Js::from(string_literals(n));
    }
    if ast::is_object_literal_expression(n) {
        let mut res = JsObj::new();
        for p in n.properties() {
            if !ast::is_property_assignment(*p) {
                continue;
            }
            let Some(key) = graph_prop_key(*p).filter(|k| !k.is_empty()) else { continue };
            let init = p.initializer().unwrap();
            if ast::is_string_literal(init) {
                res.set(key, init.text());
            } else if ast::is_array_literal_expression(init) {
                res.set(key, string_literals(init));
            }
        }
        return Js::Obj(res);
    }
    Js::Undef
}

fn compute_entry_node_ids(nodes: &JsObj) -> Vec<String> {
    let mut incoming: std::collections::HashSet<String> = std::collections::HashSet::new();
    fn add_targets(incoming: &mut std::collections::HashSet<String>, v: &Js) {
        match v {
            Js::Str(s) => {
                incoming.insert(s.clone());
            }
            Js::Arr(a) => {
                for x in a {
                    if let Js::Str(s) = x {
                        incoming.insert(s.clone());
                    }
                }
            }
            _ => {}
        }
    }
    let keys: Vec<&str> = nodes.keys().collect();
    for k in &keys {
        let Js::Obj(node) = nodes.get(k) else { continue };
        match node.get("next") {
            Js::Str(t) => {
                if !t.is_empty() {
                    incoming.insert(t.clone());
                }
            }
            v @ Js::Arr(_) => add_targets(&mut incoming, v),
            Js::Obj(o) => {
                for nk in o.keys() {
                    add_targets(&mut incoming, o.get(nk));
                }
            }
            _ => {}
        }
    }
    keys.iter().filter(|k| !incoming.contains(**k)).map(|k| k.to_string()).collect()
}

impl Context<'_> {
    pub fn add_workflow_graph(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node)
            || !node.expression().is_some_and(ast::is_identifier)
            || node.expression().unwrap().text() != "pikkuWorkflowGraph"
        {
            return;
        }
        let args = node.arguments();
        if args.is_empty() {
            self.log.critical(codes::MISSING_FUNC, "pikkuWorkflowGraph requires an argument");
            return;
        }
        let first_arg = args[0];
        if !ast::is_object_literal_expression(first_arg) {
            self.log.critical(codes::MISSING_FUNC, "pikkuWorkflowGraph requires an object argument");
            return;
        }

        let mut name = String::new();
        let mut exported_name = String::new();
        let (mut description, mut tags, mut notes) = (Js::Undef, Js::Undef, Js::Undef);
        let mut disabled = false;
        let (mut nodes_node, mut config_node): (Option<P<Node>>, Option<P<Node>>) = (None, None);
        for p in first_arg.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            let init = p.initializer().unwrap();
            match p.name().unwrap().text() {
                "name" => name = self.extract_string_literal(init).unwrap_or_default(),
                "description" => {
                    if let Some(v) = self.extract_string_literal(init) {
                        description = Js::Str(v);
                    }
                }
                "disabled" => {
                    if init.kind() == Kind::TrueKeyword {
                        disabled = true;
                    }
                }
                "tags" => {
                    if ast::is_array_literal_expression(init) {
                        tags = Js::from(string_literals(init));
                    }
                }
                "notes" => {
                    if ast::is_array_literal_expression(init) {
                        notes = Js::from(string_literals(init));
                    }
                }
                "nodes" => {
                    if ast::is_object_literal_expression(init) {
                        nodes_node = Some(init);
                    }
                }
                "config" => {
                    if ast::is_object_literal_expression(init) {
                        config_node = Some(init);
                    }
                }
                _ => {}
            }
        }
        if let Some(parent) = node.parent() {
            if ast::is_variable_declaration(parent) && parent.name().is_some_and(ast::is_identifier) {
                exported_name = parent.name().unwrap().text().to_string();
            }
        }
        let mut workflow_name = name;
        if workflow_name.is_empty() {
            workflow_name = exported_name.clone();
        }
        if workflow_name.is_empty() {
            self.log.critical(codes::MISSING_NAME, "pikkuWorkflowGraph requires a name property or exported variable name");
            return;
        }

        let mut nodes = JsObj::new();
        if let Some(nn) = nodes_node {
            self.extract_graph_nodes(nn, config_node, &mut nodes);
        }

        let entry = compute_entry_node_ids(&nodes);
        let serialized = jo!(
            "name" => workflow_name.as_str(),
            "pikkuFuncId" => workflow_name.as_str(),
            "source" => "graph",
            "description" => description,
            "tags" => tags,
            "notes" => notes,
            "nodes" => nodes,
            "entryNodeIds" => entry,
        );
        if disabled {
            return;
        }
        if exported_name.is_empty() {
            exported_name = workflow_name.clone();
        }
        self.state.workflows.graph_meta.set(workflow_name.as_str(), serialized.raw());
        self.state
            .workflows
            .graph_files
            .set(workflow_name, FileExport { path: file_name_of(node).to_string(), exported_name });
    }

    fn extract_graph_nodes(&mut self, nodes_node: P<Node>, config_node: Option<P<Node>>, nodes: &mut JsObj) {
        let mut rpc_by_node = JsObj::new();
        for p in nodes_node.properties() {
            if !ast::is_property_assignment(*p) {
                continue;
            }
            let Some(node_id) = graph_prop_key(*p).filter(|k| !k.is_empty()) else { continue };
            let Some(rpc_name) = self.extract_string_literal(p.initializer().unwrap()).filter(|r| !r.is_empty()) else {
                continue;
            };
            rpc_by_node.set(node_id, rpc_name.as_str());
            self.state.rpc.invoked_functions.add(rpc_name.as_str());
            if let Some(f) = self.state.functions.files.get(&rpc_name).cloned() {
                if !self.state.rpc.internal_files.has(&rpc_name) {
                    self.state.rpc.internal_files.set(rpc_name, f);
                }
            }
        }
        let ids: Vec<String> = rpc_by_node.keys().map(String::from).collect();
        for node_id in &ids {
            nodes.set(
                node_id,
                jo!(
                    "nodeId" => node_id.as_str(),
                    "rpcName" => rpc_by_node.get(node_id).clone(),
                    "input" => JsObj::new(),
                    "forEach" => Js::Undef,
                    "mode" => Js::Undef,
                    "next" => Js::Undef,
                    "onError" => Js::Undef,
                    "retries" => Js::Undef,
                    "retryDelay" => Js::Undef,
                    "notes" => Js::Undef,
                ),
            );
        }
        let Some(config_node) = config_node else { return };
        for p in config_node.properties() {
            if !ast::is_property_assignment(*p) {
                continue;
            }
            let Some(node_id) = graph_prop_key(*p).filter(|k| !k.is_empty()) else { continue };
            if !matches!(nodes.get(node_id), Js::Obj(_)) || !ast::is_object_literal_expression(p.initializer().unwrap()) {
                continue;
            }
            let (mut next, mut on_error, mut for_each, mut mode, mut retries, mut retry_delay, mut notes) =
                (Js::Undef, Js::Undef, Js::Undef, Js::Undef, Js::Undef, Js::Undef, Js::Undef);
            let mut input = JsObj::new();
            for cp in p.initializer().unwrap().properties() {
                if !ast::is_property_assignment(*cp) || !cp.name().is_some_and(ast::is_identifier) {
                    continue;
                }
                let init = cp.initializer().unwrap();
                match cp.name().unwrap().text() {
                    "next" => next = extract_next_config(init),
                    "onError" => on_error = extract_next_config(init),
                    "input" => input = extract_graph_input_mapping(init),
                    "forEach" => for_each = extract_for_each_config(init),
                    "mode" => {
                        if let Some(v) = self.extract_string_literal(init) {
                            mode = Js::Str(v);
                        }
                    }
                    "retries" => {
                        if ast::is_numeric_literal(init) {
                            retries = Js::Num(js_number(init.text()));
                        }
                    }
                    "retryDelay" => {
                        if ast::is_numeric_literal(init) {
                            retry_delay = Js::Num(js_number(init.text()));
                        } else if ast::is_string_literal(init) {
                            retry_delay = Js::from(init.text());
                        }
                    }
                    "notes" => {
                        if let Some(v) = self.extract_string_literal(init) {
                            notes = Js::Str(v);
                        }
                    }
                    _ => {}
                }
            }
            if let Some(Js::Obj(target)) = nodes.get_mut(node_id) {
                target.set("next", next);
                target.set("onError", on_error);
                target.set("input", input);
                target.set("forEach", for_each);
                target.set("mode", mode);
                target.set("retries", retries);
                target.set("retryDelay", retry_delay);
                target.set("notes", notes);
            }
        }
    }
}
