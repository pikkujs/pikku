//! Port of Go `tsutil/props.go`: object-literal property readers and the RPC
//! call collectors (`walk.go`'s `CollectInvokedRpcNames` / `CollectStartedWorkflows`
//! live here too).

use std::collections::BTreeSet;

use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::{node_text, walk_self};

/// `FindPropertyAssignment`: the first `name: value` property whose name is the
/// identifier `name`.
pub fn find_property_assignment(obj: P<Node>, name: &str) -> Option<P<Node>> {
    obj.properties().iter().copied().find(|p| {
        ast::is_property_assignment(*p) && p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == name)
    })
}

/// `p.initializer` of a property assignment.
pub fn initializer_of(p: P<Node>) -> P<Node> {
    p.initializer().expect("property assignment without initializer")
}

/// `UnwrapAs`: strips `as` and `satisfies`.
pub fn unwrap_as(mut n: P<Node>) -> P<Node> {
    while super::is_as_expression(n) || ast::is_satisfies_expression(n) {
        n = n.expression().unwrap();
    }
    n
}

/// `FoldStaticString`: a string literal, template without substitutions, or a
/// `+` chain of them (through parentheses and casts).
pub fn fold_static_string(n: P<Node>) -> Option<String> {
    if ast::is_string_literal(n) || ast::is_no_substitution_template_literal(n) {
        return Some(n.text().to_string());
    }
    if ast::is_parenthesized_expression(n) || super::is_as_expression(n) || n.kind() == Kind::TypeAssertionExpression {
        return fold_static_string(n.expression().unwrap());
    }
    if ast::is_binary_expression(n) {
        let be = n.as_binary_expression();
        if be.operator_token().kind() != Kind::PlusToken {
            return None;
        }
        let l = fold_static_string(be.left())?;
        let r = fold_static_string(be.right())?;
        return Some(l + &r);
    }
    None
}

/// `PropValue`: the union `getPropertyValue` returns:
/// `string | string[] | number | boolean | null`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PropValue {
    pub present: bool,
    pub str: Option<String>,
    pub strs: Option<Vec<String>>,
    pub num: Option<f64>,
    pub bool: Option<bool>,
}

/// `GetPropertyValue`.
pub fn get_property_value(obj: P<Node>, name: &str) -> PropValue {
    let Some(p) = find_property_assignment(obj, name) else { return PropValue::default() };
    let init = initializer_of(p);
    if (name == "query" || name == "tags") && ast::is_array_literal_expression(init) {
        let out: Vec<String> = init
            .elements()
            .iter()
            .filter(|e| ast::is_string_literal(**e))
            .map(|e| e.text().to_string())
            .collect();
        if out.is_empty() {
            return PropValue::default();
        }
        return PropValue { present: true, strs: Some(out), ..Default::default() };
    }
    match init.kind() {
        Kind::TrueKeyword => return PropValue { present: true, bool: Some(true), ..Default::default() },
        Kind::FalseKeyword => return PropValue { present: true, bool: Some(false), ..Default::default() },
        _ => {}
    }
    if ast::is_numeric_literal(init) {
        if name == "name" || name == "schedule" {
            return PropValue { present: true, str: Some(init.text().to_string()), ..Default::default() };
        }
        let f = super::js_number(init.text());
        // Go: strconv.ParseFloat error is ignored, giving 0 for NaN text.
        let f = if f.is_nan() { 0.0 } else { f };
        return PropValue { present: true, num: Some(f), ..Default::default() };
    }
    if let Some(s) = fold_static_string(init) {
        return PropValue { present: true, str: Some(s), ..Default::default() };
    }
    PropValue { present: true, str: Some(node_text(init).to_string()), ..Default::default() }
}

impl PropValue {
    /// `GetPropertyValue(...) as boolean | undefined` followed by `|| undefined`.
    pub fn truthy(&self) -> bool {
        if let Some(b) = self.bool {
            return b;
        }
        if let Some(s) = &self.str {
            return !s.is_empty();
        }
        if let Some(n) = self.num {
            return n != 0.0;
        }
        self.strs.is_some()
    }

    /// The string, or "".
    pub fn as_string(&self) -> String {
        self.str.clone().unwrap_or_default()
    }
}

/// `GetArrayPropertyValue`: the string-literal elements of an array literal
/// property (through `as`); `None` when the property is not one.
pub fn get_array_property_value(obj: P<Node>, name: &str) -> Option<Vec<String>> {
    let p = find_property_assignment(obj, name)?;
    let init = unwrap_as(initializer_of(p));
    if !ast::is_array_literal_expression(init) {
        return None;
    }
    Some(init.elements().iter().filter(|e| ast::is_string_literal(**e)).map(|e| e.text().to_string()).collect())
}

/// `BindingNames`: the property names of an object binding pattern parameter.
pub fn binding_names(param: P<Node>) -> Vec<String> {
    let mut out = Vec::new();
    for e in param.name().unwrap().elements() {
        let pn = e.property_name();
        match (pn, e.name()) {
            (Some(pn), _) if ast::is_identifier(pn) => out.push(pn.text().to_string()),
            (_, Some(n)) if ast::is_identifier(n) => out.push(n.text().to_string()),
            _ => {}
        }
    }
    out
}

/// `ParamAt`.
pub fn param_at(f: P<Node>, i: usize) -> Option<P<Node>> {
    f.parameters().get(i).copied()
}

/// `UnwrapNonNullParens`.
pub fn unwrap_non_null_parens(mut n: P<Node>) -> P<Node> {
    while ast::is_non_null_expression(n) || ast::is_parenthesized_expression(n) {
        n = n.expression().unwrap();
    }
    n
}

/// `IsRpcExpr`: `rpc` or `<anything>.rpc`.
pub fn is_rpc_expr(n: P<Node>) -> bool {
    let inner = unwrap_non_null_parens(n);
    if ast::is_identifier(inner) {
        return inner.text() == "rpc";
    }
    ast::is_property_access_expression(inner) && inner.name().unwrap().text() == "rpc"
}

/// `InvokedRpcs` (collectInvokedRpcNames): the names a handler passes as a
/// literal to rpc.invoke / rpc.mesh, and the source text of the calls whose
/// name is computed.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct InvokedRpcs {
    pub names: Vec<String>,
    pub dynamic: Vec<String>,
}

fn is_literal_name(arg: P<Node>) -> bool {
    ast::is_string_literal(arg) || ast::is_no_substitution_template_literal(arg)
}

/// `CollectInvokedRpcNames`.
pub fn collect_invoked_rpc_names(body: P<Node>) -> InvokedRpcs {
    let mut names = BTreeSet::new();
    let mut dynamic = Vec::new();
    walk_self(body, &mut |n| {
        if !ast::is_call_expression(n) || !ast::is_property_access_expression(n.expression().unwrap()) {
            return;
        }
        let pa = n.expression().unwrap();
        let m = pa.name().unwrap().text();
        if (m == "invoke" || m == "mesh") && is_rpc_expr(pa.expression().unwrap()) {
            if let Some(a0) = n.arguments().first() {
                if is_literal_name(*a0) {
                    names.insert(a0.text().to_string());
                } else {
                    dynamic.push(node_text(n).to_string());
                }
            }
        }
    });
    InvokedRpcs { names: names.into_iter().collect(), dynamic }
}

/// `StartedWorkflows` (collectStartedWorkflows).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StartedWorkflows {
    pub names: Vec<String>,
    pub dynamic: Vec<String>,
    pub rpc_handoffs: Vec<String>,
}

/// `passesRpc`: `rpc`, `wire.rpc`, `{ rpc }` or `{ rpc: wire.rpc }`.
fn passes_rpc(arg: P<Node>) -> bool {
    if is_rpc_expr(arg) {
        return true;
    }
    let inner = unwrap_non_null_parens(arg);
    if !ast::is_object_literal_expression(inner) {
        return false;
    }
    inner.properties().iter().any(|p| {
        (ast::is_shorthand_property_assignment(*p) && p.name().unwrap().text() == "rpc")
            || (ast::is_property_assignment(*p) && is_rpc_expr(initializer_of(*p)))
    })
}

/// `CollectStartedWorkflows`.
pub fn collect_started_workflows(body: P<Node>) -> StartedWorkflows {
    let mut names = BTreeSet::new();
    let mut handoffs = BTreeSet::new();
    let mut dynamic = Vec::new();
    walk_self(body, &mut |n| {
        if !ast::is_call_expression(n) {
            return;
        }
        let callee = n.expression().unwrap();
        let args = n.arguments();
        if ast::is_property_access_expression(callee)
            && is_rpc_expr(callee.expression().unwrap())
            && callee.name().unwrap().text() == "startWorkflow"
        {
            if let Some(a0) = args.first() {
                if is_literal_name(*a0) {
                    names.insert(a0.text().to_string());
                } else {
                    dynamic.push(node_text(n).to_string());
                }
            }
        } else if ast::is_identifier(callee) && args.iter().any(|a| passes_rpc(*a)) {
            handoffs.insert(callee.text().to_string());
        }
    });
    StartedWorkflows {
        names: names.into_iter().collect(),
        dynamic,
        rpc_handoffs: handoffs.into_iter().collect(),
    }
}
