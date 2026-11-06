//! Port of Go `tsjg/formatter/literal_union_type_formatter.go`.

use std::collections::HashSet;
use std::rc::Rc;

use serde_json::Value;

use super::TypeFormatter;
use super::type_name::{to_enum_type, type_name};
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{self, Ty, TypeKind, stable_stringify};

pub struct LiteralUnionTypeFormatter;

impl LiteralUnionTypeFormatter {
    pub fn new() -> Rc<LiteralUnionTypeFormatter> {
        Rc::new(LiteralUnionTypeFormatter)
    }
}

impl TypeFormatter for LiteralUnionTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Union(u) if !u.types().is_empty() && types::is_literal_union(u))
    }

    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Union(union_type) = &**t else { unreachable!() };

        let mut has_string = false;
        let mut preserve_literals = false;
        let mut all_strings = true;
        let mut has_null = false;

        let literals = union_type.flattened_types(None);

        // Filter out string types since we need to be more careful about them.
        let mut filtered: Vec<Ty> = Vec::with_capacity(literals.len());
        for literal in literals {
            match &*literal {
                TypeKind::String { preserve_literals: p } => {
                    has_string = true;
                    preserve_literals = preserve_literals || *p;
                    continue;
                }
                TypeKind::Null => has_null = true,
                TypeKind::Literal(l) => {
                    if !l.is_string() {
                        all_strings = false;
                    }
                }
                _ => {}
            }
            filtered.push(literal);
        }

        if all_strings && has_string && !preserve_literals {
            if has_null {
                return def(Definition {
                    type_: Some(Value::Array(vec![Value::String("string".into()), Value::String("null".into())])),
                    ..Definition::default()
                });
            }
            return def(Definition::with_type("string"));
        }

        let mut type_values: Vec<Value> = Vec::new();
        let mut seen_values: HashSet<String> = HashSet::new();
        let mut type_names: Vec<String> = Vec::new();
        let mut seen_names: HashSet<String> = HashSet::new();

        let mut append_name = |name: String, names: &mut Vec<String>| {
            if seen_names.insert(name.clone()) {
                names.push(name);
            }
        };
        let mut append_value = |value: Value, values: &mut Vec<Value>| {
            if seen_values.insert(stable_stringify(&value)) {
                values.push(value);
            }
        };

        for item in &filtered {
            match &**item {
                TypeKind::Enum(member) => {
                    for value in &member.values {
                        append_name(type_name(value), &mut type_names);
                        append_value(value.clone(), &mut type_values);
                    }
                }
                TypeKind::Literal(member) => {
                    append_name(type_name(&member.value), &mut type_names);
                    append_value(member.value.clone(), &mut type_values);
                }
                _ => {
                    append_name("null".into(), &mut type_names);
                    append_value(Value::Null, &mut type_values);
                }
            }
        }

        let definition = if type_names.len() == 1 && type_values.len() == 1 {
            def(Definition { type_: Some(to_enum_type(&type_names)), const_: Some(type_values[0].clone()), ..Definition::default() })
        } else {
            def(Definition { type_: Some(to_enum_type(&type_names)), enum_: Some(type_values), ..Definition::default() })
        };

        if has_string {
            return def(Definition { any_of: Some(vec![def(Definition::with_type("string")), definition]), ..Definition::default() });
        }
        definition
    }

    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
