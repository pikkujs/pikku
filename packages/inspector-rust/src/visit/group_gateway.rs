//! Port of Go `visit/group_gateway.go`: add/add-gateway.ts.

use serde_json::Value;
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::group_schedule::or_null;
use super::util_shared::{JsObject, wiring_call};
use super::util_wire_meta::{middleware_value, prop_value};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::{FunctionMeta, HttpRouteMeta, HttpRouteMetaFields, Record};
use crate::tsutil::{self, file_name_of};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addGateway", phase: Phase::Routes, order: order::ADD_GATEWAY, visit: |c, n| c.add_gateway(n) });
}

impl Context<'_> {
    pub fn add_gateway(&mut self, node: P<Node>) {
        let Some(obj) = wiring_call(node, "wireGateway") else { return };
        let name = tsutil::get_property_value(obj, "name").as_string();
        let typ = tsutil::get_property_value(obj, "type");
        let route = tsutil::get_property_value(obj, "route");
        let platform = tsutil::get_property_value(obj, "platform");
        let auth = tsutil::get_property_value(obj, "auth");
        let cm = self.wire_meta_data(obj, "Gateway", &name);
        if cm.disabled {
            return;
        }
        let Some(func_init) = self.get_property_assignment_initializer(obj, "func", true) else {
            self.log.critical(codes::MISSING_FUNC, format!("No valid 'func' property for gateway '{}'.", or_null(&name)));
            return;
        };
        let (pikku_func_id, is_helper) = self.wiring_func_id(func_init, "gateway", &name);
        let package_name = if ast::is_identifier(func_init) { self.resolve_addon_name(func_init) } else { String::new() };
        if name.is_empty() || !typ.truthy() {
            return;
        }
        self.ensure_inline_wiring_function(&pikku_func_id, &name, Some(func_init), is_helper);
        let middleware = self.resolve_middleware(obj, cm.tags_or_nil());
        self.state.service_aggregation.used_functions.add(pikku_func_id.clone());
        self.add_used_wires(&middleware, &[]);

        let file = file_name_of(node);
        if typ.str.as_deref() == Some("webhook") && route.truthy() {
            let r = prop_value(&route);
            for (method, func_id) in [("post", format!("gateway__{name}__post")), ("get", format!("gateway__{name}__verify"))] {
                let mut hm = JsObject::new();
                hm.set_str("pikkuFuncId", &func_id);
                hm.set("route", r.clone());
                hm.set_str("method", method);
                let route_str = match &r {
                    Some(Value::String(s)) => s.clone(),
                    _ => String::new(),
                };
                if !self.state.http.meta.has(method) {
                    self.state.http.meta.set(method, Record::new());
                }
                let mut hmeta = HttpRouteMeta::new(HttpRouteMetaFields {
                    pikku_func_id: func_id.clone(),
                    route: route_str.clone(),
                    method: method.to_string(),
                    ..Default::default()
                });
                hmeta.verbatim = hm.raw();
                self.state.http.meta.get_mut(method).unwrap().set(route_str, hmeta);

                let mut fm = JsObject::new();
                fm.set_str("pikkuFuncId", &func_id);
                fm.set("inputSchemaName", Some(Value::Null));
                fm.set("outputSchemaName", Some(Value::Null));
                fm.set("sessionless", Some(Value::Bool(true)));
                let mut meta = FunctionMeta::default();
                meta.pikku_func_id = func_id.clone();
                meta.sessionless = Some(true);
                meta.verbatim = fm.raw();
                self.state.functions.meta.set(func_id, meta);
            }
            self.state.http.files.add(file);
        }

        self.state.gateways.files.add(file);
        let mut o = JsObject::new();
        o.set_str("pikkuFuncId", &pikku_func_id);
        if !package_name.is_empty() {
            o.set_str("packageName", &package_name);
        }
        o.set_str("name", &name);
        o.set("type", prop_value(&typ));
        if route.truthy() {
            o.set("route", prop_value(&route));
        }
        if platform.truthy() {
            o.set("platform", prop_value(&platform));
        }
        if let Some(a) = auth.bool {
            o.set("auth", Some(Value::Bool(a)));
        }
        o.set("gateway", Some(Value::Bool(true)));
        o.set_common(&cm);
        o.set("middleware", middleware_value(&middleware));
        self.state.gateways.meta.set(name, o.raw());
    }
}
