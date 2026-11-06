//! Port of Go `visit/group_schedule.go`: add/add-schedule.ts.

use serde_json::Value;
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::util_shared::{JsObject, wiring_call};
use super::util_wire_meta::{middleware_value, prop_value};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::tsutil::{self, file_name_of};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addSchedule",
        phase: Phase::Routes,
        order: order::ADD_SCHEDULE,
        visit: |c, n| c.add_schedule(n),
    });
}

/// `orNull` renders a missing name the way a JS template literal renders null.
pub fn or_null(name: &str) -> &str {
    if name.is_empty() { "null" } else { name }
}

impl Context<'_> {
    pub fn add_schedule(&mut self, node: P<Node>) {
        let Some(obj) = wiring_call(node, "wireScheduler") else { return };
        let name = tsutil::get_property_value(obj, "name").as_string();
        let schedule = tsutil::get_property_value(obj, "schedule");
        let cm = self.wire_meta_data(obj, "Scheduler", &name);
        if cm.disabled {
            return;
        }
        let Some(func_init) = self.get_property_assignment_initializer(obj, "func", true) else {
            self.log.critical(codes::MISSING_FUNC, format!("No valid 'func' property for scheduled task '{}'.", or_null(&name)));
            return;
        };
        let (pikku_func_id, is_helper) = self.wiring_func_id(func_init, "scheduler", &name);
        let package_name = if ast::is_identifier(func_init) { self.resolve_addon_name(func_init) } else { String::new() };
        if name.is_empty() || !schedule.truthy() {
            return;
        }
        self.ensure_inline_wiring_function(&pikku_func_id, &name, Some(func_init), is_helper);
        let middleware = self.resolve_middleware(obj, cm.tags_or_nil());
        self.state.service_aggregation.used_functions.add(pikku_func_id.clone());
        self.add_used_wires(&middleware, &[]);

        self.state.scheduled_tasks.files.add(file_name_of(node));
        let mut o = JsObject::new();
        o.set_str("pikkuFuncId", &pikku_func_id);
        if !package_name.is_empty() {
            o.set_str("packageName", &package_name);
        }
        o.set_str("name", &name);
        o.set("schedule", prop_value(&schedule));
        o.set_common(&cm);
        o.set("middleware", middleware_value(&middleware));
        self.state.scheduled_tasks.meta.set(name.clone(), o.raw());
    }
}

#[allow(dead_code)]
fn _v(_: Value) {}
