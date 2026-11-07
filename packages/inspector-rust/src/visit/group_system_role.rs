//! Port of Go `visit/group_system_role.go`: add/add-system-role.ts.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::group_scope::{SCOPE_SEPARATOR, or_undefined};
use super::util_shared::{JsObject, literal_key_name, literal_named_property, strs_value};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::tsutil::{self, file_name_of};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addSystemRole",
        phase: Phase::Routes,
        order: order::ADD_SYSTEM_ROLE,
        visit: |c, n| c.add_system_role(n),
    });
}

impl Context<'_> {
    /// `stringLiteralList` reads an array literal of (as-unwrapped) string
    /// literals, reporting each element that is not one with `not_literal`.
    fn string_literal_list(&mut self, arr: P<Node>, not_literal: &str) -> Vec<String> {
        let mut out = Vec::new();
        for el in arr.elements() {
            let el = tsutil::unwrap_as(*el);
            if !ast::is_string_literal(el) {
                self.log.critical(codes::INVALID_VALUE, not_literal);
                continue;
            }
            out.push(el.text().to_string());
        }
        out
    }

    fn extract_role_scopes(&mut self, obj: P<Node>, role_name: &str) -> Option<Vec<String>> {
        let Some(prop) = literal_named_property(obj, "scopes") else {
            self.log.critical(codes::INVALID_VALUE, format!("System role '{role_name}' has no 'scopes'. A role that grants nothing should say so with 'scopes: []'."));
            return None;
        };
        let init = prop.initializer().unwrap();
        if !ast::is_array_literal_expression(init) {
            self.log.critical(codes::INVALID_VALUE, format!("System role '{role_name}' must declare 'scopes' as an array literal."));
            return None;
        }
        Some(self.string_literal_list(init, &format!("System role '{role_name}' lists a scope that is not a string literal. Scopes are extracted by AST, so a computed value cannot be checked against the declared set.")))
    }

    pub fn add_system_role(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) {
            return;
        }
        let expr = node.expression().unwrap();
        if !ast::is_identifier(expr) || expr.text() != "defineSystemRole" {
            return;
        }
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let obj = tsutil::unwrap_as(args[0]);
        if !ast::is_object_literal_expression(obj) {
            return;
        }
        let source_file = file_name_of(node).to_string();

        for prop in obj.properties() {
            if !ast::is_property_assignment(*prop) {
                continue;
            }
            let Some(name) = literal_key_name(prop.name()) else {
                self.log.critical(codes::NON_LITERAL_WIRE_NAME, "A system role is declared with a key that is not a literal.");
                continue;
            };
            if name.is_empty() {
                self.log.critical(codes::INVALID_VALUE, "A system role is declared with an empty name.");
                continue;
            }
            if name.contains(SCOPE_SEPARATOR) {
                self.log.critical(codes::INVALID_VALUE, format!("System role '{name}' contains the '{SCOPE_SEPARATOR}' separator. '{SCOPE_SEPARATOR}' delimits scope ids; a role named like a scope reads as one."));
                continue;
            }
            let body = prop.initializer().unwrap();
            if !ast::is_object_literal_expression(body) {
                self.log.critical(codes::INVALID_VALUE, format!("System role '{name}' must be an object literal."));
                continue;
            }
            let Some(scopes) = self.extract_role_scopes(body, &name) else { continue };
            let display_name = tsutil::get_property_value(body, "displayName");
            let description = tsutil::get_property_value(body, "description");

            self.state.system_roles.files.add(source_file.clone());
            let mut o = JsObject::new();
            o.set_str("name", &name);
            o.set("displayName", or_undefined(&display_name));
            o.set("description", or_undefined(&description));
            o.set("scopes", Some(strs_value(&scopes)));
            o.set_str("sourceFile", &source_file);
            self.state.system_roles.definitions.push(o.raw());
        }
    }
}
