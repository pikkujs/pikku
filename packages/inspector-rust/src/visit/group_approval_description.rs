//! Port of Go `visit/group_approval_description.go`: add/add-approval-description.ts.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::util_middleware::{join_services, nullable_string, services_of, wires_or_nil};
use super::util_props::extract_used_wires;
use super::{Context, Phase, Registry, Visitor, order};
use crate::state::MiddlewareDefinition;
use crate::tsutil::{self, file_name_of, start_utf16};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addApprovalDescription",
        phase: Phase::Setup,
        order: order::ADD_APPROVAL_DESCRIPTION,
        visit: |c, n| c.add_approval_description(n),
    });
}

impl Context<'_> {
    pub fn add_approval_description(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) {
            return;
        }
        let expr = node.expression().unwrap();
        if !ast::is_identifier(expr) || expr.text() != "pikkuApprovalDescription" {
            return;
        }
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let handler = args[0];
        if !tsutil::is_function_like(handler) {
            self.log.error("• Handler for pikkuApprovalDescription is not a function.");
            return;
        }
        let services = services_of(handler);
        let wires = extract_used_wires(handler, 1);
        let Some((id, exported_name)) = self.definition_id(node, "pikkuApprovalDescription", "myApproval") else { return };
        self.state.functions.approval_descriptions.set(
            id.clone(),
            MiddlewareDefinition {
                services: services.clone(),
                wires: wires_or_nil(wires),
                source_file: file_name_of(node).to_string(),
                position: start_utf16(node) as i64,
                exported_name: nullable_string(&exported_name),
                ..Default::default()
            },
        );
        self.log.debug(format!("• Found approval description '{id}' with services: {}", join_services(&services)));
    }
}
