//! Port of Go `visit/group_wire_addon.go` (add/add-wire-addon.ts).

use serde_json::{Map as JsonMap, Value};
use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::addon_json::OJson;
use super::order;
use super::{Context, Phase, Registry, Visitor};
use crate::diag::codes;
use crate::state::{Raw, Record};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addWireAddon", phase: Phase::Setup, order: order::ADD_WIRE_ADDON, visit: add_wire_addon });
}

// ---- small AST helpers shared by the addon groups ----

/// `NodeText`: `ts.Node#getText()`, the source text from the token start.
pub(crate) fn node_text(n: P<Node>) -> &'static str {
    let sf = ast::get_source_file_of_node(n).expect("node without a source file");
    let start = tsrs_scanner::get_token_pos_of_node(n, sf, false) as usize;
    let end = n.end().expect_source("parsed nodes have source positions") as usize;
    &sf.get().text()[start..end]
}

pub(crate) fn file_name_of(n: P<Node>) -> &'static str {
    ast::get_source_file_of_node(n).expect("node without a source file").get().file_name()
}

pub(crate) fn is_string_literal(n: P<Node>) -> bool {
    n.kind() == Kind::StringLiteral
}

pub(crate) fn is_string_literal_like(n: P<Node>) -> bool {
    matches!(n.kind(), Kind::StringLiteral | Kind::NoSubstitutionTemplateLiteral)
}

pub(crate) fn is_identifier(n: P<Node>) -> bool {
    n.kind() == Kind::Identifier
}

pub(crate) fn is_property_assignment(n: P<Node>) -> bool {
    n.kind() == Kind::PropertyAssignment
}

pub(crate) fn is_object_literal(n: P<Node>) -> bool {
    n.kind() == Kind::ObjectLiteralExpression
}

pub(crate) fn is_call(n: P<Node>) -> bool {
    n.kind() == Kind::CallExpression
}

/// `jsObject`: an object literal built the way the TS builds it, where an
/// `undefined` value is dropped (as `JSON.stringify` drops it).
#[derive(Default)]
pub(crate) struct JsObject(JsonMap<String, Value>);

impl JsObject {
    pub(crate) fn set(&mut self, k: &str, v: Option<Value>) {
        if let Some(v) = v {
            self.0.insert(k.to_string(), v);
        }
    }

    pub(crate) fn raw(self) -> Raw {
        Raw::of(Value::Object(self.0))
    }

    pub(crate) fn value(self) -> Value {
        Value::Object(self.0)
    }
}

fn str_value(s: &str) -> Option<Value> {
    Some(Value::String(s.to_string()))
}

/// A property's key when it is `key: value` with an identifier or string name.
fn prop_key(p: P<Node>) -> Option<&'static str> {
    if !is_property_assignment(p) {
        return None;
    }
    let n = p.name()?;
    (is_identifier(n) || is_string_literal(n)).then(|| n.text())
}

/// An array of string literals.
pub(crate) fn parse_string_array(n: P<Node>) -> Option<Vec<String>> {
    if n.kind() != Kind::ArrayLiteralExpression {
        return None;
    }
    let mut out = Vec::new();
    for e in n.elements() {
        if !is_string_literal(*e) {
            return None;
        }
        out.push(e.text().to_string());
    }
    Some(out)
}

fn parse_string_record(obj: P<Node>) -> Record<String> {
    let mut rec = Record::new();
    for p in obj.properties() {
        if let Some(key) = prop_key(*p)
            && let Some(init) = p.initializer()
            && is_string_literal(init)
        {
            rec.set(key, init.text().to_string());
        }
    }
    rec
}

fn record_value<T: serde::Serialize>(rec: &Record<T>) -> Value {
    serde_json::to_value(rec).expect("record serialises")
}

fn parse_credential_override_record(obj: P<Node>) -> Record<OJson> {
    let mut rec = Record::new();
    for p in obj.properties() {
        let Some(key) = prop_key(*p).filter(|k| !k.is_empty()) else { continue };
        let Some(init) = p.initializer() else { continue };
        if is_string_literal(init) {
            rec.set(key, OJson::string(init.text()));
            continue;
        }
        if !is_object_literal(init) {
            continue;
        }
        let mut over = OJson::new_object();
        for m in init.properties() {
            let Some(mk) = prop_key(*m).filter(|k| !k.is_empty()) else { continue };
            let Some(mi) = m.initializer().filter(|i| is_string_literal(*i)) else { continue };
            let v = mi.text();
            if mk == "name" {
                over.set("name", OJson::string(v));
            } else if mk == "mode" && (v == "wire" || v == "singleton") {
                over.set("mode", OJson::string(v));
            }
        }
        rec.set(key, over);
    }
    rec
}

fn bool_keyword(n: P<Node>) -> Option<bool> {
    match n.kind() {
        Kind::TrueKeyword => Some(true),
        Kind::FalseKeyword => Some(false),
        _ => None,
    }
}

/// `true | false | parseStringArray(...)`.
fn bool_or_string_array(n: P<Node>) -> Option<Value> {
    if let Some(b) = bool_keyword(n) {
        return Some(Value::Bool(b));
    }
    parse_string_array(n).map(|a| serde_json::json!(a))
}

/// A string literal's text, else the expression's source.
pub(crate) fn literal_or_text(n: P<Node>) -> String {
    if is_string_literal(n) { n.text().to_string() } else { node_text(n).to_string() }
}

fn add_wire_addon(ctx: &mut Context<'_>, node: P<Node>) {
    if !is_call(node) {
        return;
    }
    let Some(callee) = node.expression().filter(|e| is_identifier(*e) && e.text() == "wireAddon") else { return };
    let _ = callee;
    let args = node.arguments();
    let Some(first) = args.first().copied().filter(|a| is_object_literal(*a)) else { return };

    let mut name = String::new();
    let mut pkg = String::new();
    let mut rpc_endpoint: Option<String> = None;
    let (mut global_secrets, mut global_credentials, mut global_content): (Option<String>, Option<String>, Option<String>) =
        (None, None, None);
    let mut content_bucket: Option<String> = None;
    let (mut tags, mut scopes_v, mut secret_grants, mut credential_grants): (Option<Value>, Option<Value>, Option<Value>, Option<Value>) =
        (None, None, None, None);
    let (mut uses, mut secret_ov, mut variable_ov, mut content_grants): (
        Option<Record<String>>,
        Option<Record<String>>,
        Option<Record<String>>,
        Option<Record<String>>,
    ) = (None, None, None, None);
    let mut credential_ov: Option<Record<OJson>> = None;
    let mut contributor_names: Option<Vec<String>> = None;
    let (mut mcp, mut expose): (Option<Value>, Option<Value>) = (None, None);
    let mut mcp_endpoint: Option<Value> = None;
    let mut auth: Option<bool> = None;
    let mut ui = false;

    let arr_or_nil = |n: P<Node>| parse_string_array(n).map(|a| serde_json::json!(a));
    for p in first.properties() {
        if !is_property_assignment(*p) {
            continue;
        }
        let Some(pname) = p.name().filter(|n| is_identifier(*n)) else { continue };
        let Some(init) = p.initializer() else { continue };
        let bool_init = bool_keyword(init);
        match pname.text() {
            "name" if is_string_literal(init) => name = init.text().to_string(),
            "package" if is_string_literal(init) => pkg = init.text().to_string(),
            "rpcEndpoint" if is_string_literal(init) => rpc_endpoint = Some(init.text().to_string()),
            "mcp" => mcp = bool_or_string_array(init),
            "expose" => {
                expose = bool_or_string_array(init);
                if expose.is_none() {
                    ctx.log.critical(
                        codes::ADDON_EXPOSE_NOT_STATIC,
                        format!("wireAddon's expose must be true, false or an array of string literals, got: {}", node_text(init)),
                    );
                }
            }
            "mcpEndpoint" => {
                if is_string_literal(init) {
                    mcp_endpoint = Some(Value::String(init.text().to_string()));
                } else if let Some(b) = bool_init {
                    mcp_endpoint = Some(Value::Bool(b));
                }
            }
            "auth" if bool_init.is_some() => auth = bool_init,
            "ui" if bool_init.is_some() => ui = bool_init.unwrap(),
            "tags" => tags = arr_or_nil(init),
            "scopes" => scopes_v = arr_or_nil(init),
            "uses" => {
                if is_object_literal(init) {
                    uses = Some(parse_string_record(init));
                } else {
                    ctx.log.critical(
                        codes::ADDON_EXPOSE_NOT_STATIC,
                        format!("wireAddon's uses must be an object literal, got: {}", node_text(init)),
                    );
                }
            }
            "secretOverrides" if is_object_literal(init) => secret_ov = Some(parse_string_record(init)),
            "variableOverrides" if is_object_literal(init) => variable_ov = Some(parse_string_record(init)),
            "credentialOverrides" if is_object_literal(init) => credential_ov = Some(parse_credential_override_record(init)),
            "secretGrants" => secret_grants = arr_or_nil(init),
            "credentialGrants" => credential_grants = arr_or_nil(init),
            "globalSecrets" => global_secrets = Some(literal_or_text(init)),
            "globalCredentials" => global_credentials = Some(literal_or_text(init)),
            "contentBucket" if is_string_literal(init) => content_bucket = Some(init.text().to_string()),
            "contentGrants" if is_object_literal(init) => content_grants = Some(parse_string_record(init)),
            "globalContent" => global_content = Some(literal_or_text(init)),
            "contributors" => match parse_string_array(init) {
                Some(names) => contributor_names = Some(names),
                None => ctx.log.critical(
                    codes::ADDON_CONTRIBUTORS_NOT_STATIC,
                    format!("wireAddon's contributors must be an array of string literals, got: {}", node_text(init)),
                ),
            },
            _ => {}
        }
    }
    if name.is_empty() || pkg.is_empty() {
        return;
    }
    let file = file_name_of(node);
    ctx.log.debug(format!("• Found wireAddon: {name} → {pkg}"));

    let mut o = JsObject::default();
    o.set("package", str_value(&pkg));
    if ui {
        o.set("ui", Some(Value::Bool(true)));
    }
    o.set("file", str_value(file));
    o.set("rpcEndpoint", rpc_endpoint.as_deref().and_then(str_value));
    o.set("mcp", mcp);
    o.set("mcpEndpoint", mcp_endpoint);
    o.set("expose", expose);
    o.set("auth", auth.map(Value::Bool));
    o.set("tags", tags);
    o.set("scopes", scopes_v);
    o.set("uses", uses.as_ref().map(record_value));
    o.set("secretOverrides", secret_ov.as_ref().map(record_value));
    o.set("variableOverrides", variable_ov.as_ref().map(record_value));
    o.set("credentialOverrides", credential_ov.as_ref().map(record_value));
    o.set("secretGrants", secret_grants);
    o.set("credentialGrants", credential_grants);
    o.set("globalSecrets", global_secrets.as_deref().and_then(str_value));
    o.set("globalCredentials", global_credentials.as_deref().and_then(str_value));
    o.set("contentBucket", content_bucket.as_deref().and_then(str_value));
    o.set("contentGrants", content_grants.as_ref().map(record_value));
    o.set("globalContent", global_content.as_deref().and_then(str_value));
    if let Some(names) = &contributor_names {
        o.set("contributors", Some(serde_json::json!(names)));
    }
    declare_addon(ctx, &name, file, o.raw());
}

/// `wireAddonDeclarations.set(name, …)` plus the usedAddons and
/// wireAddonFiles bookkeeping both addon wirings do.
pub(crate) fn declare_addon(ctx: &mut Context<'_>, name: &str, file: &str, raw: Raw) {
    ctx.state.rpc.wire_addon_declarations.set(name, raw);
    ctx.state.rpc.used_addons.add(name);
    ctx.state.rpc.wire_addon_files.add(file);
}
