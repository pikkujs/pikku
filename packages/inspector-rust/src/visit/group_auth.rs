//! Port of Go `visit/group_auth.go`: add/add-auth.ts, the single
//! `export const X = pikkuBetterAuth(...)`. Everything finalize's
//! stampAuthHandlerServices and aggregateRequiredServices read comes from
//! auth.definition, recorded here.

use std::collections::HashMap;

use tsrs_ast::{self as ast, Kind, Node, NodeFlags, SourceFile};
use tsrs_core::P;

use super::util_callee::{is_better_auth, is_pikku_better_auth};
use super::util_middleware::services_of;
use super::{Context, Phase, Registry, Visitor, abort, order};
use crate::diag::codes;
use crate::state::AuthDefinition;
use crate::tsutil::{self, file_name_of, has_export_modifier, source_file_of};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addAuth", phase: Phase::Routes, order: order::ADD_AUTH, visit: |c, n| c.add_auth(n) });
}

const DEFAULT_AUTH_BASE_PATH: &str = "/api/auth";
const BETTER_AUTH_PLUGINS_MODULE: &str = "better-auth/plugins";

pub fn unsupported_admin_plugin(source_file: &str) -> String {
    format!(
        "better-auth's admin() plugin is not supported by pikku ({source_file}).\n\
\n\
It authorizes against a 'user.role' column, while pikku authorizes on scopes —\n\
wiring both means one has to be projected onto the other, and the projection is\n\
coarser than the scopes it stands in for.\n\
\n\
Use pikkuBan() instead:\n\
\n\
\x20 import {{ pikkuBan }} from '@pikku/better-auth'\n\
\x20 betterAuth({{ plugins: [pikkuBan()] }})\n\
\n\
pikkuBan() keeps the part of admin() that pikku cannot supply from outside\n\
better-auth — the banned/banReason/banExpires columns and the session hook that\n\
refuses a banned user a session. Everything else admin() offered is already\n\
scoped RPCs in @pikku/addon-admin: list, create, ban, remove, revoke sessions\n\
and set password."
    )
}

/// `authProp` finds a property assignment named by an identifier or a string
/// literal (add-auth.ts's readXProp helpers).
fn auth_prop(obj: P<Node>, name: &str, string_keys: bool) -> Option<P<Node>> {
    for p in obj.properties() {
        if !ast::is_property_assignment(*p) {
            continue;
        }
        let n = p.name().unwrap();
        if (ast::is_identifier(n) || (string_keys && ast::is_string_literal(n))) && n.text() == name {
            return Some(*p);
        }
    }
    None
}

fn auth_prop_init(obj: P<Node>, name: &str, is: fn(P<Node>) -> bool) -> Option<P<Node>> {
    let p = auth_prop(obj, name, true)?;
    let init = p.initializer().unwrap();
    if is(init) { Some(init) } else { None }
}

/// `!enabledProp || enabledProp.initializer.kind !== FalseKeyword`.
fn enabled_unless_false(obj: P<Node>, string_keys: bool) -> bool {
    match auth_prop(obj, "enabled", string_keys) {
        None => true,
        Some(p) => p.initializer().unwrap().kind() != Kind::FalseKeyword,
    }
}

#[derive(Default)]
struct PluginBindings {
    named: HashMap<String, String>,
    namespaces: std::collections::HashSet<String>,
}

fn read_plugin_bindings(sf: P<SourceFile>) -> PluginBindings {
    let mut b = PluginBindings::default();
    for st in sf.statements().nodes() {
        let st = *st;
        if !ast::is_import_declaration(st) {
            continue;
        }
        let spec = st.module_specifier();
        let Some(spec) = spec.filter(|s| ast::is_string_literal(*s) && s.text() == BETTER_AUTH_PLUGINS_MODULE) else {
            continue;
        };
        let _ = spec;
        let Some(clause) = st.import_clause() else { continue };
        let Some(nb) = clause.as_import_clause().named_bindings() else { continue };
        if ast::is_namespace_import(nb) {
            b.namespaces.insert(nb.name().unwrap().text().to_string());
            continue;
        }
        for el in nb.elements() {
            let mut exported = el.name().unwrap().text().to_string();
            if let Some(pn) = el.property_name() {
                exported = pn.text().to_string();
            }
            b.named.insert(el.name().unwrap().text().to_string(), exported);
        }
    }
    b
}

/// `readPluginEntry` returns the plugin id and the name better-auth exports it
/// under ("" when it did not come from better-auth/plugins).
fn read_plugin_entry(el: P<Node>, b: &PluginBindings) -> Option<(String, String)> {
    if !ast::is_call_expression(el) {
        return None;
    }
    let callee = el.expression().unwrap();
    if ast::is_identifier(callee) {
        let t = callee.text();
        return Some((t.to_string(), b.named.get(t).cloned().unwrap_or_default()));
    }
    if ast::is_property_access_expression(callee) {
        let recv = callee.expression().unwrap();
        if ast::is_identifier(recv) && b.namespaces.contains(recv.text()) {
            let n = callee.name().unwrap().text().to_string();
            return Some((n.clone(), n));
        }
    }
    None
}

impl Context<'_> {
    pub fn add_auth(&mut self, node: P<Node>) {
        if self.resolve_callee_name(node, &is_pikku_better_auth).is_empty() {
            return;
        }
        let source_file = file_name_of(node).to_string();

        let var_decl = node.parent();
        let Some(var_decl) = var_decl.filter(|v| ast::is_variable_declaration(*v) && v.name().is_some_and(ast::is_identifier)) else {
            self.log.critical(codes::AUTH_NOT_EXPORTED, format!("pikkuBetterAuth(...) must be assigned to an exported const, e.g. `export const auth = pikkuBetterAuth((services) => betterAuth({{...}}))` in {source_file}"));
            return;
        };
        let export_name = var_decl.name().unwrap().text().to_string();

        let decl_list = var_decl.parent();
        let is_const = decl_list.is_some_and(|d| ast::is_variable_declaration_list(d) && d.flags().intersects(NodeFlags::Const));
        let mut is_exported = false;
        if let Some(dl) = decl_list {
            if let Some(stmt) = dl.parent() {
                if ast::is_variable_statement(stmt) && has_export_modifier(stmt) {
                    is_exported = true;
                }
            }
        }
        if !is_exported || !is_const {
            self.log.critical(codes::AUTH_NOT_EXPORTED, format!("pikkuBetterAuth(...) must be assigned to an exported const so the CLI can import it. Use `export const {export_name} = pikkuBetterAuth(...)` in {source_file}"));
            return;
        }

        if let Some(def) = &self.state.auth.definition {
            let first = def.source_file.clone();
            self.log.critical(codes::DUPLICATE_AUTH_DEFINITION, format!("Only one pikkuBetterAuth(...) is allowed per codebase. Found a second in {source_file} (first: {first})."));
            return;
        }

        let args = node.arguments();
        if args.is_empty() || !tsutil::is_function_like(args[0]) {
            self.log.critical(codes::MISSING_NAME, format!("pikkuBetterAuth(...) must take a factory function returning betterAuth(...), e.g. `pikkuBetterAuth((services) => betterAuth({{...}}))` in {source_file}"));
            return;
        }
        let factory = args[0];

        self.state.auth.files.add(source_file.clone());
        let services = services_of(factory);

        let mut base_path = DEFAULT_AUTH_BASE_PATH.to_string();
        let (mut has_credentials, mut cookie_cache) = (false, false);
        let mut config = None;
        if let Some(call) = self.find_call(factory, &is_better_auth, "betterAuth") {
            if !call.arguments().is_empty() {
                config = Some(call.arguments()[0]);
            }
        }

        match config.filter(|c| ast::is_object_literal_expression(*c)) {
            Some(config) => {
                if let Some(p) = auth_prop_init(config, "basePath", ast::is_string_literal) {
                    base_path = p.text().to_string();
                }
                if let Some(session) = auth_prop_init(config, "session", ast::is_object_literal_expression) {
                    if let Some(cc) = auth_prop_init(session, "cookieCache", ast::is_object_literal_expression) {
                        cookie_cache = enabled_unless_false(cc, true);
                    }
                }
                if let Some(ep) = auth_prop_init(config, "emailAndPassword", ast::is_object_literal_expression) {
                    has_credentials = enabled_unless_false(ep, false);
                }
                if let Some(sp) = auth_prop_init(config, "socialProviders", ast::is_object_literal_expression) {
                    for p in sp.properties() {
                        if !ast::is_property_assignment(*p) && !ast::is_shorthand_property_assignment(*p) {
                            continue;
                        }
                        let n = p.name().unwrap();
                        if !ast::is_identifier(n) && !ast::is_string_literal(n) {
                            continue;
                        }
                        let key = n.text().to_string();
                        if !key.is_empty() && !self.state.auth.providers.contains(&key) {
                            self.state.auth.providers.push(key);
                        }
                    }
                }
                if let Some(plugins) = auth_prop_init(config, "plugins", ast::is_array_literal_expression) {
                    let bindings = read_plugin_bindings(source_file_of(node));
                    for el in plugins.elements() {
                        let Some((id, exported)) = read_plugin_entry(*el, &bindings) else { continue };
                        if exported == "admin" {
                            abort(unsupported_admin_plugin(&source_file));
                        }
                        if !self.state.auth.plugins.contains(&id) {
                            self.state.auth.plugins.push(id);
                        }
                    }
                }
            }
            None => {
                self.log.warn(format!("pikkuBetterAuth in {source_file}: could not statically find a betterAuth({{...}}) call inside the factory — social provider secrets will not be auto-wired."));
            }
        }

        self.state.auth.definition = Some(AuthDefinition {
            export_name,
            source_file,
            base_path,
            has_credentials,
            cookie_cache,
            plugins: self.state.auth.plugins.clone(),
            services,
        });
    }
}
