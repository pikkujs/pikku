//! Port of Go `visit/workflow_dsl_patterns.go`: utils/workflow/dsl/patterns.ts
//! and utils/workflow/dsl/validation.ts.

use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::workflow_jsobj::Js;
use crate::tsutil::{self, node_text};

/// inspector-constants.ts DYNAMIC_SCENARIO_STEP_TARGET.
pub const DYNAMIC_SCENARIO_STEP_TARGET: &str = "<dynamic>";

/// The wire handed to a DSL func is named `workflow` in a workflow and
/// `scenario` in a scenario.
fn is_workflow_wire_identifier(expr: P<Node>) -> bool {
    ast::is_identifier(expr) && (expr.text() == "workflow" || expr.text() == "scenario")
}

/// The method name of a `workflow.<m>(...)` / `scenario.<m>(...)` call, or "".
pub fn wire_method(call: P<Node>) -> &'static str {
    let callee = call.expression().unwrap();
    if !ast::is_property_access_expression(callee) || !is_workflow_wire_identifier(callee.expression().unwrap()) {
        return "";
    }
    callee.name().unwrap().text()
}

pub fn is_workflow_do_call(call: P<Node>) -> bool {
    let m = wire_method(call);
    m == "do" || m == "expectEventually"
}

pub fn scenario_step_phase(call: P<Node>) -> &'static str {
    match wire_method(call) {
        m @ ("given" | "when" | "then") => m,
        _ => "",
    }
}

pub fn is_scenario_step_call(call: P<Node>) -> bool {
    !scenario_step_phase(call).is_empty()
}

pub fn is_scenario_expectation_call(call: P<Node>) -> bool {
    matches!(wire_method(call), "expectService" | "expectError" | "expectEventually" | "expectScore")
}

pub fn is_workflow_expect_eventually_call(call: P<Node>) -> bool {
    wire_method(call) == "expectEventually"
}
pub fn is_workflow_sleep_call(call: P<Node>) -> bool {
    wire_method(call) == "sleep"
}
pub fn is_workflow_suspend_call(call: P<Node>) -> bool {
    wire_method(call) == "suspend"
}
pub fn is_workflow_milestone_call(call: P<Node>) -> bool {
    wire_method(call) == "milestone"
}
pub fn is_workflow_approval_call(call: P<Node>) -> bool {
    wire_method(call) == "approval"
}

/// `{ virtualUser: virtualUsers.x }` gives "x" (also `virtualUsers['x']`).
pub fn extract_virtual_user_from_options(options_arg: Option<P<Node>>) -> Js {
    let Some(opts) = options_arg.filter(|o| ast::is_object_literal_expression(*o)) else { return Js::Undef };
    for p in opts.properties() {
        if !ast::is_property_assignment(*p)
            || !p.name().is_some_and(ast::is_identifier)
            || p.name().unwrap().text() != "virtualUser"
        {
            continue;
        }
        let init = p.initializer().unwrap();
        if ast::is_property_access_expression(init) {
            return Js::from(init.name().unwrap().text());
        }
        if ast::is_element_access_expression(init) {
            let arg = init.as_element_access_expression().argument_expression();
            if ast::is_string_literal(arg) {
                return Js::from(arg.text());
            }
        }
    }
    Js::Undef
}

pub fn is_throw_cancel_exception(stmt: P<Node>) -> bool {
    let Some(expr) = stmt.expression() else { return false };
    if (ast::is_new_expression(expr) || ast::is_call_expression(expr))
        && expr.expression().is_some_and(ast::is_identifier)
    {
        return expr.expression().unwrap().text() == "WorkflowCancelledException";
    }
    false
}

pub fn extract_cancel_reason(stmt: P<Node>) -> Js {
    let Some(expr) = stmt.expression() else { return Js::Undef };
    let args: &[P<Node>] = if ast::is_new_expression(expr) {
        match expr.as_new_expression().arguments() {
            Some(l) => l.nodes(),
            None => &[],
        }
    } else if ast::is_call_expression(expr) {
        expr.arguments()
    } else {
        &[]
    };
    if let Some(a) = args.first() {
        if ast::is_string_literal(*a) {
            return Js::from(a.text());
        }
        return Js::from(node_text(*a));
    }
    Js::Undef
}

pub fn property_call_name(call: P<Node>) -> &'static str {
    let callee = call.expression().unwrap();
    if !ast::is_property_access_expression(callee) {
        return "";
    }
    callee.name().unwrap().text()
}

pub fn is_promise_all(call: P<Node>) -> bool {
    let callee = call.expression().unwrap();
    ast::is_property_access_expression(callee)
        && callee.expression().is_some_and(ast::is_identifier)
        && callee.expression().unwrap().text() == "Promise"
        && callee.name().unwrap().text() == "all"
}

/// `Promise.all(array.map(...))`.
pub fn is_parallel_fanout(call: P<Node>) -> bool {
    if !is_promise_all(call) {
        return false;
    }
    let args = call.arguments();
    if args.is_empty() || !ast::is_call_expression(args[0]) {
        return false;
    }
    property_call_name(args[0]) == "map"
}

/// `Promise.all([...])`.
pub fn is_parallel_group(call: P<Node>) -> bool {
    if !is_promise_all(call) {
        return false;
    }
    let args = call.arguments();
    !args.is_empty() && ast::is_array_literal_expression(args[0])
}

pub fn is_sequential_fanout(stmt: P<Node>) -> bool {
    let init = stmt.as_for_in_or_of_statement().initializer();
    if !ast::is_variable_declaration_list(init) {
        return false;
    }
    if !init.flags().intersects(ast::NodeFlags::Const) {
        return false;
    }
    init.as_variable_declaration_list().declarations().nodes().len() == 1
}

/// `data.memberEmails` gives "data.memberEmails".
pub fn extract_source_path(expr: P<Node>) -> Option<String> {
    if ast::is_identifier(expr) {
        return Some(expr.text().to_string());
    }
    if ast::is_property_access_expression(expr) {
        if let Some(base) = extract_source_path(expr.expression().unwrap()) {
            return Some(format!("{base}.{}", expr.name().unwrap().text()));
        }
    }
    None
}

/// `(itemVar, sourceVar)` of a `for (const x of a.b)`.
pub fn extract_for_of_variable(stmt: P<Node>) -> Option<(String, String)> {
    let fs = stmt.as_for_in_or_of_statement();
    let init = fs.initializer();
    if !ast::is_variable_declaration_list(init) {
        return None;
    }
    let decl = init.as_variable_declaration_list().declarations().nodes()[0];
    if !decl.name().is_some_and(ast::is_identifier) {
        return None;
    }
    let src = extract_source_path(fs.expression())?;
    Some((decl.name().unwrap().text().to_string(), src))
}

/// `node.getText().trim()`.
pub fn get_source_text(n: P<Node>) -> String {
    node_text(n).trim().to_string()
}

/// `ts.SyntaxKind[kind]`: the enum's reverse mapping, where a marker alias
/// declared later (FirstStatement, LastStatement) wins.
fn syntax_kind_name(k: Kind) -> String {
    match k {
        Kind::VariableStatement => "FirstStatement".to_string(),
        Kind::DebuggerStatement => "LastStatement".to_string(),
        _ => format!("{k:?}"),
    }
}

fn is_dsl_allowed_statement(n: P<Node>) -> bool {
    matches!(
        n.kind(),
        Kind::VariableStatement
            | Kind::ExpressionStatement
            | Kind::IfStatement
            | Kind::SwitchStatement
            | Kind::ForOfStatement
            | Kind::ReturnStatement
            | Kind::ThrowStatement
    )
}

fn visit_block(block: P<Node>, allow_inline: bool, errs: &mut Vec<String>) {
    for stmt in block.statements() {
        if is_dsl_allowed_statement(*stmt) {
            visit_pattern_node(*stmt, allow_inline, errs);
            continue;
        }
        let name = syntax_kind_name(stmt.kind());
        errs.push(format!(
            "Statement type '{name}' is not allowed in DSL workflows. Allowed: const/let, if/else, switch/case, for..of, return, throw, and workflow calls. If this should be supported, please report the node type: {name}"
        ));
    }
}

fn visit_pattern_node(n: P<Node>, allow_inline: bool, errs: &mut Vec<String>) {
    if allow_inline && (ast::is_arrow_function(n) || ast::is_function_expression(n)) {
        return;
    }
    match n.kind() {
        Kind::WhileStatement | Kind::DoStatement => {
            errs.push("while and do-while loops are not allowed in DSL workflows".to_string());
            return;
        }
        Kind::ForInStatement | Kind::ForStatement => {
            errs.push("for and for-in loops are not allowed in DSL workflows. Use for-of instead.".to_string());
            return;
        }
        _ => {}
    }
    if !allow_inline && ast::is_call_expression(n) && wire_method(n) == "do" {
        let args = n.arguments();
        if args.len() > 1 && tsutil::is_function_like(args[1]) {
            errs.push(
                "Inline workflow.do with function argument is not allowed in DSL workflows. Use pikkuWorkflowComplexFunc instead."
                    .to_string(),
            );
            return;
        }
    }
    if ast::is_block(n) {
        visit_block(n, allow_inline, errs);
    } else {
        n.for_each_child(&mut |c| {
            visit_pattern_node(c, allow_inline, errs);
            false
        });
    }
}

pub fn validate_no_disallowed_patterns(root: P<Node>, allow_inline: bool) -> Vec<String> {
    let mut errs = Vec::new();
    visit_pattern_node(root, allow_inline, &mut errs);
    errs
}

fn visit_awaited(n: P<Node>, parent_is_await: bool, inside_promise_all: bool, errs: &mut Vec<String>) {
    let children = |errs: &mut Vec<String>, parent_is_await: bool, inside: bool| {
        n.for_each_child(&mut |c| {
            visit_awaited(c, parent_is_await, inside, errs);
            false
        });
    };
    if ast::is_call_expression(n) && ast::is_property_access_expression(n.expression().unwrap()) {
        if is_promise_all(n) || n.expression().unwrap().name().unwrap().text() == "push" {
            children(errs, parent_is_await, true);
            return;
        }
    }
    if ast::is_array_literal_expression(n) {
        children(errs, parent_is_await, true);
        return;
    }
    if ast::is_call_expression(n) {
        let m = wire_method(n);
        if m == "do" || m == "sleep" {
            if !parent_is_await && !inside_promise_all {
                errs.push(format!("workflow.{m}() must be awaited"));
            }
            return;
        }
    }
    if ast::is_await_expression(n) {
        visit_awaited(n.expression().unwrap(), true, inside_promise_all, errs);
    } else {
        children(errs, false, inside_promise_all);
    }
}

pub fn validate_awaited_calls(root: P<Node>) -> Vec<String> {
    let mut errs = Vec::new();
    visit_awaited(root, false, false, &mut errs);
    errs
}

pub fn format_validation_errors(errs: &[String]) -> String {
    errs.iter().map(|e| format!("- {e}")).collect::<Vec<_>>().join("\n")
}
