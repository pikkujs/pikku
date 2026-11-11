//! Port of Go `visit/group_analytics.go`: add/add-analytics.ts.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::util_shared::{literal_key_name, read_event_shape};
use super::{Context, Phase, Registry, Visitor, order};
use crate::state::{AnalyticsDeclaration, Record};
use crate::tsutil::file_name_of;

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addAnalytics", phase: Phase::Setup, order: order::ADD_ANALYTICS, visit: |c, n| c.add_analytics(n) });
}

impl Context<'_> {
    pub fn add_analytics(&mut self, node: P<Node>) {
        let Some((call, name)) = self.definer_declaration(node, "defineAnalyticsEvents") else { return };
        let file = file_name_of(node).to_string();
        let args = call.arguments();
        if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
            self.log.error(format!(
                "defineAnalyticsEvents in {file} must be called with an object literal keyed by event name, so the generated ingest knows what to union."
            ));
            return;
        }

        let mut events: Vec<String> = Vec::new();
        let mut props: Record<Record<String>> = Record::new();
        for p in args[0].properties() {
            let p = *p;
            if ast::is_shorthand_property_assignment(p) {
                events.push(p.name().unwrap().text().to_string());
                continue;
            }
            if !ast::is_property_assignment(p) {
                continue;
            }
            let Some(event_name) = literal_key_name(p.name()) else { continue };
            events.push(event_name.clone());
            if let Some(shape) = read_event_shape(p.initializer().unwrap()) {
                props.set(event_name, shape);
            }
        }

        if events.is_empty() {
            self.log.error(format!("defineAnalyticsEvents in {file} declares no events. Remove it or add one."));
            return;
        }
        let Some(variable) = self.module_exported_name(node, name) else {
            self.log.error(format!(
                "defineAnalyticsEvents in {file} is assigned to '{}', which the module does not export. The generated ingest imports every declaration by name, so export it.",
                name.text()
            ));
            return;
        };
        let props = if props.is_empty() { None } else { Some(props) };

        if let Some(d) = self.state.analytics.iter_mut().find(|d| d.file == file && d.variable == variable) {
            d.events = events;
            d.props = props;
            return;
        }
        for event_name in &events {
            for d in &self.state.analytics {
                if d.events.iter().any(|e| e == event_name) {
                    let msg = format!(
                        "Analytics event '{event_name}' is declared twice: {} and {file}. An event name belongs to one declaration.",
                        d.file
                    );
                    self.log.error(msg);
                    return;
                }
            }
        }
        self.state.analytics.push(AnalyticsDeclaration { file, variable, events, props });
    }
}
