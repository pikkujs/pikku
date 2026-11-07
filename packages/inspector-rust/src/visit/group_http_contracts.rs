//! Port of Go `visit/group_http_contracts.go`: the defineHTTPRoutes branch of
//! add/add-http-routes.ts. An exported `const x = defineHTTPRoutes({...})` is
//! serialized into `exportedContracts.http[x]` (serializeHTTPRoutesContract and
//! friends).

use serde_json::{Map as JsonMap, Value};
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::group_http::{extract_group_config, is_route_config, is_route_contract};
use super::util_shared::{JsObject, strs_value};
use super::util_wire_meta::num_value;
use super::Context;
use crate::state::Raw;
use crate::tsutil::{self, PropValue, find_property_assignment, node_text};

/// `propJSON` is a getPropertyValue result as JSON: null when absent.
fn prop_json(v: &PropValue) -> Value {
    if !v.present {
        return Value::Null;
    }
    if let Some(b) = v.bool {
        return Value::from(b);
    }
    if let Some(n) = v.num {
        return num_value(n);
    }
    if let Some(s) = &v.str {
        return Value::from(s.as_str());
    }
    if let Some(s) = &v.strs {
        return strs_value(s);
    }
    Value::Null
}

/// `orUndefined` is `value || undefined` for a property value.
fn or_undefined(v: &PropValue) -> Option<Value> {
    if !v.truthy() {
        return None;
    }
    if let Some(s) = &v.str {
        return Some(Value::from(s.as_str()));
    }
    if let Some(n) = v.num {
        return Some(num_value(n));
    }
    if let Some(b) = v.bool {
        return Some(Value::from(b));
    }
    v.strs.as_ref().map(|s| strs_value(s))
}

/// `httpRouteMapKey` is `prop.name.getText().replace(/^['"]|['"]$/g, '')`.
fn http_route_map_key(name: P<Node>) -> String {
    let mut k = node_text(name);
    if k.starts_with('\'') || k.starts_with('"') {
        k = &k[1..];
    }
    if k.ends_with('\'') || k.ends_with('"') {
        k = &k[..k.len() - 1];
    }
    k.to_string()
}

impl Context<'_> {
    /// `addExportedHTTPRoutes` handles a defineHTTPRoutes call; it reports
    /// whether the node was one, as addHTTPRoutes returns after it either way.
    pub fn add_exported_http_routes(&mut self, node: P<Node>) -> bool {
        if !ast::is_call_expression(node) {
            return false;
        }
        let callee = node.expression().unwrap();
        if !ast::is_identifier(callee) || callee.text() != "defineHTTPRoutes" {
            return false;
        }
        let export_name = self.exported_variable_name_of(node);
        let args = node.arguments();
        if !export_name.is_empty() && !args.is_empty() && ast::is_object_literal_expression(args[0]) {
            if let Some(contract) = self.serialize_http_routes_contract(args[0]) {
                self.state.exported_contracts.http.set(export_name, contract);
            }
        }
        true
    }

    /// `serializeHTTPRoutesContract` is add-http-routes.ts serializeHTTPRoutesContract.
    fn serialize_http_routes_contract(&mut self, node: P<Node>) -> Option<Raw> {
        let mut out = JsObject::new();
        if is_route_contract(node) {
            let p = find_property_assignment(node, "routes")?;
            if !ast::is_object_literal_expression(p.initializer().unwrap()) {
                return None;
            }
            // ...extractGroupConfig(node): auth is undefined unless a boolean.
            let g = extract_group_config(node);
            out.set("basePath", Some(Value::from(g.base_path.as_str())));
            out.set("tags", Some(strs_value(&g.tags)));
            if let Some(a) = g.auth {
                out.set("auth", Some(Value::from(a)));
            }
            let routes = self.serialize_http_route_map(p.initializer().unwrap());
            out.set("routes", Some(routes));
            return Some(out.raw());
        }
        let routes = self.serialize_http_route_map(node);
        out.set("routes", Some(routes));
        Some(out.raw())
    }

    /// `serializeHTTPRouteMap` is add-http-routes.ts serializeHTTPRouteMap.
    fn serialize_http_route_map(&mut self, node: P<Node>) -> Value {
        let mut result = crate::state::Record::<Value>::new();
        for p in node.properties() {
            if !ast::is_property_assignment(*p) {
                continue;
            }
            let key = http_route_map_key(p.name().unwrap());
            let value = p.initializer().unwrap();
            if ast::is_object_literal_expression(value) {
                if is_route_config(value) {
                    if let Some(route) = self.serialize_http_route_config(value) {
                        result.set(key, route.value().cloned().unwrap_or(Value::Null));
                    }
                } else if is_route_contract(value) {
                    if let Some(c) = self.serialize_http_routes_contract(value) {
                        result.set(key, c.value().cloned().unwrap_or(Value::Null));
                    }
                } else {
                    let m = self.serialize_http_route_map(value);
                    result.set(key, m);
                }
            } else if ast::is_identifier(value) {
                let Some(resolved) = self.resolve_identifier(value, &["defineHTTPRoutes"]) else { continue };
                if !ast::is_object_literal_expression(resolved) {
                    continue;
                }
                if is_route_contract(resolved) {
                    if let Some(c) = self.serialize_http_routes_contract(resolved) {
                        result.set(key, c.value().cloned().unwrap_or(Value::Null));
                    }
                } else {
                    let m = self.serialize_http_route_map(resolved);
                    result.set(key, m);
                }
            }
        }
        record_to_value(&result)
    }

    /// `serializeHTTPRouteConfig` is add-http-routes.ts serializeHTTPRouteConfig.
    fn serialize_http_route_config(&mut self, obj: P<Node>) -> Option<Raw> {
        let method = tsutil::get_property_value(obj, "method");
        let route = tsutil::get_property_value(obj, "route");
        let func_init = self.get_property_assignment_initializer(obj, "func", true);
        let func_init = match func_init {
            Some(f) if method.truthy() && route.truthy() => f,
            _ => return None,
        };

        let mut pikku_func_id = self.extract_function_name(func_init).pikku_func_id;
        let mut package_name = String::new();
        if ast::is_call_expression(func_init)
            && ast::is_identifier(func_init.expression().unwrap())
            && func_init.expression().unwrap().text() == "ref"
        {
            let a = func_init.arguments();
            if !a.is_empty() && ast::is_string_literal(a[0]) {
                pikku_func_id = a[0].text().to_string();
                if let Some(i) = pikku_func_id.find(':').filter(|i| *i > 0) {
                    if let Some(pkg) = self.addon_package(&pikku_func_id[..i]) {
                        package_name = pkg;
                    }
                }
            }
        } else if ast::is_identifier(func_init) {
            package_name = self.resolve_addon_name(func_init);
        }

        let mut out = JsObject::new();
        out.set("auth", Some(prop_json(&tsutil::get_property_value(obj, "auth"))));
        out.set("contentType", Some(prop_json(&tsutil::get_property_value(obj, "contentType"))));
        out.set("headers", or_undefined(&tsutil::get_property_value(obj, "headers")));
        out.set("method", Some(prop_json(&method)));
        out.set("route", Some(prop_json(&route)));
        out.set("sse", Some(prop_json(&tsutil::get_property_value(obj, "sse"))));
        out.set("tags", or_undefined(&tsutil::get_property_value(obj, "tags")));
        out.set("timeout", Some(prop_json(&tsutil::get_property_value(obj, "timeout"))));
        let mut f = JsObject::new();
        f.set_str("pikkuFuncId", &pikku_func_id);
        if !package_name.is_empty() {
            f.set_str("packageName", &package_name);
        }
        out.set("func", Some(f.into_value()));
        Some(out.raw())
    }
}

fn record_to_value(r: &crate::state::Record<Value>) -> Value {
    let mut m = JsonMap::new();
    for (k, v) in r.iter() {
        m.insert(k.to_string(), v.clone());
    }
    Value::Object(m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prop_json_forms() {
        assert_eq!(prop_json(&PropValue::default()), Value::Null);
        assert_eq!(prop_json(&PropValue { present: true, bool: Some(false), ..Default::default() }), Value::from(false));
        assert_eq!(prop_json(&PropValue { present: true, num: Some(5.0), ..Default::default() }), Value::from(5));
        assert_eq!(or_undefined(&PropValue { present: true, bool: Some(false), ..Default::default() }), None);
        assert_eq!(or_undefined(&PropValue { present: true, str: Some("x".into()), ..Default::default() }), Some(Value::from("x")));
    }
}
