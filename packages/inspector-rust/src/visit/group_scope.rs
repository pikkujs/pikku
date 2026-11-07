//! Port of Go `visit/group_scope.go`: add/add-scope.ts. applyDeclaredScopes
//! runs in finalize.

use serde_json::Value;
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::util_shared::{JsObject, literal_key_name};
use super::util_wire_meta::prop_value;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::{Map, Raw, Record};
use crate::tsutil::{self, PropValue, file_name_of};

pub const SCOPE_SEPARATOR: &str = ":";
pub const SCOPE_WILDCARD: &str = "*";

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addScope", phase: Phase::Routes, order: order::ADD_SCOPE, visit: |c, n| c.add_scope(n) });
}

/// `orUndefined` is `value || undefined` for a property value.
pub fn or_undefined(v: &PropValue) -> Option<Value> {
    if !v.truthy() {
        return None;
    }
    prop_value(v)
}

/// `scopesObject` is the object-literal initializer of an identifier-named
/// `scopes` property assignment.
fn scopes_object(obj: P<Node>) -> Option<P<Node>> {
    let p = tsutil::find_property_assignment(obj, "scopes")?;
    p.initializer().filter(|i| ast::is_object_literal_expression(*i))
}

impl Context<'_> {
    fn is_valid_scope_segment(&mut self, segment: &str, scope_name: &str) -> bool {
        if segment.is_empty() {
            self.log.critical(codes::INVALID_VALUE, format!("Scope '{scope_name}' contains an empty segment."));
            false
        } else if segment.contains(SCOPE_SEPARATOR) {
            self.log.critical(codes::INVALID_VALUE, format!("Scope segment '{segment}' in '{scope_name}' contains the '{SCOPE_SEPARATOR}' separator. Nest scopes with the 'scopes' property instead of embedding '{SCOPE_SEPARATOR}' in a name."));
            false
        } else if segment == SCOPE_WILDCARD {
            self.log.critical(codes::INVALID_VALUE, format!("Scope segment '{segment}' in '{scope_name}' is the wildcard. '{SCOPE_WILDCARD}' is reserved for granting a scope and its descendants, and cannot be declared."));
            false
        } else {
            true
        }
    }

    /// `extractScopeNodes` returns `None` when no node was extracted.
    fn extract_scope_nodes(&mut self, obj: P<Node>, scope_name: &str) -> Option<Record<Raw>> {
        let mut nodes: Record<Raw> = Record::new();
        for prop in obj.properties() {
            if !ast::is_property_assignment(*prop) {
                continue;
            }
            let Some(segment) = literal_key_name(prop.name()) else {
                self.log.critical(codes::NON_LITERAL_WIRE_NAME, format!("Scope '{scope_name}' has a nested scope whose key is not a literal."));
                continue;
            };
            if !self.is_valid_scope_segment(&segment, scope_name) {
                continue;
            }
            let init = prop.initializer().unwrap();
            if !ast::is_object_literal_expression(init) {
                self.log.critical(codes::INVALID_VALUE, format!("Nested scope '{segment}' in '{scope_name}' must be an object literal."));
                continue;
            }
            let mut node = JsObject::new();
            node.set("displayName", or_undefined(&tsutil::get_property_value(init, "displayName")));
            node.set("description", or_undefined(&tsutil::get_property_value(init, "description")));
            if let Some(nested) = scopes_object(init) {
                if let Some(n) = self.extract_scope_nodes(nested, scope_name) {
                    node.set("scopes", Some(serde_json::to_value(&n).expect("record serialises")));
                }
            }
            nodes.set(segment, node.raw());
        }
        if nodes.is_empty() { None } else { Some(nodes) }
    }

    fn add_declare_scopes(&mut self, node: P<Node>) {
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let arg = tsutil::unwrap_as(args[0]);
        if !ast::is_array_literal_expression(arg) {
            return;
        }
        let source_file = file_name_of(node).to_string();
        for el in arg.elements() {
            if !ast::is_string_literal_like(*el) {
                self.log.critical(codes::NON_LITERAL_WIRE_NAME, "declareScopes takes string literal scope ids.");
                continue;
            }
            let id = el.text().to_string();
            let mut valid = true;
            for seg in id.split(SCOPE_SEPARATOR) {
                if !self.is_valid_scope_segment(seg, &id) {
                    valid = false;
                    break;
                }
            }
            if !valid {
                continue;
            }
            let declared = self.state.scopes.declared.get_or_insert_with(Map::new);
            if !declared.has(&id) {
                declared.set(id, source_file.clone());
            }
        }
        self.state.scopes.files.add(source_file);
    }

    pub fn add_scope(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) {
            return;
        }
        let expr = node.expression().unwrap();
        if !ast::is_identifier(expr) {
            return;
        }
        match expr.text() {
            "declareScopes" => {
                self.add_declare_scopes(node);
                return;
            }
            "defineScope" => {}
            _ => return,
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
        let origin = if source_file.ends_with(".gen.ts") { r#"{"kind":"generated"}"# } else { r#"{"kind":"app"}"# };
        let origin: Value = serde_json::from_str(origin).unwrap();

        for prop in obj.properties() {
            if !ast::is_property_assignment(*prop) {
                continue;
            }
            let Some(name) = literal_key_name(prop.name()) else {
                self.log.critical(codes::NON_LITERAL_WIRE_NAME, "A scope is declared with a key that is not a literal.");
                continue;
            };
            if !self.is_valid_scope_segment(&name, &name) {
                continue;
            }
            let root = prop.initializer().unwrap();
            if !ast::is_object_literal_expression(root) {
                self.log.critical(codes::INVALID_VALUE, format!("Scope '{name}' must be an object literal."));
                continue;
            }
            let display_name = tsutil::get_property_value(root, "displayName");
            let description = tsutil::get_property_value(root, "description");
            let scopes = scopes_object(root).and_then(|nested| self.extract_scope_nodes(nested, &name));

            self.state.scopes.files.add(source_file.clone());
            let mut o = JsObject::new();
            o.set_str("name", &name);
            o.set("displayName", or_undefined(&display_name));
            o.set("description", or_undefined(&description));
            if let Some(s) = scopes {
                o.set("scopes", Some(serde_json::to_value(&s).expect("record serialises")));
            }
            o.set_str("sourceFile", &source_file);
            o.set("origin", Some(origin.clone()));
            self.state.scopes.definitions.push(o.raw());
        }
    }
}
