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
        // Go: `f, _ := strconv.ParseFloat(text, 64)`; an error leaves 0.
        let f = init.text().parse::<f64>().unwrap_or(0.0);
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
    /// The name argument of each `dynamic` call, so the caller can still accept
    /// one the checker resolves to a single literal.
    pub dynamic_args: Vec<P<Node>>,
}

fn is_literal_name(arg: P<Node>) -> bool {
    ast::is_string_literal(arg) || ast::is_no_substitution_template_literal(arg)
}

/// `CollectInvokedRpcNames`.
pub fn collect_invoked_rpc_names(body: P<Node>) -> InvokedRpcs {
    let mut names = BTreeSet::new();
    let mut dynamic = Vec::new();
    let mut dynamic_args = Vec::new();
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
                    dynamic_args.push(*a0);
                }
            }
        }
    });
    InvokedRpcs { names: names.into_iter().collect(), dynamic, dynamic_args }
}

/// `StartedWorkflows` (collectStartedWorkflows).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StartedWorkflows {
    pub names: Vec<String>,
    pub dynamic: Vec<String>,
    pub dynamic_args: Vec<P<Node>>,
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
    let mut dynamic_args = Vec::new();
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
                    dynamic_args.push(*a0);
                }
            }
        } else if ast::is_identifier(callee) && args.iter().any(|a| passes_rpc(*a)) {
            handoffs.insert(callee.text().to_string());
        }
    });
    StartedWorkflows {
        names: names.into_iter().collect(),
        dynamic,
        dynamic_args,
        rpc_handoffs: handoffs.into_iter().collect(),
    }
}

/// The PikkuWire members a function can destructure or alias: capability
/// objects (or functions bound to the invocation). Handing one to another
/// function hands over the wire. session, workflowStep, logger, traceId and the
/// like are plain data.
const WIRE_KEYS: &[&str] = &[
    "rpc", "setSession", "getSession", "clearSession", "setInitialSession", "http", "channel", "queue", "scheduledTask",
    "workflow", "graph", "mcp", "cli", "trigger", "gateway", "getCredential", "getCredentials", "setCredential",
];

/// The data fields of the capability objects that have any: a chain that
/// continues into one of them (`wire.http.request.body`, `wire.channel.channelId`)
/// is data. Any other member (`rpc.invoke` as a value, `wire.http.response`) is
/// still the capability.
const DATA_MEMBERS: &[&str] = &["request", "authInfo", "depth", "channelId", "openingData", "state"];

/// `WireArg`: a call that takes the wire as an argument: the callee's text
/// (`helper`, `svc.run`, `new Foo`) and what was handed over (a wire key, or
/// `wire` for the whole object).
#[derive(Clone, Debug)]
pub struct WireArg {
    pub callee: String,
    pub wire: String,
    /// The callee expression, so the caller can ask the checker who declares it.
    pub expr: P<Node>,
}

/// What `collect_wire_args` needs from the checker.
pub trait WireResolver {
    /// The declarations of the symbol an identifier refers to, aliases followed.
    fn decls_of(&mut self, n: P<Node>) -> Vec<P<Node>>;
    /// A callee declared inside the handler: `Some(Some(function))`, a class as
    /// `Some(None)`, anything else `None`.
    fn local_fn_of(&mut self, callee: P<Node>) -> Option<Option<P<Node>>>;
}

fn is_function_like_expr(n: P<Node>) -> bool {
    ast::is_arrow_function(n) || ast::is_function_expression(n) || ast::is_class_expression(n)
}

#[derive(Default)]
struct WireScan {
    whole: Vec<P<Node>>,
    keys: Vec<(P<Node>, String)>,
}

impl WireScan {
    fn bind_keys(&mut self, pattern: P<Node>) {
        for e in pattern.elements() {
            let Some(en) = e.name() else { continue };
            if !ast::is_identifier(en) {
                continue;
            }
            let mut key = en.text().to_string();
            if let Some(pn) = e.property_name()
                && ast::is_identifier(pn)
            {
                key = pn.text().to_string();
            }
            if WIRE_KEYS.contains(&key.as_str()) {
                self.keys.push((*e, key));
            }
        }
    }

    /// The root identifier of a reference chain and its member names from the
    /// root outward. A computed member that is not a literal is "*".
    fn root_of(n: P<Node>) -> Option<(P<Node>, Vec<String>)> {
        let mut names: Vec<String> = Vec::new();
        let mut n = unwrap_non_null_parens(n);
        loop {
            if ast::is_property_access_expression(n) {
                names.insert(0, n.name().unwrap().text().to_string());
            } else if ast::is_element_access_expression(n) {
                let a = n.as_element_access_expression().argument_expression();
                names.insert(0, if ast::is_string_literal_like(a) { a.text().to_string() } else { "*".to_string() });
            } else {
                return if ast::is_identifier(n) { Some((n, names)) } else { None };
            }
            n = unwrap_non_null_parens(n.expression().unwrap());
        }
    }

    /// The wire key an identifier's symbol stands for ("wire" for the whole
    /// object), or "".
    fn ref_key(&self, r: &mut dyn WireResolver, id: P<Node>) -> String {
        for d in r.decls_of(id) {
            if self.whole.contains(&d) {
                return "wire".into();
            }
            if let Some((_, k)) = self.keys.iter().find(|(x, _)| *x == d) {
                return k.clone();
            }
        }
        String::new()
    }

    /// A reference to a wire or one of its keys, with whatever chain follows it.
    fn direct(&self, r: &mut dyn WireResolver, n: P<Node>) -> (String, Vec<String>) {
        let Some((root, names)) = Self::root_of(n) else { return (String::new(), Vec::new()) };
        let k = self.ref_key(r, root);
        if k == "wire" {
            if names.is_empty() {
                return ("wire".into(), Vec::new());
            }
            if WIRE_KEYS.contains(&names[0].as_str()) {
                return (names[0].clone(), names[1..].to_vec());
            }
            return (String::new(), Vec::new());
        }
        (k, names)
    }

    /// The wire key an argument reference hands over, or "".
    fn capability(&self, r: &mut dyn WireResolver, n: P<Node>) -> String {
        let (k, rest) = self.direct(r, n);
        if k.is_empty() || (!rest.is_empty() && DATA_MEMBERS.contains(&rest[0].as_str())) {
            return String::new();
        }
        k
    }

    /// The capability an argument expression carries. It does not enter calls,
    /// `new` or function-like nodes.
    fn scan(&self, r: &mut dyn WireResolver, n: P<Node>) -> String {
        if ast::is_call_expression(n) || ast::is_new_expression(n) || is_function_like_expr(n) || is_decl_function_like(n) {
            return String::new();
        }
        if ast::is_identifier(n) || ast::is_property_access_expression(n) || ast::is_element_access_expression(n) {
            return self.capability(r, n);
        }
        if ast::is_conditional_expression(n) {
            let c = n.as_conditional_expression();
            let w = self.scan(r, c.when_true);
            return if w.is_empty() { self.scan(r, c.when_false) } else { w };
        }
        if ast::is_binary_expression(n) {
            let b = n.as_binary_expression();
            return match b.operator_token().kind() {
                Kind::BarBarToken | Kind::QuestionQuestionToken => {
                    let w = self.scan(r, b.left());
                    if w.is_empty() { self.scan(r, b.right()) } else { w }
                }
                Kind::AmpersandAmpersandToken | Kind::CommaToken | Kind::EqualsToken => self.scan(r, b.right()),
                _ => String::new(),
            };
        }
        let mut found = String::new();
        n.for_each_child(&mut |c| {
            if ast::is_property_assignment(n) && Some(c) == n.name() {
                return false;
            }
            let w = self.scan(r, c);
            if !w.is_empty() {
                found = w;
                return true;
            }
            false
        });
        found
    }
}

fn is_decl_function_like(n: P<Node>) -> bool {
    ast::is_function_declaration(n) || ast::is_method_declaration(n) || ast::is_class_declaration(n)
}

/// `CollectWireArgs`: reads a handler for calls that take the wire itself as an
/// argument. A wire is the third parameter, a key of it (`wire.rpc`, a
/// destructured `rpc`) or a direct alias of either, matched by symbol. See Go
/// `tsutil.CollectWireArgs` for the full rule.
pub fn collect_wire_args(f: P<Node>, r: &mut dyn WireResolver) -> Vec<WireArg> {
    let Some(body) = f.body() else { return Vec::new() };
    let mut scan = WireScan::default();
    if let Some(p) = param_at(f, 2) {
        let name = p.name().unwrap();
        if ast::is_identifier(name) {
            scan.whole.push(p);
        } else if ast::is_object_binding_pattern(name) {
            scan.bind_keys(name);
        }
    }
    // Aliases in source order: `const r = rpc`, `const { rpc } = wire`.
    let mut decls = Vec::new();
    walk_self(body, &mut |n| {
        if ast::is_variable_declaration(n) && n.initializer().is_some() {
            decls.push(n);
        }
    });
    for n in decls {
        let (k, rest) = scan.direct(r, n.initializer().unwrap());
        if k.is_empty() || !rest.is_empty() {
            continue;
        }
        let name = n.name().unwrap();
        if ast::is_identifier(name) {
            if k == "wire" {
                scan.whole.push(n);
            } else {
                scan.keys.push((n, k));
            }
        } else if ast::is_object_binding_pattern(name) && k == "wire" {
            scan.bind_keys(name);
        }
    }
    let mut calls_nodes: Vec<P<Node>> = Vec::new();
    walk_self(body, &mut |n| {
        if (ast::is_call_expression(n) || ast::is_new_expression(n)) && !n.arguments().is_empty() {
            calls_nodes.push(n);
        }
    });
    // A call to a function declared in the handler keeps the wire bound. Its
    // parameter becomes the wire, so a forward to an outside function is
    // reported where it happens. Repeated until no parameter is added.
    let mut changed = true;
    while changed {
        changed = false;
        for &n in &calls_nodes {
            let Some(Some(local)) = r.local_fn_of(unwrap_non_null_parens(n.expression().unwrap())) else { continue };
            for (i, a) in n.arguments().iter().enumerate() {
                let Some(p) = param_at(local, i) else { continue };
                if ast::is_spread_element(*a) || !ast::is_identifier(p.name().unwrap()) {
                    continue;
                }
                let (k, rest) = scan.direct(r, *a);
                if k.is_empty() || !rest.is_empty() {
                    continue;
                }
                if k == "wire" {
                    if !scan.whole.contains(&p) {
                        scan.whole.push(p);
                        changed = true;
                    }
                } else if !scan.keys.iter().any(|(x, kk)| *x == p && *kk == k) {
                    scan.keys.push((p, k));
                    changed = true;
                }
            }
        }
    }
    let mut calls: Vec<WireArg> = Vec::new();
    for &n in &calls_nodes {
        let callee = unwrap_non_null_parens(n.expression().unwrap());
        if !scan.direct(r, callee).0.is_empty() {
            continue; // rpc.invoke(...), wire.http.response.json(...): the wire is the callee
        }
        if r.local_fn_of(callee).is_some() {
            continue;
        }
        let mut label = node_text(callee).to_string();
        if ast::is_new_expression(n) {
            label = format!("new {label}");
        }
        for a in n.arguments().iter() {
            let wire = scan.scan(r, *a);
            if !wire.is_empty() {
                let w = WireArg { callee: label.clone(), wire, expr: callee };
                if !calls.iter().any(|x| x.callee == w.callee && x.wire == w.wire) {
                    calls.push(w);
                }
                break;
            }
        }
    }
    calls.sort_by(|a, b| (&a.callee, &a.wire).cmp(&(&b.callee, &b.wire)));
    calls
}
