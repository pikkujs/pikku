//! Port of Go `visit/group_wire_contributors.go`: wireContributors({ package,
//! contributors }), an opt-in to the contributors a plain package registers
//! with defineContributors.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::addon_load::AddonDecl;
use super::group_wire_addon::{is_string_literal, node_text, parse_string_array, prop_key};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::tsutil::file_name_of;

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addWireContributors",
        phase: Phase::Setup,
        order: order::ADD_WIRE_CONTRIBUTORS,
        visit: |c, n| c.add_wire_contributors(n),
    });
}

impl Context<'_> {
    /// It declares no addon, so nothing about it exists at runtime.
    pub fn add_wire_contributors(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !self.calls_imported_definer(node.expression().unwrap(), "wireContributors") {
            return;
        }
        let args = node.arguments();
        if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
            let mut msg = "wireContributors must be called with an object literal { package, contributors }".to_string();
            if !args.is_empty() {
                msg += &format!(", got: {}", node_text(args[0]));
            }
            self.log.critical(codes::ADDON_CONTRIBUTORS_NOT_STATIC, msg);
            return;
        }
        let mut decl = AddonDecl { contributors_only: true, file: file_name_of(node).to_string(), ..Default::default() };
        for p in args[0].properties() {
            let p = *p;
            let Some(key) = prop_key(p) else { continue };
            let Some(init) = p.initializer() else { continue };
            if key == "package" && is_string_literal(init) {
                decl.pkg = init.text().to_string();
            } else if key == "contributors" {
                match parse_string_array(init) {
                    Some(names) => decl.contributors = names,
                    None => self.log.critical(
                        codes::ADDON_CONTRIBUTORS_NOT_STATIC,
                        format!("wireContributors' contributors must be an array of string literals, got: {}", node_text(init)),
                    ),
                }
            }
        }
        if decl.pkg.is_empty() {
            self.log.critical(codes::ADDON_CONTRIBUTORS_NOT_STATIC, "wireContributors needs a package that is a string literal".to_string());
            return;
        }
        if decl.contributors.is_empty() {
            return;
        }
        self.log.debug(format!("• Found wireContributors: {}", decl.pkg));
        self.contributor_wirings.push(decl);
    }
}
