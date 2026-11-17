//! Port of Go `visit/check_wiring_top_level.go`: a Pikku `wire*` call declares
//! a wiring for the build to read, so inside a function it is refused.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;

const TOP_LEVEL_WIRINGS: [&str; 14] = [
    "wireAddon",
    "wireRemoteAddon",
    "wireContributors",
    "wireChannel",
    "wireCLI",
    "wireGateway",
    "wireHTTP",
    "wireHTTPRoutes",
    "wireMCPPrompt",
    "wireMCPResource",
    "wireQueueWorker",
    "wireScheduler",
    "wireTrigger",
    "wireTriggerSource",
];

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "checkWiringsTopLevel",
        phase: Phase::Setup,
        order: order::CHECK_WIRINGS_TOP_LEVEL,
        visit: |c, n| c.check_wirings_top_level(n),
    });
}

fn is_function_boundary(n: P<Node>) -> bool {
    ast::is_arrow_function(n)
        || ast::is_function_expression(n)
        || ast::is_function_declaration(n)
        || ast::is_method_declaration(n)
        || ast::is_constructor_declaration(n)
        || ast::is_get_accessor_declaration(n)
        || ast::is_set_accessor_declaration(n)
}

fn enclosing_function(node: P<Node>) -> Option<P<Node>> {
    let mut cur = node.parent();
    while let Some(c) = cur {
        if is_function_boundary(c) {
            return Some(c);
        }
        cur = c.parent();
    }
    None
}

fn function_label(f: P<Node>) -> String {
    if let Some(name) = f.name() {
        if ast::is_identifier(name) || ast::is_string_literal(name) {
            return name.text().to_string();
        }
    }
    if let Some(p) = f.parent() {
        if ast::is_variable_declaration(p) || ast::is_property_assignment(p) {
            if let Some(name) = p.name() {
                if ast::is_identifier(name) {
                    return name.text().to_string();
                }
            }
        }
    }
    "an anonymous function".to_string()
}

impl Context<'_> {
    pub fn check_wirings_top_level(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !ast::is_identifier(node.expression().unwrap()) {
            return;
        }
        let Some(f) = enclosing_function(node) else { return };
        for name in TOP_LEVEL_WIRINGS {
            if self.calls_imported_definer(node.expression().unwrap(), name) {
                let message = format!(
                    "{name} must be called at the top level of a file, not inside a function (inside {}, {})",
                    function_label(f),
                    self.node_position(f)
                );
                self.log.critical(codes::WIRING_NOT_TOP_LEVEL, message);
                return;
            }
        }
    }
}
