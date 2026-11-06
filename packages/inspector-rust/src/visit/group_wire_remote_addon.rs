//! Port of Go `visit/group_wire_remote_addon.go` (add/add-wire-remote-addon.ts).

use serde_json::Value;
use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::group_wire_addon::{
    JsObject, declare_addon, file_name_of, is_call, is_identifier, is_object_literal, is_property_assignment,
    is_string_literal, is_string_literal_like, node_text, parse_string_array,
};
use super::order;
use super::{Context, Phase, Registry, Visitor};
use crate::diag::codes;
use crate::remotesdk;

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addWireRemoteAddon",
        phase: Phase::Setup,
        order: order::ADD_WIRE_REMOTE_ADDON,
        visit: add_wire_remote_addon,
    });
}

struct Local {
    pkg: String,
    ui: bool,
}

fn add_wire_remote_addon(ctx: &mut Context<'_>, node: P<Node>) {
    if !is_call(node) {
        return;
    }
    if !node.expression().is_some_and(|e| is_identifier(e) && e.text() == "wireRemoteAddon") {
        return;
    }
    let args = node.arguments();
    let Some(first) = args.first().copied().filter(|a| is_object_literal(*a)) else { return };
    let mut name = String::new();
    let mut pkg = String::new();
    let mut pkg_node: Option<P<Node>> = None;
    let mut pkg_is_literal = false;
    let (mut auth_credential_id, mut auth_secret_id): (Option<String>, Option<String>) = (None, None);
    let mut has_auth = false;
    let mut local: Option<Local> = None;
    let mut local_contributors: Vec<String> = Vec::new();
    let mut have_local_contributors = false;
    for p in first.properties() {
        if !is_property_assignment(*p) {
            continue;
        }
        let Some(pname) = p.name().filter(|n| is_identifier(*n)) else { continue };
        let Some(init) = p.initializer() else { continue };
        match pname.text() {
            "name" if is_string_literal(init) => name = init.text().to_string(),
            "package" => {
                pkg_node = Some(init);
                if is_string_literal_like(init) {
                    pkg = init.text().to_string();
                    pkg_is_literal = true;
                }
            }
            "local" if is_object_literal(init) => {
                let mut l = Local { pkg: String::new(), ui: false };
                for lp in init.properties() {
                    if !is_property_assignment(*lp) {
                        continue;
                    }
                    let Some(ln) = lp.name().filter(|n| is_identifier(*n)) else { continue };
                    let Some(li) = lp.initializer() else { continue };
                    match ln.text() {
                        "package" => {
                            if is_string_literal(li) {
                                l.pkg = li.text().to_string();
                            }
                        }
                        "ui" => {
                            if li.kind() == Kind::TrueKeyword {
                                l.ui = true;
                            }
                        }
                        "contributors" => match parse_string_array(li) {
                            Some(names) => {
                                local_contributors = names;
                                have_local_contributors = true;
                            }
                            None => ctx.log.critical(
                                codes::ADDON_CONTRIBUTORS_NOT_STATIC,
                                format!(
                                    "wireRemoteAddon's local.contributors must be an array of string literals, got: {}",
                                    node_text(li)
                                ),
                            ),
                        },
                        _ => {}
                    }
                }
                if !l.pkg.is_empty() {
                    local = Some(l);
                } else {
                    ctx.log.critical(
                        codes::REMOTE_ADDON_PACKAGE_NOT_STATIC,
                        format!("wireRemoteAddon's local.package must be a string literal, got: {}", node_text(init)),
                    );
                }
            }
            "auth" if is_object_literal(init) => {
                has_auth = true;
                for ap in init.properties() {
                    if !is_property_assignment(*ap) {
                        continue;
                    }
                    let Some(an) = ap.name().filter(|n| is_identifier(*n)) else { continue };
                    let Some(ai) = ap.initializer().filter(|i| is_string_literal(*i)) else { continue };
                    let v = ai.text().to_string();
                    match an.text() {
                        "credentialId" => auth_credential_id = Some(v),
                        "secretId" => auth_secret_id = Some(v),
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    let file = file_name_of(node);
    if let Some(pn) = pkg_node
        && !pkg_is_literal
    {
        let label = if name.is_empty() { "…".to_string() } else { format!("'{name}'") };
        ctx.log.critical(
            codes::REMOTE_ADDON_PACKAGE_NOT_STATIC,
            format!(
                "wireRemoteAddon({label}) in {file} sets package to '{}', which is not a string literal. Write the package (and its version range) inline, e.g. package: '@scope/addon@^1.0.0', so it can be read without running the file.",
                node_text(pn)
            ),
        );
        return;
    }
    if name.is_empty() || pkg.is_empty() {
        return;
    }
    let (pkg_name, rng) = match remotesdk::parse_package(&pkg) {
        Ok(v) => v,
        Err(e) => {
            ctx.log.critical(codes::REMOTE_ADDON_PACKAGE_INVALID, format!("wireRemoteAddon('{name}'): {e}"));
            return;
        }
    };
    if !rng.is_empty() {
        ctx.log.debug(format!("• Found wireRemoteAddon: {name} → {pkg_name}@{rng} (remote)"));
    } else {
        ctx.log.debug(format!("• Found wireRemoteAddon: {name} → {pkg_name} (remote)"));
    }
    let s = |v: &str| Some(Value::String(v.to_string()));
    let mut o = JsObject::default();
    o.set("package", s(&pkg_name));
    if !rng.is_empty() {
        o.set("range", s(&rng));
    }
    o.set("file", s(file));
    o.set("remote", Some(Value::Bool(true)));
    o.set("hasAuth", Some(Value::Bool(has_auth)));
    o.set("authCredentialId", auth_credential_id.as_deref().and_then(s));
    o.set("authSecretId", auth_secret_id.as_deref().and_then(s));
    if let Some(l) = &local {
        let mut lo = JsObject::default();
        lo.set("package", s(&l.pkg));
        if l.ui {
            lo.set("ui", Some(Value::Bool(true)));
        }
        if have_local_contributors {
            lo.set("contributors", Some(serde_json::json!(local_contributors)));
        }
        o.set("local", Some(lo.value()));
    }
    declare_addon(ctx, &name, file, o.raw());
}
