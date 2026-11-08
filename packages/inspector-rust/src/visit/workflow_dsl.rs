//! Port of Go `visit/workflow_dsl.go`: utils/workflow/dsl/extract-dsl-workflow.ts.
//! Steps are built as [`JsObj`] values whose key order is the TS object
//! literals' order, so the meta serializes exactly as the TS extractor's does.

use std::collections::HashSet;

use tsrs_ast::{self as ast, Kind, Node, NodeFlags};
use tsrs_core::P;

use super::Context;
use super::workflow_dsl_patterns::*;
use super::workflow_jsobj::{Js, JsObj, jo, js_number, utf16_prefix};
use crate::state::Map;
use crate::tsutil::{self, node_text};

/// extract-node-value.ts's extractStringLiteral throws this; it ends up inside
/// DSL failure reasons.
const ERR_STRING_LITERAL_MESSAGE: &str = "Unable to extract string literal from node";

struct ContextVar {
    typ: String,
    def: Js,
}

/// What a fanout body copies: `{ ...context, outputVars: new Map(...), loopVars: ... }`.
#[derive(Clone)]
struct Scope {
    output_vars: HashSet<String>,
    /// `None`: no input parameter is declared.
    input_param_name: Option<String>,
    loop_vars: HashSet<String>,
    depth: usize,
}

struct Dsl<'c, 'a> {
    s: &'c mut Context<'a>,
    /// Shared with every fanout body.
    errors: Vec<String>,
    context_vars: Map<ContextVar>,
    scope: Scope,
}

/// Go `dslResult`.
pub struct DslResult {
    pub ok: bool,
    pub steps: Vec<JsObj>,
    /// An object or undefined.
    pub context: Js,
    /// `true` or undefined.
    pub asserts: Js,
    pub reason: String,
}

impl DslResult {
    fn failed(reason: impl Into<String>) -> DslResult {
        DslResult { ok: false, steps: vec![], context: Js::Undef, asserts: Js::Undef, reason: reason.into() }
    }
}

/// A function the walk must not step into because nothing says it runs
/// (declared, or assigned to a name).
fn is_uncalled_function(n: P<Node>) -> bool {
    if ast::is_function_declaration(n) {
        return true;
    }
    if !ast::is_function_expression(n) && !ast::is_arrow_function(n) {
        return false;
    }
    match n.parent() {
        Some(p) if ast::is_call_expression(p) => !p.arguments().iter().any(|a| *a == n),
        _ => true,
    }
}

fn has_scenario_expectation(body: P<Node>) -> bool {
    fn visit(n: P<Node>, body: P<Node>, found: &mut bool) {
        if *found {
            return;
        }
        if ast::is_call_expression(n) && is_scenario_expectation_call(n) {
            *found = true;
            return;
        }
        if n != body && is_uncalled_function(n) {
            return;
        }
        n.for_each_child(&mut |c| {
            visit(c, body, found);
            false
        });
    }
    let mut found = false;
    visit(body, body, &mut found);
    found
}

fn find_workflow_function(n: P<Node>) -> Option<P<Node>> {
    let func_prop = |obj: P<Node>| -> Option<P<Node>> {
        for p in obj.properties() {
            if ast::is_property_assignment(*p)
                && p.name().is_some_and(ast::is_identifier)
                && p.name().unwrap().text() == "func"
                && ast::is_arrow_function(p.initializer().unwrap())
            {
                return Some(p.initializer().unwrap());
            }
        }
        None
    };
    if ast::is_call_expression(n) {
        let args = n.arguments();
        if let Some(a) = args.first() {
            if ast::is_arrow_function(*a) {
                return Some(*a);
            }
            if ast::is_object_literal_expression(*a) {
                if let Some(f) = func_prop(*a) {
                    return Some(f);
                }
            }
        }
    }
    if ast::is_object_literal_expression(n) {
        return func_prop(n);
    }
    None
}

impl Context<'_> {
    /// `extractDSLWorkflow`.
    pub fn extract_dsl_workflow(&mut self, func_node: P<Node>, allow_inline: bool) -> DslResult {
        let Some(arrow) = find_workflow_function(func_node) else {
            return DslResult::failed("Could not find async arrow function in workflow definition");
        };
        let mut input_param_name = None;
        let params = arrow.parameters();
        if params.len() >= 2 {
            let name = params[1].name().unwrap();
            if !ast::is_identifier(name) {
                return DslResult::failed("Could not determine input parameter name");
            }
            input_param_name = Some(name.text().to_string());
        }
        let body = arrow.body().unwrap();
        let mut ctx = Dsl {
            s: self,
            errors: vec![],
            context_vars: Map::new(),
            scope: Scope {
                output_vars: HashSet::new(),
                input_param_name,
                loop_vars: HashSet::new(),
                depth: 0,
            },
        };
        let pe = validate_no_disallowed_patterns(body, allow_inline);
        if !pe.is_empty() {
            return DslResult::failed(format_validation_errors(&pe));
        }
        let ae = validate_awaited_calls(body);
        if !ae.is_empty() {
            return DslResult::failed(format_validation_errors(&ae));
        }
        let steps = ctx.extract_steps(body, false);
        if !ctx.errors.is_empty() {
            return DslResult::failed(format_validation_errors(&ctx.errors));
        }
        let mut res = DslResult { ok: true, steps, context: Js::Undef, asserts: Js::Undef, reason: String::new() };
        if ctx.context_vars.len() > 0 {
            let mut wc = JsObj::new();
            for (name, v) in ctx.context_vars.iter() {
                wc.set(name, jo!("type" => v.typ.clone(), "default" => v.def.clone()));
            }
            res.context = Js::Obj(wc);
        }
        if has_scenario_expectation(body) {
            res.asserts = Js::Bool(true);
        }
        res
    }
}

fn awaited_call(n: Option<P<Node>>) -> Option<P<Node>> {
    let n = n?;
    if ast::is_await_expression(n) && ast::is_call_expression(n.expression().unwrap()) {
        return n.expression();
    }
    None
}

fn declarations(stmt: P<Node>) -> &'static [P<Node>] {
    stmt.as_variable_statement().declaration_list().as_variable_declaration_list().declarations().nodes()
}

fn is_inline_do_call(call: P<Node>) -> bool {
    let args = call.arguments();
    args.len() > 1 && tsutil::is_function_like(args[1])
}

fn extract_number_literal(n: P<Node>) -> Option<f64> {
    if ast::is_numeric_literal(n) { Some(js_number(n.text())) } else { None }
}

fn extract_throw_cancel(stmt: P<Node>) -> Option<JsObj> {
    if !is_throw_cancel_exception(stmt) {
        return None;
    }
    Some(jo!("type" => "cancel", "reason" => extract_cancel_reason(stmt)))
}

fn parse_condition(expr: P<Node>) -> JsObj {
    if ast::is_binary_expression(expr) {
        let be = expr.as_binary_expression();
        match be.operator_token().kind() {
            Kind::AmpersandAmpersandToken => {
                return jo!("type" => "and", "conditions" => vec![parse_condition(be.left()), parse_condition(be.right())]);
            }
            Kind::BarBarToken => {
                return jo!("type" => "or", "conditions" => vec![parse_condition(be.left()), parse_condition(be.right())]);
            }
            _ => {}
        }
    }
    if ast::is_parenthesized_expression(expr) {
        return parse_condition(expr.expression().unwrap());
    }
    jo!("type" => "simple", "expression" => get_source_text(expr))
}

/// A string, numeric, true/false or null literal.
pub fn literal_scalar(expr: P<Node>) -> Option<Js> {
    if ast::is_string_literal(expr) {
        return Some(Js::from(expr.text()));
    }
    if ast::is_numeric_literal(expr) {
        return Some(Js::Num(js_number(expr.text())));
    }
    match expr.kind() {
        Kind::TrueKeyword => Some(Js::Bool(true)),
        Kind::FalseKeyword => Some(Js::Bool(false)),
        Kind::NullKeyword => Some(Js::Null),
        _ => None,
    }
}

/// `(value, expression)`, each possibly undefined.
fn extract_case_value(expr: P<Node>) -> (Js, Js) {
    match literal_scalar(expr) {
        Some(v) => (v, Js::Undef),
        None => (Js::Undef, Js::from(get_source_text(expr))),
    }
}

/// The shared shape of filter/some/every: a property call on a source path
/// whose first argument is an arrow with an identifier first parameter and an
/// expression body. `(sourceVar, itemVar, condition)`.
fn arrow_item_predicate(call: P<Node>) -> Option<(String, String, JsObj)> {
    let callee = call.expression().unwrap();
    if !ast::is_property_access_expression(callee) {
        return None;
    }
    let source_var = extract_source_path(callee.expression().unwrap())?;
    let args = call.arguments();
    if args.is_empty() || !ast::is_arrow_function(args[0]) {
        return None;
    }
    let f = args[0];
    let params = f.parameters();
    if params.is_empty() || !params[0].name().is_some_and(ast::is_identifier) {
        return None;
    }
    let body = f.body().unwrap();
    if ast::is_block(body) {
        return None;
    }
    Some((source_var, params[0].name().unwrap().text().to_string(), parse_condition(body)))
}

/// `await call` or `call`.
fn call_of(expr: P<Node>) -> Option<P<Node>> {
    if ast::is_await_expression(expr) {
        let e = expr.expression().unwrap();
        return if ast::is_call_expression(e) { Some(e) } else { None };
    }
    if ast::is_call_expression(expr) { Some(expr) } else { None }
}

fn contains_workflow_call(n: P<Node>) -> bool {
    fn visit(x: P<Node>, found: &mut bool) {
        if *found {
            return;
        }
        if ast::is_call_expression(x)
            && (is_workflow_do_call(x)
                || is_scenario_step_call(x)
                || is_workflow_sleep_call(x)
                || is_workflow_suspend_call(x)
                || is_workflow_approval_call(x)
                || is_workflow_expect_eventually_call(x))
        {
            *found = true;
            return;
        }
        x.for_each_child(&mut |c| {
            visit(c, found);
            false
        });
    }
    let mut found = false;
    visit(n, &mut found);
    found
}

fn input_source_to_inline_value(src: &JsObj) -> Js {
    match src.str("from").unwrap_or("") {
        "literal" => src.get("value").clone(),
        "input" => Js::Obj(jo!("$ref" => "trigger", "path" => src.get("path").clone())),
        "outputVar" => Js::Obj(jo!("$ref" => src.get("name").clone(), "path" => src.get("path").clone())),
        "item" => Js::Obj(jo!("$ref" => "$item", "path" => src.get("path").clone())),
        "template" => {
            let vals: Vec<Js> = src.steps("expressions").into_iter().map(input_source_to_inline_value).collect();
            Js::Obj(jo!("$template" => jo!("parts" => src.get("parts").clone(), "expressions" => Js::Arr(vals))))
        }
        _ => Js::Undef,
    }
}

/// The JS value of a literal expression (null is [`Js::Null`]), or `None` for
/// undefined.
pub fn extract_literal_value(expr: P<Node>) -> Option<Js> {
    if let Some(v) = literal_scalar(expr) {
        return Some(v);
    }
    if ast::is_array_literal_expression(expr) {
        let mut vals = vec![];
        for el in expr.elements() {
            vals.push(extract_literal_value(*el)?);
        }
        return Some(Js::Arr(vals));
    }
    if ast::is_object_literal_expression(expr) {
        let mut obj = JsObj::new();
        for p in expr.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                return None;
            }
            let v = extract_literal_value(p.initializer().unwrap())?;
            obj.set(p.name().unwrap().text(), v);
        }
        return Some(Js::Obj(obj));
    }
    None
}

impl Dsl<'_, '_> {
    fn add_error(&mut self, msg: impl Into<String>) {
        self.errors.push(msg.into());
    }

    fn is_input_param(&self, name: &str) -> bool {
        self.scope.input_param_name.as_deref() == Some(name)
    }

    fn string_literal(&mut self, n: P<Node>) -> Result<String, &'static str> {
        self.s.extract_string_literal(n).ok_or(ERR_STRING_LITERAL_MESSAGE)
    }

    /// Runs `f` with the copy of the scope a fanout body extracts with.
    fn in_child<R>(&mut self, item_var: &str, f: impl FnOnce(&mut Self) -> R) -> R {
        let mut child = self.scope.clone();
        child.loop_vars.insert(item_var.to_string());
        let saved = std::mem::replace(&mut self.scope, child);
        let r = f(self);
        self.scope = saved;
        r
    }

    /// Asks the checker for a node's type and drops the answer. The TS
    /// extractor records every step output's type and never reads it back, but
    /// the lookup decides when the checker first creates the literal types in
    /// it, and union members print, and so become schema enums, in that
    /// creation order.
    fn touch_type(&mut self, n: P<Node>) {
        self.s.checker.get_type_at_location(n);
    }

    fn infer_simple_type(&mut self, n: P<Node>) -> String {
        let t = self.s.checker.get_type_at_location(n);
        let type_str = self.s.type_to_string(t);
        if type_str == "string" || type_str == "number" || type_str == "boolean" {
            return type_str;
        }
        if type_str.ends_with("[]") || type_str.starts_with("Array<") {
            return "array".to_string();
        }
        "object".to_string()
    }

    fn extract_steps(&mut self, body: P<Node>, increment_depth: bool) -> Vec<JsObj> {
        let mut steps = vec![];
        if !ast::is_block(body) {
            return steps;
        }
        if increment_depth {
            self.scope.depth += 1;
        }
        for stmt in body.statements() {
            if let Some(st) = self.extract_step(*stmt) {
                steps.push(st);
            }
        }
        if increment_depth {
            self.scope.depth -= 1;
        }
        steps
    }

    fn extract_step(&mut self, stmt: P<Node>) -> Option<JsObj> {
        if ast::is_variable_statement(stmt) {
            return self.extract_variable_declaration(stmt);
        }
        if ast::is_expression_statement(stmt) {
            return self.extract_expression_statement(stmt);
        }
        if ast::is_if_statement(stmt) {
            return Some(self.extract_branch(stmt));
        }
        if ast::is_switch_statement(stmt) {
            return Some(self.extract_switch(stmt));
        }
        if ast::is_for_of_statement(stmt) {
            let mut reason = String::new();
            let fanout = self.extract_sequential_fanout(stmt, &mut reason);
            if fanout.is_none() && contains_workflow_call(stmt.as_for_in_or_of_statement().statement()) {
                let msg = if reason.is_empty() {
                    "its iterable must be a data array (an identifier or field like 'data.items'), not a computed/inline \
                     iterable such as '[...Array(n).keys()]'. Use pikkuWorkflowComplexFunc for a control-flow/counting loop, \
                     or iterate over a real input array."
                        .to_string()
                } else {
                    reason
                };
                self.add_error(format!(
                    "The for-of loop '{}' can't be expressed in a DSL workflow — {msg}",
                    utf16_prefix(node_text(stmt), 60)
                ));
            }
            return fanout;
        }
        if ast::is_return_statement(stmt) {
            return self.extract_return(stmt);
        }
        if ast::is_throw_statement(stmt) {
            return extract_throw_cancel(stmt);
        }
        None
    }

    fn extract_variable_declaration(&mut self, stmt: P<Node>) -> Option<JsObj> {
        let decls = declarations(stmt);
        if decls.len() != 1 {
            self.add_error(format!(
                "A single declaration statement may only declare one variable in DSL workflows. Split '{}' into separate statements.",
                utf16_prefix(node_text(stmt), 60)
            ));
            return None;
        }
        let decl = decls[0];
        if !ast::is_identifier(decl.name().unwrap()) {
            return self.extract_destructured_declaration(decl);
        }
        let var_name = decl.name().unwrap().text().to_string();
        let init = decl.initializer();
        if self.scope.depth > 0 {
            self.add_error(format!(
                "Variable declaration '{var_name}' inside block is not supported in DSL workflows. Move all let/const declarations to the top level."
            ));
            return None;
        }
        let init = init?;
        if let Some(lit) = extract_literal_value(init) {
            let typ = self.infer_simple_type(decl);
            self.context_vars.set(var_name, ContextVar { typ, def: lit });
            return None;
        }
        if let Some(call) = awaited_call(Some(init)) {
            if is_workflow_do_call(call) || is_scenario_step_call(call) {
                let step = if is_scenario_step_call(call) {
                    self.extract_scenario_step(call, Js::from(var_name.as_str()))
                } else if is_inline_do_call(call) {
                    self.extract_inline_step(call)
                } else {
                    self.extract_rpc_step(call, Js::from(var_name.as_str()))
                };
                if step.is_some() {
                    self.touch_type(decl);
                    self.scope.output_vars.insert(var_name);
                    return step;
                }
            }
            if is_workflow_approval_call(call) {
                let step = self.extract_approval_step(call, var_name.as_str());
                if step.is_some() {
                    self.touch_type(decl);
                    self.scope.output_vars.insert(var_name);
                    return step;
                }
            }
            if is_parallel_fanout(call) || is_parallel_group(call) {
                let step = if is_parallel_fanout(call) {
                    self.extract_parallel_fanout(call)
                } else {
                    self.extract_parallel_group(call)
                };
                if step.is_some() {
                    self.touch_type(decl);
                    self.scope.output_vars.insert(var_name);
                    return step;
                }
            }
        }
        if ast::is_call_expression(init) {
            let m = property_call_name(init);
            if m == "filter" {
                if let Some(st) = self.extract_array_filter(init, &var_name) {
                    self.touch_type(decl);
                    self.scope.output_vars.insert(var_name);
                    return Some(st);
                }
            }
            if m == "some" || m == "every" {
                if let Some(st) = self.extract_array_predicate(init, &var_name) {
                    self.touch_type(decl);
                    self.scope.output_vars.insert(var_name);
                    return Some(st);
                }
            }
        }
        None
    }

    fn extract_destructured_declaration(&mut self, decl: P<Node>) -> Option<JsObj> {
        let init = decl.initializer();
        let name = decl.name().unwrap();
        if let Some(call) = awaited_call(init) {
            if is_parallel_group(call) && ast::is_array_binding_pattern(name) {
                let elements = name.elements();
                let all_simple = elements.iter().all(|el| {
                    ast::is_binding_element(*el)
                        && el.name().is_some_and(ast::is_identifier)
                        && el.as_binding_element().dot_dot_dot_token().is_none()
                });
                if all_simple {
                    if let Some(mut step) = self.extract_parallel_group(call) {
                        let n_children = step.steps("children").len();
                        if elements.len() != n_children {
                            self.add_error(format!(
                                "Destructuring binds {} name(s) but Promise.all has {} step(s). They must match so each result can be bound to its step.",
                                elements.len(),
                                n_children
                            ));
                            return None;
                        }
                        for (i, el) in elements.iter().enumerate() {
                            let n = el.name().unwrap();
                            if let Some(Js::Arr(ch)) = step.get_mut("children") {
                                if let Js::Obj(o) = &mut ch[i] {
                                    o.set("outputVar", n.text());
                                }
                            }
                            self.touch_type(n);
                            self.scope.output_vars.insert(n.text().to_string());
                        }
                        return Some(step);
                    }
                }
            }
        }
        let call = awaited_call(init)?;
        if !(is_workflow_do_call(call) || is_workflow_approval_call(call) || is_scenario_step_call(call) || is_parallel_group(call) || is_parallel_fanout(call)) {
            return None;
        }
        self.add_error("Destructuring a step result is not supported in DSL workflows. Assign it to a variable first (e.g. `const result = await workflow.do(...)`) and read its properties.");
        None
    }

    fn extract_expression_statement(&mut self, stmt: P<Node>) -> Option<JsObj> {
        let mut expr = stmt.expression().unwrap();
        let mut output_var = String::new();
        let mut has_output = false;
        if ast::is_binary_expression(expr) && expr.as_binary_expression().operator_token().kind() == Kind::EqualsToken {
            let be = expr.as_binary_expression();
            if ast::is_identifier(be.left()) {
                output_var = be.left().text().to_string();
                has_output = true;
                if self.context_vars.has(&output_var) {
                    let rhs_call = awaited_call(Some(be.right()));
                    if rhs_call.is_none_or(|c| !(is_workflow_do_call(c) || is_workflow_approval_call(c))) {
                        if let Some(lit) = extract_literal_value(be.right()) {
                            return Some(jo!("type" => "set", "variable" => output_var, "value" => lit));
                        }
                        return Some(jo!("type" => "set", "variable" => output_var, "expression" => get_source_text(be.right())));
                    }
                }
            }
            expr = be.right();
        }
        let call = awaited_call(Some(expr))?;
        let ov = if has_output { Js::from(output_var.as_str()) } else { Js::Undef };
        if is_workflow_do_call(call) || is_scenario_step_call(call) {
            let step = if is_scenario_step_call(call) {
                self.extract_scenario_step(call, ov)
            } else if is_inline_do_call(call) {
                self.extract_inline_step(call)
            } else {
                self.extract_rpc_step(call, ov)
            };
            if has_output && !output_var.is_empty() && step.is_some() {
                self.touch_type(expr);
                self.scope.output_vars.insert(output_var);
            }
            return step;
        }
        if is_workflow_sleep_call(call) {
            return self.extract_sleep_step(call);
        }
        if is_workflow_suspend_call(call) {
            return self.extract_suspend_step(call);
        }
        if is_workflow_milestone_call(call) {
            return self.extract_milestone_step(call);
        }
        if is_workflow_approval_call(call) {
            let step = self.extract_approval_step(call, &output_var);
            if !output_var.is_empty() && step.is_some() {
                self.touch_type(expr);
                self.scope.output_vars.insert(output_var);
            }
            return step;
        }
        if is_parallel_fanout(call) {
            return self.extract_parallel_fanout(call);
        }
        if is_parallel_group(call) {
            return self.extract_parallel_group(call);
        }
        None
    }

    /// `outputVar` is a string or undefined.
    fn extract_rpc_step(&mut self, call: P<Node>, output_var: Js) -> Option<JsObj> {
        let args = call.arguments();
        if args.len() < 2 {
            return None;
        }
        let r = (|| -> Result<JsObj, &'static str> {
            let step_name = self.string_literal(args[0])?;
            let rpc_name = self.string_literal(args[1])?;
            let inputs = if args.len() >= 3 { self.extract_input_sources(args[2]) } else { Js::Undef };
            let expect_eventually = is_workflow_expect_eventually_call(call);
            let options_index = if expect_eventually { 4 } else { 3 };
            let options_arg = args.get(options_index).copied();
            let options = match options_arg {
                Some(o) if ast::is_object_literal_expression(o) => self.extract_step_options(o),
                _ => Js::Undef,
            };
            Ok(jo!(
                "type" => "rpc",
                "stepName" => step_name,
                "rpcName" => rpc_name,
                "outputVar" => output_var,
                "inputs" => inputs,
                "options" => options,
                "virtualUser" => extract_virtual_user_from_options(options_arg),
                "expectEventually" => if expect_eventually { Js::Bool(true) } else { Js::Undef },
            ))
        })();
        match r {
            Ok(o) => Some(o),
            Err(e) => {
                self.add_error(format!("Failed to extract RPC step: {e}"));
                None
            }
        }
    }

    fn extract_scenario_step(&mut self, call: P<Node>, output_var: Js) -> Option<JsObj> {
        let phase = scenario_step_phase(call);
        if phase.is_empty() {
            return None;
        }
        let args = call.arguments();
        if args.len() < 2 {
            return None;
        }
        let step_name = match self.string_literal(args[0]) {
            Ok(v) => v,
            Err(e) => {
                self.add_error(format!("Failed to extract scenario step: {e}"));
                return None;
            }
        };
        let step_func = self.string_literal(args[1]).unwrap_or_else(|_| DYNAMIC_SCENARIO_STEP_TARGET.to_string());
        let inputs = if args.len() >= 3 { self.extract_input_sources(args[2]) } else { Js::Undef };
        let options_arg = args.get(3).copied();
        let options = match options_arg {
            Some(o) if ast::is_object_literal_expression(o) => self.extract_step_options(o),
            _ => Js::Undef,
        };
        Some(jo!(
            "type" => "scenarioStep",
            "stepName" => step_name,
            "stepFunc" => step_func,
            "phase" => phase,
            "outputVar" => output_var,
            "inputs" => inputs,
            "options" => options,
            "virtualUser" => extract_virtual_user_from_options(options_arg),
        ))
    }

    fn extract_inline_step(&mut self, call: P<Node>) -> Option<JsObj> {
        let args = call.arguments();
        if args.len() < 2 {
            return None;
        }
        let step_name = match self.string_literal(args[0]) {
            Ok(v) => v,
            Err(e) => {
                self.add_error(format!("Failed to extract inline step: {e}"));
                return None;
            }
        };
        let mut options = Js::Undef;
        if args.len() >= 3 {
            let opt = args[args.len() - 1];
            if ast::is_object_literal_expression(opt) {
                options = self.extract_step_options(opt);
            }
        }
        Some(jo!("type" => "inline", "stepName" => step_name, "options" => options))
    }

    fn extract_step_options(&mut self, obj: P<Node>) -> Js {
        let mut options = JsObj::new();
        for p in obj.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            let init = p.initializer().unwrap();
            match p.name().unwrap().text() {
                "retries" => {
                    if let Some(v) = extract_number_literal(init) {
                        options.set("retries", v);
                    }
                }
                "retryDelay" => {
                    if ast::is_string_literal(init) {
                        options.set("retryDelay", init.text());
                    } else if let Some(v) = extract_number_literal(init) {
                        options.set("retryDelay", v);
                    }
                }
                "compensate" => {
                    if init.kind() == Kind::FalseKeyword {
                        options.set("compensate", false);
                    } else {
                        self.add_error("compensate on a call site can only be `false`: a step's compensation is declared on the function itself.");
                    }
                }
                "description" => {
                    if let Ok(v) = self.string_literal(init) {
                        options.set("description", v);
                    }
                }
                _ => {}
            }
        }
        if options.defined_len() == 0 { Js::Undef } else { Js::Obj(options) }
    }

    fn extract_sleep_step(&mut self, call: P<Node>) -> Option<JsObj> {
        let args = call.arguments();
        if args.len() < 2 {
            return None;
        }
        let step_name = match self.string_literal(args[0]) {
            Ok(v) => v,
            Err(e) => {
                self.add_error(format!("Failed to extract sleep step: {e}"));
                return None;
            }
        };
        let duration = if let Some(v) = extract_number_literal(args[1]) {
            Js::Num(v)
        } else if let Ok(v) = self.string_literal(args[1]) {
            Js::Str(v)
        } else {
            return Some(jo!("type" => "sleep", "stepName" => step_name, "duration" => "", "expression" => node_text(args[1])));
        };
        Some(jo!("type" => "sleep", "stepName" => step_name, "duration" => duration))
    }

    fn extract_suspend_step(&mut self, call: P<Node>) -> Option<JsObj> {
        let args = call.arguments();
        if args.is_empty() {
            return None;
        }
        match self.string_literal(args[0]) {
            Ok(reason) => Some(jo!("type" => "suspend", "reason" => reason)),
            Err(e) => {
                self.add_error(format!("Failed to extract suspend step: {e}"));
                None
            }
        }
    }

    fn extract_milestone_step(&mut self, call: P<Node>) -> Option<JsObj> {
        let args = call.arguments();
        if args.is_empty() {
            return None;
        }
        match self.string_literal(args[0]) {
            Ok(name) => Some(jo!("type" => "milestone", "name" => name)),
            Err(e) => {
                self.add_error(format!("Failed to extract milestone step: {e}"));
                None
            }
        }
    }

    /// The approval policy (expiry, approvers, approverScope) is read from the
    /// literal options; `schema` is a runtime value and is left out.
    fn extract_approval_step(&mut self, call: P<Node>, output_var: &str) -> Option<JsObj> {
        let args = call.arguments();
        if args.is_empty() {
            return None;
        }
        let reason = match self.string_literal(args[0]) {
            Ok(v) => v,
            Err(e) => {
                self.add_error(format!("Failed to extract approval step: {e}"));
                return None;
            }
        };
        let mut step = jo!("type" => "approval", "reason" => reason);
        if !output_var.is_empty() {
            step.set("outputVar", output_var);
        }
        if args.len() > 1 && ast::is_object_literal_expression(args[1]) {
            for p in args[1].properties() {
                if !ast::is_property_assignment(*p) {
                    continue;
                }
                let name = node_text(p.name().unwrap());
                let init = p.initializer().unwrap();
                if name == "expiry" {
                    if ast::is_numeric_literal(init) {
                        step.set("expiry", js_number(init.text()));
                    } else if ast::is_string_literal(init) {
                        step.set("expiry", init.text());
                    }
                }
                if name == "approvers" && ast::is_string_literal(init) {
                    step.set("approvers", init.text());
                }
                if name == "approverScope" && ast::is_string_literal(init) {
                    step.set("approverScope", init.text());
                }
            }
        }
        Some(step)
    }

    fn extract_branch(&mut self, stmt: P<Node>) -> JsObj {
        let mut branches = vec![];
        let mut else_steps = Js::Undef;
        let mut current = Some(stmt);
        while let Some(cur) = current {
            let is = cur.as_if_statement();
            let cond = parse_condition(is.expression());
            let then = is.then_statement();
            let steps = if ast::is_block(then) {
                self.extract_steps(then, true)
            } else {
                self.extract_steps_from_statement(then)
            };
            branches.push(jo!("condition" => cond, "steps" => steps));
            match is.else_statement() {
                None => current = None,
                Some(e) if ast::is_if_statement(e) => current = Some(e),
                Some(e) => {
                    let steps = if ast::is_block(e) {
                        self.extract_steps(e, true)
                    } else {
                        self.extract_steps_from_statement(e)
                    };
                    else_steps = Js::from(steps);
                    current = None;
                }
            }
        }
        jo!("type" => "branch", "branches" => branches, "elseSteps" => else_steps)
    }

    fn extract_steps_from_statement(&mut self, stmt: P<Node>) -> Vec<JsObj> {
        self.scope.depth += 1;
        let st = self.extract_step(stmt);
        self.scope.depth -= 1;
        st.into_iter().collect()
    }

    fn extract_switch(&mut self, stmt: P<Node>) -> JsObj {
        let ss = stmt.as_switch_statement();
        let expression = get_source_text(ss.expression());
        let mut cases = vec![];
        let mut default_steps = Js::Undef;
        for clause in ss.case_block().as_case_block().clauses().nodes() {
            let cl = clause.as_case_or_default_clause();
            if clause.kind() == Kind::CaseClause {
                let (value, expr) = extract_case_value(cl.expression().unwrap());
                let steps = self.extract_case_steps(cl.statements().nodes());
                cases.push(jo!("value" => value, "expression" => expr, "steps" => steps));
            } else {
                default_steps = Js::from(self.extract_case_steps(cl.statements().nodes()));
            }
        }
        jo!("type" => "switch", "expression" => expression, "cases" => cases, "defaultSteps" => default_steps)
    }

    fn extract_case_steps(&mut self, stmts: &[P<Node>]) -> Vec<JsObj> {
        let mut steps = vec![];
        self.scope.depth += 1;
        for stmt in stmts {
            if stmt.kind() == Kind::BreakStatement {
                break;
            }
            if let Some(st) = self.extract_step(*stmt) {
                steps.push(st);
            }
        }
        self.scope.depth -= 1;
        steps
    }

    fn extract_array_filter(&mut self, call: P<Node>, output_var: &str) -> Option<JsObj> {
        let (source_var, item_var, cond) = arrow_item_predicate(call)?;
        Some(jo!("type" => "filter", "sourceVar" => source_var, "itemVar" => item_var, "condition" => cond, "outputVar" => output_var))
    }

    fn extract_array_predicate(&mut self, call: P<Node>, output_var: &str) -> Option<JsObj> {
        let mode = property_call_name(call);
        let (source_var, item_var, cond) = arrow_item_predicate(call)?;
        Some(jo!("type" => "arrayPredicate", "mode" => mode, "sourceVar" => source_var, "itemVar" => item_var, "condition" => cond, "outputVar" => output_var))
    }

    fn extract_fanout_body_step(&mut self, stmt: P<Node>, body: &mut Vec<JsObj>) {
        if ast::is_variable_statement(stmt) {
            let decls = declarations(stmt);
            if decls.len() != 1 {
                return;
            }
            let decl = decls[0];
            let Some(call) = awaited_call(decl.initializer()) else { return };
            if !is_workflow_do_call(call) && !is_scenario_step_call(call) {
                return;
            }
            let name = decl.name().unwrap();
            let var_name = if ast::is_identifier(name) { Js::from(name.text()) } else { Js::Undef };
            let step = if is_scenario_step_call(call) {
                self.extract_scenario_step(call, var_name.clone())
            } else {
                self.extract_rpc_step(call, var_name.clone())
            };
            let Some(step) = step else { return };
            if let Js::Str(n) = var_name {
                self.touch_type(decl);
                self.scope.output_vars.insert(n);
            }
            body.push(step);
            return;
        }
        if !ast::is_expression_statement(stmt) && !ast::is_return_statement(stmt) {
            return;
        }
        let Some(expr) = stmt.expression() else { return };
        let Some(call) = call_of(expr) else { return };
        let st = if is_workflow_sleep_call(call) {
            self.extract_sleep_step(call)
        } else if is_workflow_suspend_call(call) {
            self.extract_suspend_step(call)
        } else if is_workflow_milestone_call(call) {
            self.extract_milestone_step(call)
        } else if is_scenario_step_call(call) {
            self.extract_scenario_step(call, Js::Undef)
        } else if is_workflow_do_call(call) {
            self.extract_rpc_step(call, Js::Undef)
        } else {
            None
        };
        if let Some(st) = st {
            body.push(st);
        }
    }

    fn extract_parallel_fanout(&mut self, call: P<Node>) -> Option<JsObj> {
        let map_call = call.arguments()[0];
        if !ast::is_call_expression(map_call) || !ast::is_property_access_expression(map_call.expression().unwrap()) {
            return None;
        }
        let source_var = extract_source_path(map_call.expression().unwrap().expression().unwrap())?;
        let margs = map_call.arguments();
        if margs.is_empty() || !ast::is_arrow_function(margs[0]) {
            return None;
        }
        let map_fn = margs[0];
        let params = map_fn.parameters();
        if params.is_empty() || !params[0].name().is_some_and(ast::is_identifier) {
            return None;
        }
        let item_var = params[0].name().unwrap().text().to_string();
        let body = self.in_child(&item_var, |c| {
            let mut body = vec![];
            let fb = map_fn.body().unwrap();
            if ast::is_block(fb) {
                for stmt in fb.statements() {
                    c.extract_fanout_body_step(*stmt, &mut body);
                }
            } else if let Some(do_call) = call_of(fb) {
                if is_scenario_step_call(do_call) {
                    if let Some(st) = c.extract_scenario_step(do_call, Js::Undef) {
                        body.push(st);
                    }
                } else if is_workflow_do_call(do_call) {
                    if let Some(st) = c.extract_rpc_step(do_call, Js::Undef) {
                        body.push(st);
                    }
                }
            }
            body
        });
        if body.is_empty() {
            return None;
        }
        Some(jo!("type" => "fanout", "sourceVar" => source_var, "itemVar" => item_var, "mode" => "parallel", "body" => body))
    }

    fn extract_parallel_group(&mut self, call: P<Node>) -> Option<JsObj> {
        let args = call.arguments();
        if args.is_empty() || !ast::is_array_literal_expression(args[0]) {
            return None;
        }
        let mut children = vec![];
        for el in args[0].elements() {
            if !ast::is_call_expression(*el) {
                continue;
            }
            let st = if is_scenario_step_call(*el) {
                self.extract_scenario_step(*el, Js::Undef)
            } else if is_workflow_do_call(*el) {
                self.extract_rpc_step(*el, Js::Undef)
            } else {
                None
            };
            if let Some(st) = st {
                children.push(st);
            }
        }
        if children.is_empty() {
            return None;
        }
        Some(jo!("type" => "parallel", "children" => children))
    }

    /// Reads a `timeBetween` from an `await workflow.sleep(...)` expression
    /// statement; `None` when the statement is not one or its duration does not
    /// resolve.
    fn sleep_time_between(&mut self, stmt: P<Node>) -> Option<String> {
        if !ast::is_expression_statement(stmt) {
            return None;
        }
        let call = awaited_call(stmt.expression())?;
        if !is_workflow_sleep_call(call) {
            return None;
        }
        let args = call.arguments();
        if args.len() < 2 {
            return None;
        }
        if let Some(v) = extract_number_literal(args[1]) {
            return Some(format!("{}ms", crate::jsjson::format_number(v)));
        }
        self.string_literal(args[1]).ok()
    }

    fn extract_sequential_fanout(&mut self, stmt: P<Node>, reason: &mut String) -> Option<JsObj> {
        if !is_sequential_fanout(stmt) {
            return None;
        }
        let (item_var, source_var) = extract_for_of_variable(stmt)?;
        let loop_body = stmt.as_for_in_or_of_statement().statement();
        let body_statements: Vec<P<Node>> =
            if ast::is_block(loop_body) { loop_body.statements().to_vec() } else { vec![loop_body] };
        let (body, time_between) = self.in_child(&item_var, |c| {
            let mut body = vec![];
            let mut time_between = Js::Undef;
            for st in &body_statements {
                c.extract_fanout_body_step(*st, &mut body);
                if let Some(v) = c.sleep_time_between(*st) {
                    time_between = Js::Str(v);
                }
                if ast::is_if_statement(*st) {
                    let then = st.as_if_statement().then_statement();
                    if ast::is_block(then) {
                        for ts in then.statements() {
                            if let Some(v) = c.sleep_time_between(*ts) {
                                time_between = Js::Str(v);
                            }
                        }
                    }
                }
            }
            (body, time_between)
        });
        if body.is_empty() {
            let branching = body_statements.iter().any(|s| ast::is_if_statement(*s) || ast::is_switch_statement(*s));
            *reason = if branching {
                "its body only calls 'workflow.do' inside an if/switch, and a DSL fanout body is a flat list of steps with no branch member — the DSL cannot express a per-item condition. Use pikkuWorkflowComplexFunc, or lift the condition out of the loop.".to_string()
            } else {
                "its body contains no 'workflow.do' call the DSL can model. Use pikkuWorkflowComplexFunc for a loop that does other work.".to_string()
            };
            return None;
        }
        Some(jo!("type" => "fanout", "sourceVar" => source_var, "itemVar" => item_var, "mode" => "sequential", "body" => body, "timeBetween" => time_between))
    }

    fn extract_output_binding(&mut self, expr: P<Node>) -> JsObj {
        if ast::is_property_access_expression(expr) {
            let prop_path = expr.name().unwrap().text();
            let recv = expr.expression().unwrap();
            // TS compares a null objName to a null inputParamName, so a non-identifier
            // receiver in a workflow without an input parameter reads as input.
            if !ast::is_identifier(recv) && self.scope.input_param_name.is_none() {
                return jo!("from" => "input", "path" => prop_path);
            }
            if ast::is_identifier(recv) {
                let obj_name = recv.text();
                if self.scope.output_vars.contains(obj_name) {
                    return jo!("from" => "outputVar", "name" => obj_name, "path" => prop_path);
                }
                if self.context_vars.has(obj_name) {
                    return jo!("from" => "stateVar", "name" => obj_name, "path" => prop_path);
                }
                if self.is_input_param(obj_name) {
                    return jo!("from" => "input", "path" => prop_path);
                }
            }
        }
        if ast::is_identifier(expr) {
            let name = expr.text();
            if self.scope.output_vars.contains(name) {
                return jo!("from" => "outputVar", "name" => name);
            }
            if self.context_vars.has(name) {
                return jo!("from" => "stateVar", "name" => name);
            }
            if self.is_input_param(name) {
                return jo!("from" => "input", "path" => name);
            }
        }
        if let Some(v) = literal_scalar(expr) {
            return jo!("from" => "literal", "value" => v);
        }
        jo!("from" => "expression", "expression" => get_source_text(expr))
    }

    fn extract_return(&mut self, stmt: P<Node>) -> Option<JsObj> {
        let expr = stmt.expression()?;
        if let Some(call) = call_of(expr) {
            if is_workflow_do_call(call) {
                if is_inline_do_call(call) {
                    return self.extract_inline_step(call);
                }
                return self.extract_rpc_step(call, Js::Undef);
            }
            if is_workflow_sleep_call(call) {
                return self.extract_sleep_step(call);
            }
        }
        if ast::is_identifier(expr) {
            let name = expr.text();
            if self.scope.output_vars.contains(name) || self.context_vars.has(name) {
                return Some(jo!("type" => "return", "outputs" => JsObj::new(), "spread" => vec![name.to_string()]));
            }
            return None;
        }
        if !ast::is_object_literal_expression(expr) {
            return None;
        }
        let mut outputs = JsObj::new();
        let mut spread: Vec<String> = vec![];
        for p in expr.properties() {
            if ast::is_property_assignment(*p) || ast::is_shorthand_property_assignment(*p) {
                if !p.name().is_some_and(ast::is_identifier) {
                    continue;
                }
                let prop_name = p.name().unwrap().text();
                let binding = if ast::is_shorthand_property_assignment(*p) {
                    if self.scope.output_vars.contains(prop_name) {
                        jo!("from" => "outputVar", "name" => prop_name)
                    } else if self.context_vars.has(prop_name) {
                        jo!("from" => "stateVar", "name" => prop_name)
                    } else {
                        jo!("from" => "input", "path" => prop_name)
                    }
                } else {
                    self.extract_output_binding(p.initializer().unwrap())
                };
                outputs.set(prop_name, binding);
            } else if ast::is_spread_assignment(*p) && p.expression().is_some_and(ast::is_identifier) {
                spread.push(p.expression().unwrap().text().to_string());
            }
        }
        if outputs.defined_len() == 0 && spread.is_empty() {
            return None;
        }
        let mut ret = jo!("type" => "return", "outputs" => outputs);
        if !spread.is_empty() {
            ret.set("spread", spread);
        }
        Some(ret)
    }

    /// An object of input sources, "passthrough" or undefined.
    fn extract_input_sources(&mut self, n: P<Node>) -> Js {
        if ast::is_identifier(n) && (self.is_input_param(n.text()) || self.scope.output_vars.contains(n.text())) {
            return Js::from("passthrough");
        }
        if !ast::is_object_literal_expression(n) {
            return Js::Undef;
        }
        let mut inputs = JsObj::new();
        for p in n.properties() {
            if !ast::is_property_assignment(*p) && !ast::is_shorthand_property_assignment(*p) {
                continue;
            }
            if !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            let prop_name = p.name().unwrap().text();
            let source = if ast::is_shorthand_property_assignment(*p) {
                Some(if self.scope.loop_vars.contains(prop_name) {
                    jo!("from" => "item", "path" => prop_name)
                } else if self.scope.output_vars.contains(prop_name) {
                    jo!("from" => "outputVar", "name" => prop_name)
                } else if let Some(v) = self.resolve_constant_value(p.name().unwrap()) {
                    jo!("from" => "literal", "value" => v)
                } else {
                    jo!("from" => "input", "path" => prop_name)
                })
            } else {
                self.extract_input_source(p.initializer().unwrap())
            };
            if let Some(source) = source {
                inputs.set(prop_name, source);
            }
        }
        if inputs.defined_len() == 0 { Js::Undef } else { Js::Obj(inputs) }
    }

    fn extract_input_source(&mut self, n: P<Node>) -> Option<JsObj> {
        if ast::is_property_access_expression(n) && n.expression().is_some_and(ast::is_identifier) {
            let obj_name = n.expression().unwrap().text();
            let prop_name = n.name().unwrap().text();
            if self.is_input_param(obj_name) {
                return Some(jo!("from" => "input", "path" => prop_name));
            }
            if self.scope.loop_vars.contains(obj_name) {
                return Some(jo!("from" => "item", "path" => prop_name));
            }
            if self.scope.output_vars.contains(obj_name) {
                return Some(jo!("from" => "outputVar", "name" => obj_name, "path" => prop_name));
            }
        }
        if ast::is_identifier(n) {
            let name = n.text();
            if self.scope.loop_vars.contains(name) {
                return Some(jo!("from" => "item", "path" => name));
            }
            if self.scope.output_vars.contains(name) {
                return Some(jo!("from" => "outputVar", "name" => name));
            }
            if let Some(v) = self.resolve_constant_value(n) {
                return Some(jo!("from" => "literal", "value" => v));
            }
            return Some(jo!("from" => "input", "path" => name));
        }
        if let Some(v) = literal_scalar(n) {
            return Some(jo!("from" => "literal", "value" => v));
        }
        if ast::is_object_literal_expression(n) {
            let mut obj = JsObj::new();
            for p in n.properties() {
                if ast::is_property_assignment(*p) && p.name().is_some_and(ast::is_identifier) {
                    if let Some(src) = self.extract_input_source(p.initializer().unwrap()) {
                        obj.set(p.name().unwrap().text(), input_source_to_inline_value(&src));
                    }
                }
            }
            return Some(jo!("from" => "literal", "value" => obj));
        }
        if ast::is_array_literal_expression(n) {
            let mut arr = vec![];
            for el in n.elements() {
                if let Some(src) = self.extract_input_source(*el) {
                    arr.push(input_source_to_inline_value(&src));
                }
            }
            return Some(jo!("from" => "literal", "value" => Js::Arr(arr)));
        }
        if ast::is_no_substitution_template_literal(n) {
            return Some(jo!("from" => "literal", "value" => n.text()));
        }
        if ast::is_template_expression(n) {
            let te = n.as_template_expression();
            let mut parts = vec![te.head().text().to_string()];
            let mut exprs: Vec<JsObj> = vec![];
            for span in te.template_spans().nodes() {
                let sp = span.as_template_span();
                if let Some(src) = self.extract_input_source(sp.expression()) {
                    exprs.push(src);
                } else {
                    exprs.push(jo!("from" => "literal", "value" => get_source_text(sp.expression())));
                }
                parts.push(sp.literal().text().to_string());
            }
            return Some(jo!("from" => "template", "parts" => parts, "expressions" => exprs));
        }
        None
    }

    /// Resolves an identifier naming a `const` with a fully literal initializer
    /// to that value.
    fn resolve_constant_value(&mut self, id: P<Node>) -> Option<Js> {
        let sym = self.s.symbol_at(id)?;
        let decl = sym.value_declaration().or_else(|| sym.declarations().first().copied())?;
        if !ast::is_variable_declaration(decl) {
            return None;
        }
        let list = decl.parent()?;
        if !ast::is_variable_declaration_list(list) || !list.flags().intersects(NodeFlags::Const) {
            return None;
        }
        extract_literal_value(decl.initializer()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inline_values_of_input_sources() {
        let lit = jo!("from" => "literal", "value" => 3.0);
        assert_eq!(input_source_to_inline_value(&lit), Js::Num(3.0));
        let item = jo!("from" => "item", "path" => "id");
        assert_eq!(
            input_source_to_inline_value(&item).to_value().unwrap().to_string(),
            r#"{"$ref":"$item","path":"id"}"#
        );
        let tpl = jo!("from" => "template", "parts" => vec!["a".to_string(), "".to_string()], "expressions" => vec![jo!("from" => "input", "path" => "x")]);
        assert_eq!(
            input_source_to_inline_value(&tpl).to_value().unwrap().to_string(),
            r#"{"$template":{"parts":["a",""],"expressions":[{"$ref":"trigger","path":"x"}]}}"#
        );
    }
}
