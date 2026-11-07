//! Port of Go `visit/group_trigger.go`: add/add-trigger.ts.

use regex::Regex;
use serde_json::Value;
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::group_schedule::or_null;
use super::util_channel_cli::make_context_based_id;
use super::util_shared::{JsObject, strs_value};
use super::util_wire_meta::{middleware_value, prop_value};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::tsutil::{self, file_name_of};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addTrigger", phase: Phase::Routes, order: order::ADD_TRIGGER, visit: |c, n| c.add_trigger(n) });
}

/// `webhookSourceSteps` (addon_load.go).
const WEBHOOK_SOURCE_STEPS: [&str; 4] = ["receive", "check", "setup", "teardown"];

impl Context<'_> {
    pub fn add_trigger(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !ast::is_identifier(node.expression().unwrap()) {
            return;
        }
        let args = node.arguments();
        if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
            return;
        }
        let obj = args[0];
        match node.expression().unwrap().text() {
            "wireTrigger" => self.add_wire_trigger(node, obj),
            "wireTriggerSource" => self.add_wire_trigger_source(node, obj),
            "wireTriggerWebhookSource" => self.add_wire_trigger_webhook_source(node, obj),
            _ => {}
        }
    }

    fn add_wire_trigger(&mut self, node: P<Node>, obj: P<Node>) {
        let name = tsutil::get_property_value(obj, "name").as_string();
        let cm = self.wire_meta_data(obj, "Trigger", &name);
        if cm.disabled {
            return;
        }
        let Some(func_init) = self.get_property_assignment_initializer(obj, "func", true) else {
            self.log.critical(codes::MISSING_FUNC, format!("No valid 'func' property for trigger '{}'.", or_null(&name)));
            return;
        };
        let (pikku_func_id, is_helper) = self.wiring_func_id(func_init, "trigger", &name);
        if name.is_empty() {
            return;
        }
        self.ensure_inline_wiring_function(&pikku_func_id, &name, Some(func_init), is_helper);
        let middleware = self.resolve_middleware(obj, cm.tags_or_nil());
        self.state.service_aggregation.used_functions.add(pikku_func_id.clone());
        self.add_used_wires(&middleware, &[]);

        self.state.triggers.files.add(file_name_of(node));
        let mut o = JsObject::new();
        o.set_str("pikkuFuncId", &pikku_func_id);
        o.set_str("name", &name);
        o.set_common(&cm);
        o.set("middleware", middleware_value(&middleware));
        self.state.triggers.meta.set(name.clone(), o.raw());
    }

    fn add_wire_trigger_source(&mut self, node: P<Node>, obj: P<Node>) {
        let name = tsutil::get_property_value(obj, "name").as_string();
        if name.is_empty() {
            return;
        }
        let Some(func_init) = self.get_property_assignment_initializer(obj, "func", true) else {
            self.log.critical(codes::MISSING_FUNC, format!("No valid 'func' property for trigger source '{name}'."));
            return;
        };
        if ast::is_identifier(func_init) {
            let mut o = JsObject::new();
            o.set_str("name", &name);
            o.set_str("pikkuFuncId", func_init.text());
            let pkg = self.resolve_addon_name(func_init);
            if !pkg.is_empty() {
                o.set_str("packageName", &pkg);
            }
            self.state.triggers.source_meta.set(name, o.raw());
        }
        self.state.triggers.files.add(file_name_of(node));
    }

    fn add_wire_trigger_webhook_source(&mut self, node: P<Node>, obj: P<Node>) {
        let file = file_name_of(node).to_string();
        let name = tsutil::get_property_value(obj, "name").as_string();
        if name.is_empty() {
            self.log.critical(codes::MISSING_NAME, format!("wireTriggerWebhookSource in {file} needs 'name' as a string literal."));
            return;
        }
        let mut method = Some(Value::from("post"));
        if let Some(arr) = tsutil::get_array_property_value(obj, "method") {
            method = Some(strs_value(&arr));
        } else {
            let v = tsutil::get_property_value(obj, "method");
            if v.present {
                method = prop_value(&v);
            }
        }
        let mut route = Some(Value::from(format!("/webhooks/{name}")));
        let v = tsutil::get_property_value(obj, "route");
        if v.present {
            route = prop_value(&v);
        }
        let mut events: Vec<String> = Vec::new();
        if let Some(init) = self.get_property_assignment_initializer(obj, "events", false) {
            let t = self.checker.get_type_at_location(init);
            for p in self.checker.get_properties_of_type_exported(t) {
                events.push(p.name().to_string());
            }
            events.sort();
        }

        let mut o = JsObject::new();
        o.set_str("name", &name);
        o.set("method", method);
        o.set("route", route);
        o.set("events", Some(strs_value(&events)));
        for step in WEBHOOK_SOURCE_STEPS {
            let Some(init) = self.get_property_assignment_initializer(obj, step, true) else { continue };
            let target = ref_target(init);
            if !target.is_empty() {
                if self.resolve_function_meta(&target).is_none() {
                    self.log.warn(format!("Webhook source '{name}': addon function metadata for '{target}' is not available yet."));
                }
                o.set_str(step, &target);
                self.state.service_aggregation.used_functions.add(target);
                continue;
            }
            let extracted = self.extract_function_name(init);
            let mut id = extracted.pikku_func_id;
            if id.starts_with("__temp_") {
                id = make_context_based_id("trigger-webhook", &[&name, step]);
            }
            self.ensure_inline_wiring_function(&id, &format!("{name}:{step}"), Some(init), extracted.is_helper);
            if let Some(m) = self.state.functions.meta.get_mut(&id) {
                if m.sessionless.is_none() {
                    m.sessionless = Some(true);
                }
            }
            o.set_str(step, &id);
            self.state.service_aggregation.used_functions.add(id);
        }
        self.state.triggers.webhook_source_meta.get_or_insert_with(Default::default).set(name.clone(), o.raw());
        self.state.triggers.files.add(file.clone());

        if self.get_property_assignment_initializer(obj, "verify", false).is_none() {
            return;
        }
        let mut credential = webhook_secret_credential_name(&name);
        let v = tsutil::get_property_value(obj, "credential");
        if v.present {
            credential = v.as_string();
        }
        let mut c = JsObject::new();
        c.set_str("name", &credential);
        c.set_str("displayName", &format!("{name} webhook secret"));
        let v = tsutil::get_property_value(obj, "credentialDescription");
        if v.present {
            c.set("description", prop_value(&v));
        }
        c.set_str("type", "singleton");
        c.set("schema", Some(serde_json::json!({"type": "string"})));
        c.set_str("sourceFile", &file);
        self.state.credentials.files.add(file);
        self.state.credentials.definitions.push(c.raw());
    }

    /// Go `ValidateWebhookSourceTriggers` (validateWebhookSourceTriggers), run
    /// after the routes sweep.
    pub fn validate_webhook_source_triggers(&mut self) {
        struct View {
            name: String,
            events: Vec<String>,
        }
        let mut sources: std::collections::HashMap<String, View> = Default::default();
        let mut errors: Vec<String> = Vec::new();
        if let Some(wsm) = &self.state.triggers.webhook_source_meta {
            for (key, raw) in wsm.iter() {
                let v = raw.value();
                let get_str = |k: &str| v.and_then(|v| v.get(k)).and_then(Value::as_str).unwrap_or("").to_string();
                let events: Vec<String> = v
                    .and_then(|v| v.get("events"))
                    .and_then(Value::as_array)
                    .map(|a| a.iter().filter_map(|e| e.as_str().map(str::to_string)).collect())
                    .unwrap_or_default();
                let view = View { name: get_str("name"), events };
                let receive = get_str("receive");
                if !receive.is_empty() {
                    if let Some(m) = self.state.functions.meta.get(&receive) {
                        if !m.func_wrapper.is_empty() && m.webhook_receive != Some(true) {
                            errors.push(format!(
                                "Webhook source '{}' receives with '{}', a {}. Declare it with pikkuWebhookReceive so it is never callable as an RPC.",
                                view.name, receive, m.func_wrapper
                            ));
                        }
                    }
                }
                sources.insert(key.to_string(), view);
            }
        }
        for e in errors {
            self.log.error(e);
        }
        let triggers: Vec<String> = self.state.triggers.meta.keys().iter().map(|k| k.to_string()).collect();
        for trigger in triggers {
            let Some(colon) = trigger.find(':') else { continue };
            let Some(source) = sources.get(&trigger[..colon]) else { continue };
            if source.events.is_empty() {
                continue;
            }
            let event = &trigger[colon + 1..];
            if !source.events.iter().any(|e| e == event) {
                let msg = format!(
                    "Trigger '{}' listens for '{}', which webhook source '{}' does not declare. Declared: {}.",
                    trigger,
                    event,
                    source.name,
                    source.events.join(", ")
                );
                self.log.error(msg);
            }
        }
    }
}

/// `refTarget` is the "<addon>:<function>" of `ref('<addon>:<function>')`.
fn ref_target(n: P<Node>) -> String {
    if !ast::is_call_expression(n) || !ast::is_identifier(n.expression().unwrap()) || n.expression().unwrap().text() != "ref" {
        return String::new();
    }
    let args = n.arguments();
    if !args.is_empty() && ast::is_string_literal(args[0]) && args[0].text().contains(':') {
        return args[0].text().to_string();
    }
    String::new()
}

/// `webhookSecretCredentialName` is @pikku/core/trigger's.
fn webhook_secret_credential_name(source: &str) -> String {
    let re = Regex::new(r"(?i)[-_]+([a-z0-9])").unwrap();
    let camel = re.replace_all(source, |caps: &regex::Captures| caps[1].to_uppercase());
    format!("{camel}WebhookSecret")
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_names() {
        assert_eq!(webhook_secret_credential_name("stripe"), "stripeWebhookSecret");
        assert_eq!(webhook_secret_credential_name("git-hub_events"), "gitHubEventsWebhookSecret");
        assert_eq!(webhook_secret_credential_name("a--b"), "aBWebhookSecret");
    }
}
