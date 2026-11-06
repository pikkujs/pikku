//! Port of Go `visit/group_http.go`: add/add-http-route.ts,
//! add/add-http-routes.ts, add/add-queue-worker.ts and
//! utils/ensure-function-metadata.ts.

use serde_json::Value;
use tsrs_ast::{self as ast, Node};
use tsrs_checker::{ObjectFlags, SignatureKind, Type, TypeFlags};
use tsrs_core::P;

use super::util_channel_cli::resolve_ref_contract;
use super::util_callee::is_pikku_func;
use super::util_shared::wiring_call;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::{
    FunctionMeta, HttpRouteMeta, HttpRouteMetaFields, MetaInputTypes, QueueWorkerMeta, QueueWorkerMetaFields, Record,
    ServicesMeta,
};
use crate::tsutil::{self, file_name_of, find_property_assignment, first_decl, path_params};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addHTTPRoute", phase: Phase::Routes, order: order::ADD_HTTP_ROUTE, visit: |c, n| c.add_http_route(n) });
    r.register(Visitor { name: "addHTTPRoutes", phase: Phase::Routes, order: order::ADD_HTTP_ROUTES, visit: |c, n| c.add_http_routes(n) });
    r.register(Visitor {
        name: "addQueueWorker",
        phase: Phase::Routes,
        order: order::ADD_QUEUE_WORKER,
        visit: |c, n| c.visit_queue_worker(n),
    });
}

// --- wireHTTPRoutes -----------------------------------------------------------

/// Go `groupConfig`.
#[derive(Clone, Debug, Default)]
pub struct GroupConfig {
    pub base_path: String,
    pub tags: Vec<String>,
    pub auth: Option<bool>,
}

pub fn extract_group_config(obj: P<Node>) -> GroupConfig {
    GroupConfig {
        base_path: tsutil::get_property_value(obj, "basePath").as_string(),
        tags: tsutil::get_property_value(obj, "tags").strs.unwrap_or_default(),
        auth: tsutil::get_property_value(obj, "auth").bool,
    }
}

pub fn merge_configs(parent: &GroupConfig, child: &GroupConfig) -> GroupConfig {
    GroupConfig {
        base_path: format!("{}{}", parent.base_path, child.base_path),
        tags: parent.tags.iter().chain(child.tags.iter()).cloned().collect(),
        auth: child.auth.or(parent.auth),
    }
}

fn has_assigned_props(obj: P<Node>) -> std::collections::HashSet<String> {
    obj.properties()
        .iter()
        .filter(|p| ast::is_property_assignment(**p) && p.name().is_some_and(ast::is_identifier))
        .map(|p| p.name().unwrap().text().to_string())
        .collect()
}

pub fn is_route_config(obj: P<Node>) -> bool {
    let h = has_assigned_props(obj);
    h.contains("method") && h.contains("func") && h.contains("route")
}

pub fn is_route_contract(obj: P<Node>) -> bool {
    let h = has_assigned_props(obj);
    h.contains("routes") && !h.contains("method") && !h.contains("func")
}

/// Go `exportedRoute`: ExportedHTTPRouteConfigMeta or ExportedHTTPRoutesGroupMeta,
/// as an addon's pikku-http-contracts-meta.gen.json holds them.
#[derive(Clone, Debug, Default)]
pub struct ExportedRoute {
    pub method: Option<String>,
    pub route: Option<String>,
    pub base_path: String,
    pub tags: Vec<String>,
    pub auth: Option<bool>,
    pub sse: bool,
    pub func: Option<ExportedFunc>,
    pub routes: Option<Value>,
}

#[derive(Clone, Debug, Default)]
pub struct ExportedFunc {
    pub pikku_func_id: String,
    pub package_name: String,
}

fn field<'a>(o: &'a serde_json::Map<String, Value>, key: &str) -> Option<&'a Value> {
    // Go's encoding/json matches field names case-insensitively.
    o.get(key).or_else(|| o.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v)).filter(|v| !v.is_null())
}

/// Decodes like Go's `json.Unmarshal` into `exportedRoute`: `None` where Go
/// returns an error (not an object, or a field of the wrong type).
pub fn decode_exported_route(v: &Value) -> Option<ExportedRoute> {
    let o = v.as_object()?;
    let mut r = ExportedRoute::default();
    if let Some(m) = field(o, "method") {
        r.method = Some(m.as_str()?.to_string());
    }
    if let Some(m) = field(o, "route") {
        r.route = Some(m.as_str()?.to_string());
    }
    if let Some(m) = field(o, "basePath") {
        r.base_path = m.as_str()?.to_string();
    }
    if let Some(t) = field(o, "tags") {
        r.tags = t.as_array()?.iter().map(|x| x.as_str().map(str::to_string)).collect::<Option<Vec<_>>>()?;
    }
    if let Some(a) = field(o, "auth") {
        r.auth = Some(a.as_bool()?);
    }
    if let Some(s) = field(o, "sse") {
        r.sse = s.as_bool()?;
    }
    if let Some(f) = field(o, "func") {
        let fo = f.as_object()?;
        let mut ef = ExportedFunc::default();
        if let Some(x) = field(fo, "pikkuFuncId") {
            ef.pikku_func_id = x.as_str()?.to_string();
        }
        if let Some(x) = field(fo, "packageName") {
            ef.package_name = x.as_str()?.to_string();
        }
        r.func = Some(ef);
    }
    if let Some(rt) = o.get("routes").filter(|v| !v.is_null()) {
        r.routes = Some(rt.clone());
    }
    Some(r)
}

/// Go `missingFrom`.
fn missing_from(want: &[String], have: &[String]) -> Vec<String> {
    want.iter().filter(|w| !have.contains(w)).cloned().collect()
}

impl Context<'_> {
    pub fn add_http_route(&mut self, node: P<Node>) {
        if let Some(obj) = wiring_call(node, "wireHTTP") {
            let file = self.source_file.map(|sf| sf.get().file_name()).unwrap_or_else(|| file_name_of(node));
            self.register_http_route(obj, file, &GroupConfig::default());
        }
    }

    pub fn add_http_routes(&mut self, node: P<Node>) {
        if self.add_exported_http_routes(node) {
            return;
        }
        let Some(obj) = wiring_call(node, "wireHTTPRoutes") else { return };
        let group = extract_group_config(obj);
        if let Some(p) = find_property_assignment(obj, "routes") {
            let file = self.source_file.unwrap().get().file_name();
            self.process_routes(p.initializer().unwrap(), &group, file);
        }
    }

    pub fn visit_queue_worker(&mut self, node: P<Node>) {
        if let Some(obj) = wiring_call(node, "wireQueueWorker") {
            let file = self.source_file.unwrap().get().file_name();
            self.add_queue_worker(obj, file);
        }
    }

    pub fn process_routes(&mut self, node: P<Node>, parent: &GroupConfig, source_file: &str) {
        if ast::is_array_literal_expression(node) {
            for e in node.elements() {
                if ast::is_object_literal_expression(*e) && is_route_config(*e) {
                    self.register_http_route(*e, source_file, parent);
                }
            }
        } else if ast::is_object_literal_expression(node) {
            if is_route_config(node) {
                self.register_http_route(node, source_file, parent);
                return;
            }
            if is_route_contract(node) {
                let merged = merge_configs(parent, &extract_group_config(node));
                if let Some(p) = find_property_assignment(node, "routes") {
                    self.process_routes(p.initializer().unwrap(), &merged, source_file);
                }
                return;
            }
            for p in node.properties() {
                if ast::is_property_assignment(*p) {
                    let init = p.initializer().unwrap();
                    if !self.process_ref_http_contract(init, parent, source_file) {
                        self.process_routes(init, parent, source_file);
                    }
                }
            }
        } else if ast::is_call_expression(node) {
            self.process_ref_http_contract(node, parent, source_file);
        } else if ast::is_identifier(node) {
            if let Some(resolved) = self.resolve_identifier(node, &["defineHTTPRoutes"]) {
                self.process_routes(resolved, parent, source_file);
            }
        }
    }

    /// `processRefHTTPContract`: `refHTTP('ns:name')` mounts the routes the addon
    /// exported, under the consumer's basePath when it passes one. Reports
    /// whether `node` was such a call.
    pub fn process_ref_http_contract(&mut self, node: P<Node>, parent: &GroupConfig, source_file: &str) -> bool {
        let Some(raw) = resolve_ref_contract(node, "refHTTP", &self.state.exported_contracts.addon_http) else { return false };
        let Some(contract) = raw.value().and_then(decode_exported_route) else { return true };
        let mut base_path = contract.base_path.clone();
        let args = node.arguments();
        if args.len() > 1 && ast::is_object_literal_expression(args[1]) {
            if let Some(p) = find_property_assignment(args[1], "basePath") {
                let init = p.initializer().unwrap();
                if ast::is_string_literal(init) {
                    base_path = init.text().to_string();
                }
            }
        }
        if let Some(routes) = &contract.routes {
            let merged = merge_configs(parent, &GroupConfig { base_path, tags: contract.tags.clone(), auth: contract.auth });
            self.process_exported_route_map(routes, &merged, source_file);
        } else {
            // Go: an absent routes Raw decodes to nothing and the map walk returns.
        }
        true
    }

    fn process_exported_route_map(&mut self, routes: &Value, parent: &GroupConfig, source_file: &str) {
        let Some(obj) = routes.as_object() else { return };
        let mut entries: Record<Value> = Record::new();
        for (k, v) in obj {
            entries.set(k.clone(), v.clone());
        }
        let items: Vec<(String, Value)> = entries.iter().map(|(k, v)| (k.to_string(), v.clone())).collect();
        for (_, raw) in items {
            let Some(value) = decode_exported_route(&raw) else { continue };
            if value.method.is_some() && value.route.is_some() && value.func.is_some() {
                self.register_http_route_meta(&value, source_file, parent);
            } else if value.routes.is_some() && value.method.is_none() {
                let merged = merge_configs(
                    parent,
                    &GroupConfig { base_path: value.base_path.clone(), tags: value.tags.clone(), auth: value.auth },
                );
                self.process_exported_route_map(value.routes.as_ref().unwrap(), &merged, source_file);
            } else {
                self.process_exported_route_map(&raw, parent, source_file);
            }
        }
    }

    /// `registerHTTPRouteMeta`: one route an addon exported, recorded from its
    /// metadata rather than from source.
    fn register_http_route_meta(&mut self, route: &ExportedRoute, source_file: &str, group: &GroupConfig) {
        let method = route.method.as_ref().unwrap().to_lowercase();
        let full_route = format!("{}{}", group.base_path, route.route.as_ref().unwrap());
        let tags: Vec<String> = group.tags.iter().chain(route.tags.iter()).cloned().collect();
        let func = route.func.as_ref().unwrap();
        let func_name = func.pikku_func_id.clone();
        let Some(fn_meta) = self.resolve_function_meta(&func_name) else {
            self.log.critical(codes::FUNCTION_METADATA_NOT_FOUND, format!("No function metadata found for '{func_name}'."));
            return;
        };
        let params = match path_params(&full_route) {
            Ok(p) => p,
            Err(e) => {
                self.log.error(format!("Failed to parse route '{full_route}': {e}"));
                return;
            }
        };
        if func.package_name.is_empty() {
            let input = fn_meta.inputs.first().cloned().unwrap_or_default();
            self.compute_input_types(&method, &input, &[], &params);
        }
        let auth = route.auth.or(group.auth);
        let mut meta = HttpRouteMetaFields {
            pikku_func_id: func_name.clone(),
            package_name: func.package_name.clone(),
            route: full_route.clone(),
            source_file: source_file.to_string(),
            method: method.clone(),
            auth,
            group_base_path: group.base_path.clone(),
            ..Default::default()
        };
        if !params.is_empty() {
            meta.params = params;
        }
        if !tags.is_empty() {
            meta.tags = Some(tags);
        }
        if route.sse {
            meta.sse = Some(true);
        }
        self.state.service_aggregation.used_functions.add(func_name);
        self.state.http.files.add(source_file);
        self.set_http_route(&method, &full_route, HttpRouteMeta::new(meta));
    }

    fn set_http_route(&mut self, method: &str, full_route: &str, meta: HttpRouteMeta) {
        if !self.state.http.meta.has(method) {
            self.state.http.meta.set(method, Record::new());
        }
        self.state.http.meta.get_mut(method).unwrap().set(full_route, meta);
    }

    /// `resolveIdentifier`.
    pub fn resolve_identifier(&mut self, node: P<Node>, unwrap: &[&str]) -> Option<P<Node>> {
        let sym = self.symbol_at(node);
        let sym = self.resolve_alias(sym)?;
        let decl = sym.value_declaration().or_else(|| first_decl(Some(sym)))?;
        if !ast::is_variable_declaration(decl) {
            return None;
        }
        let init = decl.initializer()?;
        if ast::is_call_expression(init) && ast::is_identifier(init.expression().unwrap()) {
            for u in unwrap {
                if init.expression().unwrap().text() == *u {
                    return init.arguments().first().copied();
                }
            }
        }
        Some(init)
    }

    // --- wireHTTP / one route -----------------------------------------------

    pub fn register_http_route(&mut self, obj: P<Node>, source_file: &str, group: &GroupConfig) {
        let route_path = tsutil::get_property_value(obj, "route").as_string();
        if route_path.is_empty() {
            return;
        }
        let mut method = tsutil::get_property_value(obj, "method").as_string().to_lowercase();
        if method.is_empty() {
            method = "get".into();
        }
        let full_route = format!("{}{}", group.base_path, route_path);
        let params = match path_params(&full_route) {
            Ok(p) => p,
            Err(e) => {
                self.log.error(format!("Failed to parse route '{full_route}': {e}"));
                return;
            }
        };
        let cm = self.get_common_wire_meta_data(obj);
        if cm.disabled {
            return;
        }
        let tags: Vec<String> = group.tags.iter().chain(cm.tags.iter()).cloned().collect();
        let query = tsutil::get_property_value(obj, "query").strs.unwrap_or_default();

        let Some(func_init) = self.get_property_assignment_initializer(obj, "func", true) else {
            self.log.critical(codes::MISSING_FUNC, format!("No valid 'func' property for route '{full_route}'."));
            return;
        };
        let extracted = self.extract_function_name(func_init);
        let mut func_name = extracted.pikku_func_id.clone();
        if func_name.starts_with("__temp_") {
            func_name = format!("http:{method}:{full_route}");
        }
        let mut ref_target = String::new();
        if ast::is_call_expression(func_init)
            && ast::is_identifier(func_init.expression().unwrap())
            && func_init.expression().unwrap().text() == "ref"
        {
            let a = func_init.arguments();
            if !a.is_empty() && ast::is_string_literal(a[0]) && a[0].text().contains(':') {
                ref_target = a[0].text().to_string();
            }
        }
        let package_name = if ast::is_identifier(func_init) { self.resolve_addon_name(func_init) } else { String::new() };
        if !ref_target.is_empty() {
            if self.resolve_function_meta(&ref_target).is_none() {
                self.log.warn(format!("Skipping route '{full_route}': addon function metadata for '{ref_target}' is not available yet."));
                return;
            }
            func_name = ref_target;
        } else {
            self.ensure_function_metadata(&func_name, &full_route, Some(func_init), extracted.is_helper);
        }

        let mut resolved_auth = tsutil::get_property_value(obj, "auth").bool;
        if resolved_auth.is_none() {
            resolved_auth = group.auth;
        }
        if let Some(m) = self.state.functions.meta.get_mut(&func_name) {
            if m.sessionless.is_none() && resolved_auth == Some(false) {
                m.sessionless = Some(true);
            }
        }
        let Some(fn_meta) = self.resolve_function_meta(&func_name) else {
            self.log.critical(codes::FUNCTION_METADATA_NOT_FOUND, format!("No function metadata found for '{func_name}'."));
            return;
        };
        if !self.validate_auth_sessionless(obj, &func_name, &format!("Route '{full_route}'"), group.auth) {
            return;
        }
        if !params.is_empty() || !query.is_empty() {
            if let Some(keys) = self.route_input_keys(&func_name) {
                let missing = missing_from(&params, &keys);
                if !missing.is_empty() {
                    self.log.critical(
                        codes::ROUTE_PARAM_MISMATCH,
                        format!(
                            "Route '{full_route}' has path parameter(s) [{}] not found in function '{func_name}' input type. Input type has: [{}]",
                            missing.join(", "),
                            keys.join(", ")
                        ),
                    );
                    return;
                }
                let missing = missing_from(&query, &keys);
                if !missing.is_empty() {
                    self.log.critical(
                        codes::ROUTE_QUERY_MISMATCH,
                        format!(
                            "Route '{full_route}' has query parameter(s) [{}] not found in function '{func_name}' input type. Input type has: [{}]",
                            missing.join(", "),
                            keys.join(", ")
                        ),
                    );
                    return;
                }
            }
        }
        let input = fn_meta.inputs.first().cloned().unwrap_or_default();
        self.compute_input_types(&method, &input, &query, &params);

        let middleware = self.resolve_http_middleware(&full_route, obj, Some(&tags));
        let permissions = self.resolve_permissions(obj);
        let mut route = HttpRouteMetaFields {
            pikku_func_id: func_name.clone(),
            package_name,
            route: full_route.clone(),
            source_file: source_file.to_string(),
            method: method.clone(),
            auth: resolved_auth,
            title: cm.title.clone(),
            summary: cm.summary.clone(),
            description: cm.description.clone(),
            errors: cm.errors.clone(),
            middleware: middleware.clone(),
            permissions: permissions.clone(),
            group_base_path: group.base_path.clone(),
            ..Default::default()
        };
        self.state.service_aggregation.used_functions.add(func_name);
        self.add_used_wires(&middleware, &permissions);
        if !params.is_empty() {
            route.params = params;
        }
        if !query.is_empty() {
            route.query = query;
        }
        if !tags.is_empty() {
            route.tags = Some(tags);
        }
        if tsutil::get_property_value(obj, "sse").bool == Some(true) {
            route.sse = Some(true);
        }
        if let Some(h) = self.get_property_assignment_initializer(obj, "headers", true) {
            if ast::is_identifier(h) {
                // TS also checks the schema vendor and registers a schemaLookup entry.
                let sanitized = non_alnum_to_underscore(&full_route);
                route.headers_schema_name = format!("{}_{}_Headers", method.to_uppercase(), sanitized.trim_matches('_'));
            }
        }
        self.state.http.files.add(source_file);
        self.set_http_route(&method, &full_route, HttpRouteMeta::new(route));
    }

    // --- wireQueueWorker -----------------------------------------------------

    pub fn add_queue_worker(&mut self, obj: P<Node>, source_file: &str) {
        let name = tsutil::get_property_value(obj, "name").as_string();
        let cm = self.get_common_wire_meta_data(obj);
        if cm.disabled {
            return;
        }
        let Some(func_init) = self.get_property_assignment_initializer(obj, "func", true) else {
            self.log.critical(codes::MISSING_FUNC, format!("No valid 'func' property for queue processor '{name}'."));
            return;
        };
        let extracted = self.extract_function_name(func_init);
        let mut pikku_func_id = extracted.pikku_func_id.clone();
        if pikku_func_id.starts_with("__temp_") && !name.is_empty() {
            pikku_func_id = format!("queue:{name}");
        }
        let package_name = if ast::is_identifier(func_init) { self.resolve_addon_name(func_init) } else { String::new() };
        if name.is_empty() {
            self.log.critical(codes::MISSING_QUEUE_NAME, format!("No 'name' provided for queue processor function '{pikku_func_id}'."));
            return;
        }
        self.ensure_inline_wiring_function(&pikku_func_id, &name, Some(func_init), extracted.is_helper);
        let tags = if cm.has_tags { Some(cm.tags.clone()) } else { None };
        let middleware = self.resolve_middleware(obj, tags.as_deref());
        self.state.service_aggregation.used_functions.add(pikku_func_id.clone());
        self.add_used_wires(&middleware, &[]);
        self.state.queue_workers.files.add(source_file);
        self.state.queue_workers.meta.set(
            name.clone(),
            QueueWorkerMeta {
                fields: QueueWorkerMetaFields {
                    pikku_func_id,
                    package_name,
                    name,
                    summary: cm.summary.clone(),
                    description: cm.description.clone(),
                    errors: cm.errors.clone(),
                    tags,
                    middleware,
                },
                name_first: false,
            },
        );
    }

    // --- ensure-function-metadata.ts -----------------------------------------

    /// `ensureFunctionMetadata` is utils/ensure-function-metadata.ts: stub
    /// metadata for a function the wiring names but addFunctions did not
    /// register (an inline function, or a workflow helper when `is_helper`).
    pub fn ensure_function_metadata(&mut self, pikku_func_id: &str, fallback_name: &str, func_init: Option<P<Node>>, is_helper: bool) {
        if !self.state.functions.meta.has(pikku_func_id) {
            let fallback = if fallback_name.is_empty() { pikku_func_id } else { fallback_name };
            let mut m = FunctionMeta::default();
            m.pikku_func_id = pikku_func_id.to_string();
            m.function_type = if is_helper { "helper" } else { "inline" }.into();
            m.name = fallback.to_string();
            m.services = ServicesMeta { optimized: false, services: vec![] };
            m.inputs = vec![];
            m.outputs = vec![];
            m.inline = true;
            self.state.functions.meta.set(pikku_func_id, m);
        }
        let mut m = self.state.functions.meta.get(pikku_func_id).cloned().unwrap();
        if m.source_file.is_empty() {
            if let Some(fi) = func_init {
                m.source_file = file_name_of(fi).to_string();
            }
        }
        let Some(func_init) = func_init else {
            self.state.functions.meta.set(pikku_func_id, m);
            return;
        };
        let call = if ast::is_call_expression(func_init) {
            self.resolve_func_config_types(&mut m, pikku_func_id, func_init);
            if !self.types_lookup.contains_key(pikku_func_id) {
                self.populate_types_lookup(pikku_func_id, func_init);
            }
            Some(func_init)
        } else {
            self.resolve_to_pikku_func_call(func_init)
        };
        let Some(call) = call else {
            self.state.functions.meta.set(pikku_func_id, m);
            return;
        };
        let a = call.arguments();
        if a.is_empty() || !ast::is_object_literal_expression(a[0]) {
            self.state.functions.meta.set(pikku_func_id, m);
            return;
        }
        if m.tags.is_none() {
            let cm = self.get_common_wire_meta_data(a[0]);
            if cm.has_tags {
                m.tags = Some(cm.tags);
            }
        }
        if m.middleware.is_empty() {
            m.middleware = self.resolve_middleware(a[0], m.tags.as_deref());
        }
        if m.permissions.is_empty() {
            m.permissions = self.resolve_permissions(a[0]);
        }
        self.state.functions.meta.set(pikku_func_id, m);
    }

    fn populate_types_lookup(&mut self, pikku_func_id: &str, call: P<Node>) {
        let ta = call.type_arguments();
        if !ta.is_empty() {
            let t = self.checker.get_type_from_type_node_exported(ta[0]);
            self.types_lookup.insert(pikku_func_id.to_string(), vec![t]);
            return;
        }
        let call_type = self.checker.get_type_at_location(call);
        let Some(func_prop) = self.checker.get_property_of_type_exported(call_type, "func") else { return };
        let Some(ft) = self.checker.get_type_of_symbol_at_location(func_prop, Some(call)) else { return };
        let Some(sig) = self.first_call_signature(ft) else { return };
        let ps = sig.parameters();
        if ps.len() >= 2 {
            if let Some(t) = self.checker.get_type_of_symbol_at_location(ps[1], Some(call)) {
                if !t.flags().intersects(TypeFlags::VoidLike) {
                    self.types_lookup.insert(pikku_func_id.to_string(), vec![t]);
                }
            }
        }
    }

    pub fn ensure_inline_wiring_function(&mut self, pikku_func_id: &str, fallback_name: &str, func_init: Option<P<Node>>, is_helper: bool) {
        self.ensure_function_metadata(pikku_func_id, fallback_name, func_init, is_helper);
        let Some(fi) = func_init else { return };
        let needs = self.state.functions.meta.get(pikku_func_id).is_some_and(|m| m.sessionless.is_none())
            && ast::is_call_expression(fi)
            && ast::is_identifier(fi.expression().unwrap());
        if needs {
            let r = self.resolve_callee_name(fi, &is_pikku_func);
            if let Some(m) = self.state.functions.meta.get_mut(pikku_func_id) {
                m.sessionless = Some(r != "pikkuFunc");
            }
        }
    }

    fn resolve_to_pikku_func_call(&mut self, n: P<Node>) -> Option<P<Node>> {
        if tsutil::is_pikku_call(n) {
            return Some(n);
        }
        if ast::is_identifier(n) {
            let sym = self.symbol_at(n);
            let sym = self.resolve_alias(sym);
            if let Some(decl) = first_decl(sym) {
                if ast::is_variable_declaration(decl) {
                    if let Some(init) = decl.initializer() {
                        return self.resolve_to_pikku_func_call(init);
                    }
                }
            }
        }
        None
    }

    fn first_call_signature(&mut self, t: P<Type>) -> Option<P<tsrs_checker::Signature>> {
        let sigs = self.checker.get_signatures_of_type_exported(t, SignatureKind::Call);
        if let Some(s) = sigs.first() {
            return Some(*s);
        }
        if t.is_union() {
            for m in t.types() {
                let sigs = self.checker.get_signatures_of_type_exported(*m, SignatureKind::Call);
                if let Some(s) = sigs.first() {
                    return Some(*s);
                }
            }
        }
        None
    }

    fn resolve_func_config_types(&mut self, m: &mut FunctionMeta, pikku_func_id: &str, call: P<Node>) {
        if !m.inputs.is_empty() {
            return;
        }
        let config_type = self.checker.get_type_at_location(call);
        let Some(func_prop) = self.checker.get_property_of_type_exported(config_type, "func") else { return };
        let Some(ft) = self.checker.get_type_of_symbol_at_location(func_prop, Some(call)) else { return };
        let Some(sig) = self.first_call_signature(ft) else { return };
        let ps = sig.parameters();
        if ps.len() >= 2 {
            if let Some(t) = self.checker.get_type_of_symbol_at_location(ps[1], Some(call)) {
                let n = self.resolve_type_name(t, pikku_func_id, "Input");
                if !n.is_empty() {
                    m.inputs = vec![n.clone()];
                    m.input_schema_name = Some(n);
                }
            }
        }
        let ret = self.checker.get_return_type_of_signature_exported(sig);
        let ret = self.unwrap_promise_or_void(ret);
        let n = self.resolve_type_name(ret, pikku_func_id, "Output");
        if !n.is_empty() {
            m.outputs = vec![n.clone()];
            m.output_schema_name = Some(n);
        }

        // resolveFromConfigTypeArgs
        let type_args: Vec<P<Type>> = if let Some(a) = config_type.alias() {
            a.type_arguments().to_vec()
        } else if config_type.object_flags().intersects(ObjectFlags::Reference) {
            self.checker.get_type_arguments_exported(config_type).to_vec()
        } else {
            vec![]
        };
        if type_args.len() < 2 {
            return;
        }
        if m.inputs.is_empty() {
            let n = self.resolve_type_name(type_args[0], pikku_func_id, "Input");
            if !n.is_empty() {
                m.inputs = vec![n.clone()];
                m.input_schema_name = Some(n);
            }
        }
        if m.outputs.is_empty() {
            let u = self.unwrap_promise_or_void(type_args[1]);
            let n = self.resolve_type_name(u, pikku_func_id, "Output");
            if !n.is_empty() {
                m.outputs = vec![n.clone()];
                m.output_schema_name = Some(n);
            }
        }
    }

    /// `computeInputTypes` is add-http-route.ts's helper of the same name.
    pub fn compute_input_types(&mut self, method: &str, input: &str, query: &[String], params: &[String]) {
        if input.is_empty() {
            return;
        }
        let mut body = Vec::new();
        if method == "post" || method == "put" || method == "patch" {
            let all: Vec<String> = query.iter().chain(params.iter()).cloned().collect();
            body = tsutil::dedupe(&all);
        }
        self.state
            .http
            .meta_input_types
            .set(input, MetaInputTypes { query: query.to_vec(), params: params.to_vec(), body });
    }

    /// `routeInputKeys` is getRouteInputKeys: the input type's property names,
    /// or the input schema's when only that is known. `None` when neither is.
    fn route_input_keys(&mut self, func_name: &str) -> Option<Vec<String>> {
        if let Some(ts) = self.types_lookup.get(func_name).cloned() {
            if !ts.is_empty() {
                return Some(self.checker.get_properties_of_type_exported(ts[0]).iter().map(|p| p.name().to_string()).collect());
            }
        }
        let m = self.resolve_function_meta(func_name)?;
        let schema_name = m.input_schema_name.as_ref()?;
        let raw = self.state.schemas.get(schema_name)?;
        let props = raw.value()?.as_object()?.get("properties")?.as_object()?;
        let mut rec: Record<()> = Record::new();
        for k in props.keys() {
            rec.set(k.clone(), ());
        }
        Some(rec.keys().iter().map(|s| s.to_string()).collect())
    }
}

/// `tsutil.NonAlnum.ReplaceAllString(route, "_")`: every non-alphanumeric ASCII
/// byte becomes `_`.
fn non_alnum_to_underscore(s: &str) -> String {
    let mut out = String::new();
    let mut buf = [0u8; 4];
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else {
            // Go's regexp replaces per rune (UTF-8 aware), one `_` each.
            let _ = c.encode_utf8(&mut buf);
            out.push('_');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merges_group_configs() {
        let p = GroupConfig { base_path: "/api".into(), tags: vec!["a".into()], auth: Some(true) };
        let c = GroupConfig { base_path: "/v1".into(), tags: vec!["b".into()], auth: None };
        let m = merge_configs(&p, &c);
        assert_eq!(m.base_path, "/api/v1");
        assert_eq!(m.tags, ["a", "b"]);
        assert_eq!(m.auth, Some(true));
    }

    #[test]
    fn decodes_exported_routes_like_go() {
        let r = decode_exported_route(&json!({"method":"get","route":"/x","func":{"pikkuFuncId":"f","packageName":"p"},"SSE":true,"Tags":["t"]})).unwrap();
        assert_eq!(r.method.as_deref(), Some("get"));
        assert!(r.sse);
        assert_eq!(r.tags, ["t"]);
        assert_eq!(r.func.unwrap().package_name, "p");
        assert!(decode_exported_route(&json!({"method": 3})).is_none());
        assert!(decode_exported_route(&json!([1])).is_none());
    }

    #[test]
    fn headers_name_sanitising() {
        assert_eq!(non_alnum_to_underscore("/todos/:id"), "_todos__id");
        assert_eq!(missing_from(&["a".into(), "b".into()], &["b".into()]), ["a"]);
    }
}
