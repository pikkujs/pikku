//! Port of Go `visit/validate.go`: utils/validate-auth-sessionless.ts and
//! `ValidateWebhookSourceTriggers` (validateWebhookSourceTriggers, which Go
//! keeps beside the trigger group).

use tsrs_ast::Node;
use tsrs_core::P;

use super::Context;
use crate::diag::codes;
use crate::state::Raw;
use crate::tsutil;

/// `webhookSourceView`: what the validator reads of a webhook source.
#[derive(Default)]
struct WebhookSourceView {
    name: String,
    receive: String,
    events: Vec<String>,
}

fn view_of(raw: &Raw) -> WebhookSourceView {
    let mut v = WebhookSourceView::default();
    let Some(o) = raw.value().and_then(|v| v.as_object()) else { return v };
    // Go decodes field by field and ignores a field of the wrong type.
    if let Some(s) = o.get("name").and_then(|x| x.as_str()) {
        v.name = s.to_string();
    }
    if let Some(s) = o.get("receive").and_then(|x| x.as_str()) {
        v.receive = s.to_string();
    }
    if let Some(a) = o.get("events").and_then(|x| x.as_array())
        && a.iter().all(|e| e.is_string())
    {
        v.events = a.iter().map(|e| e.as_str().unwrap().to_string()).collect();
    }
    v
}

impl Context<'_> {
    /// `validateAuthSessionless` ports utils/validate-auth-sessionless.ts.
    pub fn validate_auth_sessionless(
        &mut self,
        obj: P<Node>,
        func_name: &str,
        wire_description: &str,
        inherited_auth: Option<bool>,
    ) -> bool {
        let Some(fn_meta) = self.resolve_function_meta(func_name) else { return true };
        let resolved_auth = tsutil::get_property_value(obj, "auth").bool.or(inherited_auth);
        if resolved_auth == Some(false) && fn_meta.sessionless == Some(false) {
            self.log.critical(
                codes::AUTH_DISABLED_REQUIRES_SESSIONLESS,
                format!(
                    "{wire_description} has auth disabled but function '{func_name}' uses pikkuFunc (requires session). Use pikkuSessionlessFunc instead."
                ),
            );
            return false;
        }
        true
    }

    /// `ValidateWebhookSourceTriggers`, run after the routes sweep.
    pub fn validate_webhook_source_triggers(&mut self) {
        let mut sources: Vec<(String, WebhookSourceView)> = Vec::new();
        let entries: Vec<(String, Raw)> = self
            .state
            .triggers
            .webhook_source_meta
            .as_ref()
            .map(|m| m.iter().map(|(k, v)| (k.to_string(), v.clone())).collect())
            .unwrap_or_default();
        for (key, raw) in entries {
            let v = view_of(&raw);
            if !v.receive.is_empty()
                && let Some(m) = self.state.functions.meta.get(&v.receive)
                && !m.func_wrapper.is_empty()
                && m.webhook_receive != Some(true)
            {
                let msg = format!(
                    "Webhook source '{}' receives with '{}', a {}. Declare it with pikkuWebhookReceive so it is never callable as an RPC.",
                    v.name, v.receive, m.func_wrapper
                );
                self.log.error(msg);
            }
            sources.push((key, v));
        }
        let triggers: Vec<String> = self.state.triggers.meta.keys().into_iter().map(String::from).collect();
        for trigger in triggers {
            let Some(colon) = trigger.find(':') else { continue };
            let Some((_, source)) = sources.iter().rev().find(|(k, _)| *k == trigger[..colon]) else { continue };
            if source.events.is_empty() {
                continue;
            }
            let event = &trigger[colon + 1..];
            if !source.events.iter().any(|e| e == event) {
                self.log.error(format!(
                    "Trigger '{trigger}' listens for '{event}', which webhook source '{}' does not declare. Declared: {}.",
                    source.name,
                    source.events.join(", ")
                ));
            }
        }
    }
}
