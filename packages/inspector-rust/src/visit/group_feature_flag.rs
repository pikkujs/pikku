//! Port of Go `visit/group_feature_flag.go`: add/add-feature-flag.ts.

use serde_json::Value;
use tsrs_ast::{self as ast, Node, Symbol};
use tsrs_core::P;

use super::util_shared::{JsObject, literal_key_name, literal_named_property, strs_value};
use super::util_wire_meta::num_value;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::tsutil::{self, PropValue, file_name_of};

const SCOPE_SEPARATOR: &str = ":";

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addFeatureFlag", phase: Phase::Routes, order: order::ADD_FEATURE_FLAG, visit: |c, n| c.add_feature_flag(n) });
}

/// `orUndefined` is `value || undefined` for a property value.
fn or_undefined(v: &PropValue) -> Option<Value> {
    if !v.truthy() {
        return None;
    }
    if let Some(s) = &v.str {
        return Some(Value::from(s.as_str()));
    }
    if let Some(n) = v.num {
        return Some(num_value(n));
    }
    if let Some(b) = v.bool {
        return Some(Value::from(b));
    }
    v.strs.as_ref().map(|s| strs_value(s))
}

impl Context<'_> {
    /// `stringLiteralList` (group_system_role.go): the string-literal elements of
    /// `arr`, logging `not_literal` for each other element.
    fn flag_string_literal_list(&mut self, arr: P<Node>, not_literal: &str) -> Vec<String> {
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

    /// add-feature-flag.ts fromSymbol.
    fn object_literal_from_symbol(&mut self, sym: Option<P<Symbol>>) -> Option<P<Node>> {
        let sym = self.resolve_alias(sym)?;
        for decl in sym.declarations() {
            if !ast::is_variable_declaration(*decl) {
                continue;
            }
            let Some(init) = decl.initializer() else { continue };
            let init = tsutil::unwrap_as(init);
            if ast::is_object_literal_expression(init) {
                return Some(init);
            }
        }
        None
    }

    /// add-feature-flag.ts resolveObjectLiteral.
    fn resolve_flag_body(&mut self, prop: P<Node>) -> Option<P<Node>> {
        if ast::is_shorthand_property_assignment(prop) {
            let s = self.checker.get_shorthand_assignment_value_symbol(Some(prop));
            return self.object_literal_from_symbol(s);
        }
        let init = tsutil::unwrap_as(prop.initializer().unwrap());
        if ast::is_object_literal_expression(init) {
            return Some(init);
        }
        if !ast::is_identifier(init) {
            return None;
        }
        let s = self.symbol_at(init);
        self.object_literal_from_symbol(s)
    }

    /// `None` when `anyOf` is absent or not an array literal; absent means no
    /// capability constraint.
    fn extract_any_of(&mut self, obj: P<Node>, flag_name: &str) -> Option<Vec<String>> {
        let prop = literal_named_property(obj, "anyOf")?;
        let init = prop.initializer().unwrap();
        if !ast::is_array_literal_expression(init) {
            self.log.critical(codes::INVALID_VALUE, format!("Feature flag '{flag_name}' must declare 'anyOf' as an array literal."));
            return None;
        }
        Some(self.flag_string_literal_list(
            init,
            &format!(
                "Feature flag '{flag_name}' lists a scope that is not a string literal. Scopes are extracted by AST, so a computed value cannot be checked against the declared set."
            ),
        ))
    }

    pub fn add_feature_flag(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !self.calls_imported_definer(node.expression().unwrap(), "defineFeatureFlags") {
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
            let prop = *prop;
            if !ast::is_shorthand_property_assignment(prop) && !ast::is_property_assignment(prop) {
                continue;
            }
            let name = match literal_key_name(prop.name()) {
                None => {
                    self.log.critical(codes::NON_LITERAL_WIRE_NAME, "A feature flag is declared with a key that is not a literal.");
                    continue;
                }
                Some(n) if n.is_empty() => {
                    self.log.critical(codes::INVALID_VALUE, "A feature flag is declared with an empty name.");
                    continue;
                }
                Some(n) if n.contains(SCOPE_SEPARATOR) => {
                    self.log.critical(
                        codes::INVALID_VALUE,
                        format!(
                            "Feature flag '{n}' contains the '{SCOPE_SEPARATOR}' separator. '{SCOPE_SEPARATOR}' delimits scope ids; a flag named like a scope reads as one."
                        ),
                    );
                    continue;
                }
                Some(n) => n,
            };
            let Some(body) = self.resolve_flag_body(prop) else {
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "Feature flag '{name}' must be an object literal, or a variable holding one. 'anyOf' is extracted by AST, so a value this file cannot see would declare the flag with no capability constraint."
                    ),
                );
                continue;
            };
            let any_of = self.extract_any_of(body, &name);
            if let Some(a) = &any_of {
                if a.is_empty() {
                    self.log.critical(
                        codes::INVALID_VALUE,
                        format!(
                            "Feature flag '{name}' declares 'anyOf: []'. An empty list satisfies nobody: omit 'anyOf' for a pure switch, or name the scopes that reveal it."
                        ),
                    );
                    continue;
                }
            }
            let description = tsutil::get_property_value(body, "description");

            self.state.feature_flags.files.add(source_file.clone());
            let mut o = JsObject::new();
            o.set_str("name", &name);
            o.set("description", or_undefined(&description));
            if let Some(a) = any_of {
                o.set("anyOf", Some(strs_value(&a)));
            }
            o.set_str("sourceFile", &source_file);
            self.state.feature_flags.definitions.push(o.raw());
        }
    }
}
