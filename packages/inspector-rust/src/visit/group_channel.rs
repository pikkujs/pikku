//! Port of Go `visit/group_channel.go`: add/add-channel.ts.

use serde_json::Value;
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::util_channel_cli::{is_temp_id, make_context_based_id, raw_object, resolve_ref_contract};
use super::util_shared::{JsObject, strs_value};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::{FunctionMeta, Raw, Record, WireRef};
use crate::tsutil::{self, first_decl, node_text};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addChannel", phase: Phase::Routes, order: order::ADD_CHANNEL, visit: |c, n| c.add_channel(n) });
}

/// Go `channelFuncRef`: the connect / disconnect / message slot of ChannelMeta.
#[derive(Clone, Debug, Default)]
struct ChannelFuncRef {
    pikku_func_id: String,
    package_name: String,
}

impl ChannelFuncRef {
    fn value(&self) -> Value {
        let mut o = JsObject::new();
        o.set_str("pikkuFuncId", &self.pikku_func_id);
        if !self.package_name.is_empty() {
            o.set_str("packageName", &self.package_name);
        }
        o.into_value()
    }
}

fn opt_ref_value(r: &Option<ChannelFuncRef>) -> Value {
    r.as_ref().map(|r| r.value()).unwrap_or(Value::Null)
}

/// Go `channelMessageMeta`, one message-route entry.
#[derive(Clone, Debug, Default)]
struct ChannelMessageMeta {
    pikku_func_id: String,
    package_name: String,
    middleware: Vec<WireRef>,
}

impl ChannelMessageMeta {
    fn raw(&self) -> Raw {
        let mut o = JsObject::new();
        o.set_str("pikkuFuncId", &self.pikku_func_id);
        if !self.package_name.is_empty() {
            o.set_str("packageName", &self.package_name);
        }
        if !self.middleware.is_empty() {
            o.set("middleware", Some(serde_json::to_value(&self.middleware).expect("WireRef serialises")));
        }
        o.raw()
    }
}

/// Go `channelMessageWirings`: channel key -> route key -> ChannelMessageMeta.
pub type ChannelMessageWirings = Record<Record<Raw>>;

/// `getObjectPropertyName`.
fn get_object_property_name(name: Option<P<Node>>) -> Option<String> {
    let name = name?;
    if ast::is_identifier(name) || ast::is_string_literal(name) || ast::is_numeric_literal(name) {
        return Some(name.text().to_string());
    }
    if ast::is_computed_property_name(name) {
        return None;
    }
    Some(node_text(name).to_string())
}

/// `getInitializerOf`.
fn get_initializer_of(elem: P<Node>) -> Option<P<Node>> {
    if ast::is_property_assignment(elem) {
        return elem.initializer();
    }
    if ast::is_shorthand_property_assignment(elem) {
        return elem.name();
    }
    None
}

/// Go `channelEntry`: one property of onMessageWiring.
pub struct ChannelEntry {
    pub key: String,
    pub key_ok: bool,
    pub init: P<Node>,
}

fn is_fn_like_init(i: P<Node>) -> bool {
    ast::is_arrow_function(i) || ast::is_function_expression(i) || ast::is_call_expression(i)
}

impl Context<'_> {
    /// `getHandlerNameFromExpression`.
    fn handler_name_from_expression(&mut self, expr: P<Node>) -> Option<String> {
        if ast::is_identifier(expr) {
            let sym = self.symbol_at(expr);
            if sym.is_some() {
                let resolved = self.resolve_alias(sym);
                if let Some(decl) = first_decl(resolved) {
                    if ast::is_variable_declaration(decl) && decl.initializer().is_some() {
                        let init = decl.initializer().unwrap();
                        if ast::is_call_expression(init) || ast::is_arrow_function(init) || ast::is_function_expression(init) {
                            return Some(self.extract_function_name(init).pikku_func_id);
                        }
                    } else if ast::is_function_declaration(decl) {
                        return Some(self.extract_function_name(decl).pikku_func_id);
                    }
                }
            }
            return Some(self.extract_function_name(expr).pikku_func_id);
        }
        if ast::is_call_expression(expr) {
            let callee = expr.expression().unwrap();
            if ast::is_identifier(callee) && callee.text() == "ref" {
                let a = expr.arguments();
                if !a.is_empty() && ast::is_string_literal(a[0]) {
                    return Some(a[0].text().to_string());
                }
            }
            return Some(self.extract_function_name(expr).pikku_func_id);
        }
        if ast::is_object_literal_expression(expr) {
            if let Some(f) = self.get_property_assignment_initializer(expr, "func", true) {
                return self.handler_name_from_expression(f);
            }
        }
        None
    }

    /// The `ts.isObjectLiteralExpression(init) ? ... : undefined` pair every
    /// message route resolves.
    fn channel_route_middleware(&mut self, init: P<Node>, route_key: &str) -> Vec<WireRef> {
        if !ast::is_object_literal_expression(init) {
            return Vec::new();
        }
        let cm = self.common_wire_meta(init, "Channel message", route_key);
        let tags = cm.tags_or_nil().map(|t| t.to_vec());
        self.resolve_middleware(init, tags.as_deref())
    }

    fn channel_try_store(&mut self, target: P<Node>, init: P<Node>, route_key: &str, routes: &mut Record<Raw>) -> bool {
        let handler = self.extract_function_name(target).pikku_func_id;
        if self.state.functions.meta.get(&handler).is_none() {
            return false;
        }
        let middleware = self.channel_route_middleware(init, route_key);
        routes.set(route_key, ChannelMessageMeta { pikku_func_id: handler, middleware, ..Default::default() }.raw());
        true
    }

    /// The shorthand-property branch of addMessagesRoutes: reports whether the
    /// route was resolved and stored.
    fn shorthand_route(&mut self, route_elem: P<Node>, init: P<Node>, route_key: &str, routes: &mut Record<Raw>) -> bool {
        let Some(sym) = self.checker.get_shorthand_assignment_value_symbol(Some(route_elem)) else { return false };
        let Some(decl) = first_decl(Some(sym)) else { return false };
        if ast::is_import_specifier(decl) {
            let imported = self.symbol_at(decl.name().unwrap());
            if imported.is_some() {
                let resolved = self.resolve_alias(imported);
                if let Some(d) = first_decl(resolved) {
                    if ast::is_variable_declaration(d) && d.initializer().is_some() {
                        let i = d.initializer().unwrap();
                        if is_fn_like_init(i) && self.channel_try_store(i, init, route_key, routes) {
                            return true;
                        }
                    } else if ast::is_function_declaration(d) {
                        if self.channel_try_store(d, init, route_key, routes) {
                            return true;
                        }
                    } else if ast::is_export_specifier(d) {
                        let exp = self.symbol_at(d.name().unwrap());
                        if exp.is_some() {
                            let r = self.resolve_alias(exp);
                            if let Some(ed) = first_decl(r) {
                                if ast::is_variable_declaration(ed) && ed.initializer().is_some() {
                                    if self.channel_try_store(ed.initializer().unwrap(), init, route_key, routes) {
                                        return true;
                                    }
                                } else if ast::is_function_declaration(ed) && self.channel_try_store(ed, init, route_key, routes) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
            // As a fallback, look the function up by name.
            let func_name = node_text(decl.name().unwrap());
            let keys: Vec<String> = self.state.functions.meta.keys().into_iter().map(|k| k.to_string()).collect();
            for key in keys {
                let parts: Vec<&str> = key.split('_').collect();
                let filename = if parts.len() >= 3 { parts[parts.len() - 3] } else { "" };
                if filename.ends_with(func_name) {
                    if self.state.functions.meta.get(&key).is_none() {
                        self.log.critical(codes::FUNCTION_METADATA_NOT_FOUND, format!("No function metadata found for handler '{key}'"));
                        return true;
                    }
                    routes.set(route_key, ChannelMessageMeta { pikku_func_id: key.clone(), ..Default::default() }.raw());
                    return true;
                }
            }
            return false;
        }
        let mut actual: Option<P<Node>> = None;
        if ast::is_variable_declaration(decl) {
            if let Some(i) = decl.initializer() {
                if is_fn_like_init(i) {
                    actual = Some(i);
                }
            }
        } else if ast::is_function_declaration(decl) {
            actual = Some(decl);
        }
        match actual {
            Some(a) => self.channel_try_store(a, init, route_key, routes),
            None => false,
        }
    }

    /// `addMessagesRoutes`.
    fn add_messages_routes(&mut self, obj: P<Node>) -> ChannelMessageWirings {
        let on_msg = self.get_property_assignment_initializer(obj, "onMessageWiring", true);
        let Some(on_msg) = on_msg.filter(|n| ast::is_object_literal_expression(*n)) else { return Record::new() };
        let mut entries = Vec::new();
        for chan_elem in on_msg.properties() {
            let Some(init) = get_initializer_of(*chan_elem) else { continue };
            let key = get_object_property_name(chan_elem.name());
            entries.push(ChannelEntry { key: key.clone().unwrap_or_default(), key_ok: key.is_some(), init });
        }
        self.add_message_routes_of(entries)
    }

    pub fn add_message_routes_of(&mut self, entries: Vec<ChannelEntry>) -> ChannelMessageWirings {
        let mut result: ChannelMessageWirings = Record::new();
        for e in entries {
            let mut chan_init = e.init;
            if ast::is_identifier(chan_init) {
                if let Some(resolved) = self.resolve_identifier(chan_init, &["defineChannelRoutes"]) {
                    if ast::is_object_literal_expression(resolved) {
                        chan_init = resolved;
                    }
                }
            }
            // ...or is the defineChannelRoutes call itself, written inline
            if ast::is_call_expression(chan_init) {
                let callee = chan_init.expression().unwrap();
                if ast::is_identifier(callee) && callee.text() == "defineChannelRoutes" {
                    let args = chan_init.arguments();
                    if !args.is_empty() && ast::is_object_literal_expression(args[0]) {
                        chan_init = args[0];
                    }
                }
            }
            if let Some(contract) = resolve_ref_contract(chan_init, "refChannel", &self.state.exported_contracts.addon_channel) {
                if !e.key_ok {
                    continue;
                }
                let routes = raw_object(&contract).unwrap_or_default();
                result.set(e.key, routes);
                continue;
            }
            if !ast::is_object_literal_expression(chan_init) {
                continue;
            }
            if !e.key_ok {
                continue;
            }
            let mut routes: Record<Raw> = Record::new();
            for route_elem in chan_init.properties() {
                let Some(init) = get_initializer_of(*route_elem) else { continue };
                let Some(route_key) = get_object_property_name(route_elem.name()) else { continue };
                if ast::is_shorthand_property_assignment(*route_elem) && self.shorthand_route(*route_elem, init, &route_key, &mut routes) {
                    continue;
                }
                let handler_name = match self.handler_name_from_expression(init) {
                    Some(h) if !h.is_empty() => h,
                    _ => {
                        self.log.error(format!("Could not resolve handler for message route '{route_key}'"));
                        continue;
                    }
                };
                if self.resolve_function_meta(&handler_name).is_none() {
                    self.log.critical(
                        codes::FUNCTION_METADATA_NOT_FOUND,
                        format!(
                            "No function metadata found for channel handler '{handler_name}' on route '{route_key}'. If this is an inline function, it must be exported for the inspector to discover it."
                        ),
                    );
                    continue;
                }
                let middleware = self.channel_route_middleware(init, &route_key);
                let mut package_name = String::new();
                if let Some(i) = handler_name.find(':') {
                    if let Some(p) = self.addon_package(&handler_name[..i]) {
                        package_name = p;
                    }
                }
                routes.set(route_key, ChannelMessageMeta { pikku_func_id: handler_name, package_name, middleware }.raw());
            }
            result.set(e.key, routes);
        }
        result
    }

    pub fn add_channel(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !node.expression().is_some_and(ast::is_identifier) {
            return;
        }
        let args = node.arguments();
        match node.expression().unwrap().text() {
            "defineChannelRoutes" => {
                let export_name = self.exported_variable_name_of(node);
                if !export_name.is_empty() && !args.is_empty() && ast::is_object_literal_expression(args[0]) {
                    let routes = self.extract_exported_channel_routes(args[0]);
                    let v = serde_json::to_value(&routes).expect("routes serialise");
                    self.state.exported_contracts.channel.set(export_name, Raw::of(v));
                }
                return;
            }
            "wireChannel" => {}
            _ => return,
        }
        if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
            return;
        }
        let obj = args[0];
        let name = tsutil::get_property_value(obj, "name").as_string();
        let route = tsutil::get_property_value(obj, "route").as_string();
        if name.is_empty() {
            self.log.critical(codes::MISSING_CHANNEL_NAME, "Channel name is required");
            return;
        }

        let mut params: Vec<String> = Vec::new();
        if !route.is_empty() {
            match tsutil::path_params(&route) {
                Ok(p) => params = p,
                Err(e) => {
                    // TS throws out of pathToRegexp here, which aborts inspection.
                    self.log.error(e);
                    return;
                }
            }
        }

        let cm = self.common_wire_meta(obj, "Channel", &name);
        if cm.disabled {
            return;
        }
        let tags = cm.tags_or_nil().map(|t| t.to_vec());

        let query = tsutil::get_property_value(obj, "query").strs;
        let binary = tsutil::get_property_value(obj, "binary").bool;

        let connect = self.get_property_assignment_initializer(obj, "onConnect", true);
        let disconnect = self.get_property_assignment_initializer(obj, "onDisconnect", true);

        let mut message: Option<ChannelFuncRef> = None;
        if let Some(on_msg) = self.get_property_assignment_initializer(obj, "onMessage", true) {
            let mut msg_func_id = self.extract_function_name(on_msg).pikku_func_id;
            if is_temp_id(&msg_func_id) {
                msg_func_id = make_context_based_id("channel", &[&name, "message"]);
            }
            if self.state.functions.meta.get(&msg_func_id).is_none() {
                self.log.critical(codes::FUNCTION_METADATA_NOT_FOUND, format!("No function metadata found for onMessage handler '{msg_func_id}'"));
                return;
            }
            let mut r = ChannelFuncRef { pikku_func_id: msg_func_id, package_name: String::new() };
            if ast::is_identifier(on_msg) {
                r.package_name = self.resolve_addon_name(on_msg);
            }
            message = Some(r);
        }

        let message_wirings = self.add_messages_routes(obj);

        let middleware = self.resolve_middleware(obj, tags.as_deref());
        let channel_middleware = self.resolve_channel_middleware(obj, tags.as_deref());

        let mut slot = |this: &mut Self, n: Option<P<Node>>, kind: &str| -> Option<ChannelFuncRef> {
            let n = n?;
            let mut id = this.extract_function_name(n).pikku_func_id;
            if is_temp_id(&id) {
                id = make_context_based_id("channel", &[&name, kind]);
            }
            let mut r = ChannelFuncRef { pikku_func_id: id.clone(), package_name: String::new() };
            if ast::is_identifier(n) {
                r.package_name = this.resolve_addon_name(n);
            }
            this.state.service_aggregation.used_functions.add(id);
            Some(r)
        };
        let connect_ref = slot(self, connect, "connect");
        let disconnect_ref = slot(self, disconnect, "disconnect");

        // A connect/disconnect handler addFunctions skipped (a local, unexported
        // pikkuChannelConnectionFunc) gets a partial entry, so the runtime knows
        // whether it is sessionless.
        let sessionless = match tsutil::get_property_value(obj, "auth").bool {
            Some(false) => Some(true),
            _ => None,
        };
        for r in [&connect_ref, &disconnect_ref].into_iter().flatten() {
            if self.state.functions.meta.get(&r.pikku_func_id).is_some() {
                continue;
            }
            let mut fm = JsObject::new();
            fm.set_str("pikkuFuncId", &r.pikku_func_id);
            if sessionless.is_some() {
                fm.set("sessionless", Some(Value::Bool(true)));
            }
            fm.set("inputSchemaName", Some(Value::Null));
            fm.set("outputSchemaName", Some(Value::Null));
            let mut meta = FunctionMeta::default();
            meta.pikku_func_id = r.pikku_func_id.clone();
            meta.sessionless = sessionless;
            meta.verbatim = fm.raw();
            self.state.functions.meta.set(r.pikku_func_id.clone(), meta);
        }

        if let Some(m) = &message {
            self.state.service_aggregation.used_functions.add(m.pikku_func_id.clone());
        }
        for (_, routes) in message_wirings.iter() {
            for (_, r) in routes.iter() {
                if let Some(rec) = raw_object(r) {
                    if let Some(id) = rec.get("pikkuFuncId").and_then(|v| v.value()).and_then(|v| v.as_str()) {
                        self.state.service_aggregation.used_functions.add(id.to_string());
                    }
                }
            }
        }
        self.add_used_middleware(&middleware);

        let desc = format!("Channel '{name}'");
        for r in [&connect_ref, &disconnect_ref, &message].into_iter().flatten() {
            if !r.pikku_func_id.is_empty() && !self.validate_auth_sessionless(obj, &r.pikku_func_id, &desc, None) {
                return;
            }
        }

        let mut o = JsObject::new();
        o.set_str("name", &name);
        o.set_str("route", &route);
        o.set("input", Some(Value::Null));
        if !params.is_empty() {
            o.set("params", Some(strs_value(&params)));
        }
        if let Some(q) = query.filter(|q| !q.is_empty()) {
            o.set("query", Some(strs_value(&q)));
        }
        o.set("connect", Some(opt_ref_value(&connect_ref)));
        o.set("disconnect", Some(opt_ref_value(&disconnect_ref)));
        o.set("message", Some(opt_ref_value(&message)));
        o.set("messageWirings", Some(serde_json::to_value(&message_wirings).expect("wirings serialise")));
        o.set("binary", Some(binary.map(Value::Bool).unwrap_or(Value::Null)));
        if let Some(a) = tsutil::get_property_value(obj, "auth").bool {
            o.set("auth", Some(Value::Bool(a)));
        }
        o.set("summary", cm.summary.as_deref().map(Value::from));
        o.set("description", cm.description.as_deref().map(Value::from));
        if cm.has_errors {
            o.set("errors", Some(strs_value(&cm.errors)));
        }
        if cm.has_tags {
            o.set("tags", Some(strs_value(&cm.tags)));
        }
        o.set("middleware", super::util_wire_meta::middleware_value(&middleware));
        o.set("channelMiddleware", super::util_wire_meta::middleware_value(&channel_middleware));
        self.state.channels.files.add(tsutil::file_name_of(node));
        self.state.channels.meta.set(name, o.raw());
    }

    /// `extractExportedChannelRoutes`: a defineChannelRoutes object read as the
    /// routes of one `contract` channel.
    fn extract_exported_channel_routes(&mut self, routes: P<Node>) -> Record<Raw> {
        // addMessagesRoutes over a synthetic { onMessageWiring: { contract: routes } }.
        let mut wirings = self.add_message_routes_of(vec![ChannelEntry { key: "contract".into(), key_ok: true, init: routes }]);
        wirings.delete("contract").unwrap_or_default()
    }
}
