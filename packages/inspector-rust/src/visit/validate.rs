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
}
