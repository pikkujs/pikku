//! Port of Go `tsjg/formatter/annotated_type_formatter.go`.
//!
//! Deliberate difference: Go deletes `discriminator` from the (shared)
//! annotations map after assigning it to the union; here annotations are
//! immutable, so the key is skipped when applied instead. The type's ID (which
//! hashes the annotations) therefore keeps its pre-deletion value.

use std::rc::Rc;

use serde_json::Value;

use super::make_nullable::make_nullable;
use super::TypeFormatter;
use crate::tsjg::fail;
use crate::tsjg::schema::{Additional, Def, Definition, def};
use crate::tsjg::types::{self, Ty, TypeKind};

pub struct AnnotatedTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
}

impl AnnotatedTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>) -> Rc<AnnotatedTypeFormatter> {
        Rc::new(AnnotatedTypeFormatter { child_type_formatter })
    }
}

impl TypeFormatter for AnnotatedTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Annotated(_))
    }

    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Annotated(annotated) = &**t else { unreachable!() };
        let annotations = &annotated.annotations;
        let mut skip_discriminator = false;

        if let Some(discriminator) = annotations.get("discriminator") {
            let deref = types::deref_type(&annotated.ty);
            if let TypeKind::Union(u) = &*deref {
                *u.discriminator.borrow_mut() = discriminator.as_str().unwrap_or("").to_string();
                skip_discriminator = true;
            } else {
                fail(&format!(
                    "cannot assign discriminator tag to type: {}. This tag can only be assigned to union types",
                    deref.name()
                ));
            }
        }

        // def = {...childDefinition, ...annotations}: clone the child definition,
        // then let annotation keys override.
        let child = self.child_type_formatter.get_definition(&annotated.ty);
        let cloned = child.borrow().clone();
        let mut d = cloned;
        for (key, value) in annotations {
            if skip_discriminator && key == "discriminator" {
                continue;
            }
            apply_annotation(&mut d, key, value);
        }

        if !d.ref_.is_empty() && d.type_.is_some() {
            d.ref_ = String::new();
        }

        let d = def(d);
        if annotated.nullable {
            return make_nullable(&d);
        }
        d
    }

    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        let TypeKind::Annotated(a) = &**t else { unreachable!() };
        self.child_type_formatter.get_children(&a.ty)
    }
}

/// Merges one annotation keyword into the definition. In the TypeScript
/// implementation this is a plain object spread; here known JSON Schema
/// keywords land on the corresponding struct fields (clearing them and
/// falling back to Extra when the raw annotation value cannot be represented
/// in the typed field), and everything else goes into Extra.
///
/// `items`, `additionalItems` and `additionalProperties` accept only the shapes
/// the typed fields can hold (booleans for the latter two); any other raw value
/// goes to Extra (Go stores the raw `any`). No annotation reader produces them.
fn apply_annotation(d: &mut Definition, key: &str, value: &Value) {
    let string_field: Option<&mut String> = match key {
        "$id" => Some(&mut d.id),
        "$schema" => Some(&mut d.schema),
        "$ref" => Some(&mut d.ref_),
        "$comment" => Some(&mut d.comment),
        "title" => Some(&mut d.title),
        "format" => Some(&mut d.format),
        _ => None,
    };
    if let Some(field) = string_field {
        let s = value.as_str();
        *field = s.unwrap_or("").to_string();
        if s.is_none() {
            d.set_extra(key, value.clone());
        }
        return;
    }

    match key {
        "type" => d.type_ = Some(value.clone()),
        "enum" => {
            if let Value::Array(list) = value {
                d.enum_ = Some(list.clone());
            } else {
                d.enum_ = None;
                d.set_extra(key, value.clone());
            }
        }
        "const" => d.const_ = Some(value.clone()),
        "items" => {
            d.items = None;
            d.set_extra(key, value.clone());
        }
        "additionalItems" | "additionalProperties" => {
            let slot = if key == "additionalItems" { &mut d.additional_items } else { &mut d.additional_properties };
            match value {
                Value::Bool(b) => *slot = Some(Additional::Bool(*b)),
                _ => {
                    *slot = None;
                    d.set_extra(key, value.clone());
                }
            }
        }
        "minItems" => d.min_items = int_or_raw(d, key, value),
        "maxItems" => d.max_items = int_or_raw(d, key, value),
        "required" => match to_string_slice(value) {
            Some(list) => d.required = list,
            None => {
                d.required = Vec::new();
                d.set_extra(key, value.clone());
            }
        },
        "not" | "allOf" | "anyOf" | "oneOf" | "if" | "then" | "else" | "properties" | "patternProperties" | "propertyNames"
        | "discriminator" => {
            clear_field(d, key);
            d.set_extra(key, value.clone());
        }
        _ => d.set_extra(key, value.clone()),
    }
}

/// `value` as an int for a typed field, or the raw value in Extra and None
/// when it is not a number.
fn int_or_raw(d: &mut Definition, key: &str, value: &Value) -> Option<i64> {
    if let Some(n) = value.as_f64() {
        return Some(n as i64);
    }
    d.set_extra(key, value.clone());
    None
}

/// Resets the typed field of a structural keyword so that a raw annotation
/// stored in Extra is not emitted twice.
fn clear_field(d: &mut Definition, key: &str) {
    match key {
        "not" => d.not = None,
        "allOf" => d.all_of = None,
        "anyOf" => d.any_of = None,
        "oneOf" => d.one_of = None,
        "if" => d.if_ = None,
        "then" => d.then = None,
        "else" => d.else_ = None,
        "properties" => d.properties = None,
        "patternProperties" => d.pattern_properties = None,
        "propertyNames" => d.property_names = None,
        "discriminator" => d.discriminator = None,
        _ => {}
    }
}

fn to_string_slice(value: &Value) -> Option<Vec<String>> {
    let Value::Array(list) = value else { return None };
    list.iter().map(|v| v.as_str().map(String::from)).collect()
}
