//! Port of Go `visit/group_outgoing_webhook.go`: add/add-outgoing-webhook.ts.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::util_shared::{literal_named_property, read_event_shape};
use super::{Context, Phase, Registry, Visitor, order};
use crate::state::OutgoingWebhook;
use crate::tsutil::file_name_of;

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addOutgoingWebhook",
        phase: Phase::Setup,
        order: order::ADD_OUTGOING_WEBHOOK,
        visit: |c, n| c.add_outgoing_webhook(n),
    });
}

/// `webhookString` is add-outgoing-webhook.ts stringProperty: the first
/// property named key decides, and only a plain string literal reads.
fn webhook_string(obj: P<Node>, key: &str) -> Option<String> {
    let p = literal_named_property(obj, key)?;
    let v = p.initializer()?;
    if ast::is_string_literal(v) || ast::is_no_substitution_template_literal(v) { Some(v.text().to_string()) } else { None }
}

impl Context<'_> {
    pub fn add_outgoing_webhook(&mut self, node: P<Node>) {
        let Some((call, name)) = self.definer_declaration(node, "defineOutgoingWebhook") else { return };
        let file = file_name_of(node);
        let args = call.arguments();
        if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
            self.log.error(format!("defineOutgoingWebhook in {file} must be called with an object literal: {{ event, title, payload }}."));
            return;
        }
        let arg = args[0];
        let event = webhook_string(arg, "event").unwrap_or_default();
        let title = webhook_string(arg, "title").unwrap_or_default();
        if event.is_empty() || title.is_empty() {
            self.log.error(format!(
                "defineOutgoingWebhook '{}' in {file} needs 'event' and 'title' as string literals, so they can be listed without running the app.",
                name.text()
            ));
            return;
        }
        let Some(variable) = self.module_exported_name(node, name) else {
            self.log.error(format!(
                "defineOutgoingWebhook '{event}' in {file} is assigned to '{}', which the module does not export. The generated webhook types import it by name, so export it.",
                name.text()
            ));
            return;
        };

        let mut entry = OutgoingWebhook {
            file: file.to_string(),
            variable: variable.clone(),
            event: event.clone(),
            title,
            description: None,
            payload: None,
        };
        if let Some(d) = webhook_string(arg, "description") {
            entry.description = Some(d);
        }
        if let Some(p) = literal_named_property(arg, "payload") {
            entry.payload = read_event_shape(p.initializer().unwrap());
        }

        let existing = self.state.outgoing_webhooks.iter().position(|w| w.file == file && w.variable == variable);
        for (i, w) in self.state.outgoing_webhooks.iter().enumerate() {
            if w.event == event && Some(i) != existing {
                let msg = format!(
                    "Webhook event '{event}' is declared twice: {} and {file}. An event belongs to one defineOutgoingWebhook.",
                    w.file
                );
                self.log.error(msg);
                return;
            }
        }
        match existing {
            Some(i) => self.state.outgoing_webhooks[i] = entry,
            None => self.state.outgoing_webhooks.push(entry),
        }
    }
}
