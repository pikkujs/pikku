//! Port of Go `tsjg/formatter/all_of_definition.go`.

use std::rc::Rc;

use serde_json::Value;

use super::{TypeFormatter, unique, unique_defs};
use crate::tsjg::schema::{Additional, Def, Definition, Properties, def};
use crate::tsjg::types::{self, Ty, stable_stringify};

/// Folds a base type's definition into the given definition, combining
/// objects instead of using allOf because allOf does not work well with
/// additional properties (src/Utils/allOfDefinition.ts). Go's
/// `getAllOfDefinitionReducer(child)(definition, baseType)`.
pub fn reduce_all_of(child_type_formatter: &Rc<dyn TypeFormatter>, definition: Def, base_type: &Ty) -> Def {
    let other = child_type_formatter.get_definition(&types::deref_type(base_type));
    // Snapshot `other` so a definition aliased to `definition` cannot double-borrow.
    let other_b = other.borrow().clone();

    {
        let mut d = definition.borrow_mut();
        if d.properties.is_none() {
            append_key(&mut d.appended, "properties");
        }
        let merged = deep_merge_properties(other_b.properties.as_ref(), d.properties.as_ref());
        d.properties = Some(merged);

        if is_props_definition(&d.additional_properties) && is_props_definition(&other_b.additional_properties) {
            // Additional properties is false only if all children also set
            // additional properties to false. Collect additional properties
            // and merge into a single definition.
            let mut additional_props: Vec<Def> = Vec::new();
            let mut additional_types: Vec<String> = Vec::new();

            let mut add = |add_props: &Option<Additional>| {
                let Some(Additional::Def(dd)) = add_props else {
                    // false (or nil) is falsy in the TypeScript source.
                    return;
                };
                let b = dd.borrow();
                if let Some(any_of) = &b.any_of {
                    for prop in any_of {
                        let pb = prop.borrow();
                        if pb.type_.is_some() {
                            additional_types.extend(cast_type_array(pb.type_.as_ref().unwrap()));
                        } else {
                            additional_props.push(prop.clone());
                        }
                    }
                } else if b.type_.is_some() {
                    additional_types.extend(cast_type_array(b.type_.as_ref().unwrap()));
                } else {
                    additional_props.push(dd.clone());
                }
            };
            add(&d.additional_properties);
            add(&other_b.additional_properties);

            let additional_types = unique(&additional_types);
            let mut additional_props = unique_defs(additional_props);

            if additional_types.len() > 1 {
                let arr = Value::Array(additional_types.iter().cloned().map(Value::String).collect());
                additional_props.push(def(Definition { type_: Some(arr), ..Definition::default() }));
            } else if additional_types.len() == 1 {
                additional_props.push(def(Definition::with_type(&additional_types[0])));
            }

            if additional_props.len() > 1 {
                d.additional_properties = Some(Additional::Def(def(Definition { any_of: Some(additional_props), ..Definition::default() })));
            } else if additional_props.len() == 1 {
                if additional_props[0].borrow().is_empty() {
                    d.additional_properties = None;
                } else {
                    d.additional_properties = Some(Additional::Def(additional_props[0].clone()));
                }
            } else {
                d.additional_properties = Some(Additional::Bool(false));
            }
        }

        if !other_b.required.is_empty() {
            if d.required.is_empty() {
                append_key(&mut d.appended, "required");
            }
            let mut all = d.required.clone();
            all.extend(other_b.required.iter().cloned());
            let mut required = unique(&all);
            required.sort();
            d.required = required;
        }

        if !matches!(other_b.additional_properties, Some(Additional::Bool(false)))
            && matches!(d.additional_properties, Some(Additional::Bool(false)))
        {
            d.additional_properties = None;
        }
    }
    definition
}

/// Merges two property maps, with `b` taking precedence, and intersects
/// enums/consts of common properties that share the same type
/// (src/Utils/deepMerge.ts).
fn deep_merge_properties(a: Option<&Properties>, b: Option<&Properties>) -> Properties {
    let mut out = match a {
        Some(a) => a.clone(),
        None => Properties::new(),
    };
    if let Some(b) = b {
        for (k, v) in b.iter() {
            out.set(k.clone(), v.clone());
        }
    }
    let (Some(a), Some(b)) = (a, b) else { return out };
    for (k, av) in a.iter() {
        let Some(bv) = b.get(k) else { continue };
        let (avb, bvb) = (av.borrow(), bv.borrow());
        let (Some(at), Some(bt)) = (&avb.type_, &bvb.type_) else { continue };
        if !raw_type_equal(at, bt) {
            continue;
        }
        let Some(enums) = merge_consts_and_enums(&avb, &bvb) else { continue };
        let mut merged = bvb.clone();
        if enums.len() == 1 {
            merged.const_ = Some(enums[0].clone());
            merged.enum_ = None;
        } else {
            merged.enum_ = Some(enums);
            merged.const_ = None;
        }
        out.set(k.clone(), def(merged));
    }
    out
}

/// Treats const as an enum with a single element and intersects when both
/// sides constrain values (src/Utils/deepMerge.ts).
fn merge_consts_and_enums(a: &Definition, b: &Definition) -> Option<Vec<Value>> {
    let enum_a = if let Some(c) = &a.const_ { Some(vec![c.clone()]) } else { a.enum_.clone() };
    let enum_b = if let Some(c) = &b.const_ { Some(vec![c.clone()]) } else { b.enum_.clone() };
    match (enum_a, enum_b) {
        (None, Some(eb)) => Some(eb),
        (Some(ea), None) => Some(ea),
        (Some(ea), Some(eb)) => Some(intersection_of_arrays(&ea, &eb)),
        (None, None) => None,
    }
}

/// Keeps the values of `b` that also occur in `a`, comparing by stable
/// stringification (src/Utils/intersectionOfArrays.ts).
fn intersection_of_arrays(a: &[Value], b: &[Value]) -> Vec<Value> {
    let in_a: std::collections::HashSet<String> = a.iter().map(stable_stringify).collect();
    b.iter().filter(|v| in_a.contains(&stable_stringify(v))).cloned().collect()
}

/// Mirrors the loose `elementA.type == elementB.type` comparison: equal
/// strings compare equal; distinct array instances do not.
fn raw_type_equal(a: &Value, b: &Value) -> bool {
    matches!((a, b), (Value::String(x), Value::String(y)) if x == y)
}

/// Normalizes a definition's type (string or slice of strings) into a slice.
fn cast_type_array(t: &Value) -> Vec<String> {
    match t {
        Value::String(s) => vec![s.clone()],
        Value::Array(a) => a.iter().filter_map(|e| e.as_str().map(String::from)).collect(),
        _ => Vec::new(),
    }
}

/// Mirrors additionalPropsDefinition in the TypeScript source: anything that
/// is neither undefined nor true (false or a definition).
fn is_props_definition(props: &Option<Additional>) -> bool {
    !matches!(props, None | Some(Additional::Bool(true)))
}

/// Records `key` as added after creation, unless it already was.
fn append_key(keys: &mut Vec<String>, key: &str) {
    if !keys.iter().any(|k| k == key) {
        keys.push(key.to_string());
    }
}
