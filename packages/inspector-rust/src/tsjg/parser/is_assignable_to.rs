//! Port of Go `tsjg/parser/is_assignable_to.go` (src/Utils/isAssignableTo.ts):
//! a structural assignability checker over the intermediate type model.

use std::collections::{HashMap, HashSet};

use crate::tsjg::fail;
use crate::tsjg::types::{self, AdditionalProperties, IntersectionType, ObjectProperty, Ty, TypeKind, ty_key};

/// Types inferred for `infer X` placeholders while checking assignability.
/// Mirrors the insertion-order semantics of the JavaScript Map used upstream:
/// setting an existing key keeps its original position.
#[derive(Default)]
pub struct InferMap {
    keys: Vec<String>,
    values: HashMap<String, Ty>,
}

impl InferMap {
    pub fn new() -> InferMap {
        InferMap::default()
    }
    pub fn get(&self, key: &str) -> Option<Ty> {
        self.values.get(key).cloned()
    }
    pub fn set(&mut self, key: &str, t: Ty) {
        if !self.values.contains_key(key) {
            self.keys.push(key.to_string());
        }
        self.values.insert(key.to_string(), t);
    }
    /// The keys in insertion order.
    pub fn keys(&self) -> &[String] {
        &self.keys
    }
}

/// The combined types from the given intersection. Currently only object
/// types are combined.
fn combine_intersecting_types(intersection: &IntersectionType, intersection_id: &str) -> Vec<Ty> {
    let mut object_types: Vec<Ty> = Vec::new();
    let mut combined: Vec<Ty> = Vec::new();
    for t in intersection.types() {
        if matches!(&**t, TypeKind::Object(_)) {
            object_types.push(t.clone());
        } else {
            combined.push(t.clone());
        }
    }
    if object_types.len() == 1 {
        combined.push(object_types.remove(0));
    } else if object_types.len() > 1 {
        combined.push(types::new_object_type(
            format!("combined-objects-{intersection_id}"),
            object_types,
            Vec::new(),
            Some(AdditionalProperties::Bool(false)),
            false,
        ));
    }
    combined
}

/// A property of an object type, as (name, type, required); property lists are
/// built from several types so they are copied out.
#[derive(Clone)]
struct Prop {
    name: String,
    ty: Ty,
    required: bool,
}

fn prop_of(p: &ObjectProperty) -> Prop {
    Prop { name: p.name(), ty: p.ty.clone(), required: p.required }
}

/// All object properties of the given type and all its base types. Empty if
/// the type is not an object type.
fn get_object_properties(t: &Ty) -> Vec<Prop> {
    let t = types::deref_type(t);
    let mut properties = Vec::new();
    if let TypeKind::Object(obj) = &*t {
        properties.extend(obj.properties.iter().map(prop_of));
        for base in &obj.base_types {
            properties.extend(get_object_properties(base));
        }
    }
    properties
}

/// Indexes members by name. Like Array#find upstream, the first member with a
/// given name wins.
fn members_by_name(members: &[Prop]) -> HashMap<String, &Prop> {
    let mut by_name = HashMap::new();
    for m in members {
        by_name.entry(m.name.clone()).or_insert(m);
    }
    by_name
}

fn get_primitive_type(value: &serde_json::Value) -> Option<Ty> {
    match value {
        serde_json::Value::String(_) => Some(types::new(TypeKind::String { preserve_literals: false })),
        serde_json::Value::Number(_) => Some(types::new(TypeKind::Number)),
        serde_json::Value::Bool(_) => Some(types::new(TypeKind::Boolean)),
        _ => None,
    }
}

/// Whether `source` is assignable to `target`. `infer_map` may be None; when
/// given it is populated with types inferred for Infer placeholders in the target.
pub fn is_assignable_to(target: &Ty, source: &Ty, infer_map: Option<&mut InferMap>) -> bool {
    let mut local = InferMap::new();
    let infer_map = infer_map.unwrap_or(&mut local);
    assignable(target, source, infer_map, &HashSet::new())
}

fn assignable(target: &Ty, source: &Ty, infer_map: &mut InferMap, inside_types: &HashSet<usize>) -> bool {
    // Dereference source and target.
    let source = &types::deref_type(source);
    let target = &types::deref_type(target);

    // Type "never" can be assigned to anything. (HiddenType subclasses
    // NeverType upstream, so it matches too.)
    if types::is_never_like(source) {
        return true;
    }
    // Nothing can be assigned to "never".
    if types::is_never_like(target) {
        return false;
    }

    // Infer type can become anything.
    if let TypeKind::Infer(infer_target) = &**target {
        let key = infer_target.id.as_str();
        match infer_map.get(key) {
            None => infer_map.set(key, source.clone()),
            Some(infer) => infer_map.set(key, types::new_union_type(&[infer, source.clone()])),
        }
        return true;
    }

    // Function types: compare parameters and return types, supporting infer in
    // both positions (e.g. Parameters<T> uses (...args: infer P) => any,
    // ReturnType<T> uses (...args: any) => infer R).
    if let TypeKind::Function(target_func) = &**target {
        let TypeKind::Function(source_func) = &**source else { return false };
        let target_args = &target_func.named_arguments;
        let source_args = &source_func.named_arguments;

        if matches!(target_args.as_deref(), Some(TypeKind::Infer(_))) {
            // Populates inferMap with the inferred parameter type.
            let src = source_args.clone().unwrap_or_else(|| types::new(TypeKind::Never));
            assignable(target_args.as_ref().unwrap(), &src, infer_map, inside_types);
        } else {
            let target_props = match target_args {
                Some(a) => get_object_properties(a),
                None => Vec::new(),
            };
            // All-any params (e.g. (...args: any)) match any function signature.
            let target_params_accept_any = target_props.iter().all(|p| matches!(&*types::deref_type(&p.ty), TypeKind::Any));
            if !target_params_accept_any {
                let src = source_args.clone().unwrap_or_else(|| types::new(TypeKind::Never));
                if !assignable(target_args.as_ref().unwrap(), &src, infer_map, inside_types) {
                    return false;
                }
            }
        }

        if let (Some(t), Some(s)) = (&target_func.return_type, &source_func.return_type) {
            return assignable(t, s, infer_map, inside_types);
        }
        return true;
    }

    // Check for simple type equality.
    if source.id() == target.id() {
        return true;
    }

    // Don't check types when already inside them. This solves circular
    // dependencies.
    if inside_types.contains(&ty_key(source)) || inside_types.contains(&ty_key(target)) {
        return true;
    }

    // Assigning from or to any-type is always possible.
    if matches!(&**source, TypeKind::Any) {
        return true;
    }
    if matches!(&**target, TypeKind::Any) {
        return true;
    }
    // Assigning to unknown type is always possible.
    if matches!(&**target, TypeKind::Unknown { .. }) {
        return true;
    }

    // 'null' or 'undefined' can be assigned to void.
    if matches!(&**target, TypeKind::Void) {
        return matches!(&**source, TypeKind::Null | TypeKind::Undefined);
    }

    // Union and enum type is assignable to target when all types in the
    // union/enum are assignable to it.
    if let TypeKind::Union(u) = &**source {
        for t in u.types() {
            if !assignable(target, t, infer_map, inside_types) {
                return false;
            }
        }
        return true;
    }
    if let TypeKind::Enum(e) = &**source {
        for t in &e.types {
            if !assignable(target, t, infer_map, inside_types) {
                return false;
            }
        }
        return true;
    }

    // When source is an intersection type then it can be assigned to target if
    // any of the sub types matches. Object types within the intersection must
    // be combined first.
    if let TypeKind::Intersection(i) = &**source {
        for t in combine_intersecting_types(i, &source.id()) {
            if assignable(target, &t, infer_map, inside_types) {
                return true;
            }
        }
        return false;
    }

    // For arrays check if item types are assignable.
    if let TypeKind::Array(target_array) = &**target {
        let target_item = &target_array.item;
        return match &**source {
            TypeKind::Array(s) => assignable(target_item, &s.item, infer_map, inside_types),
            TypeKind::Tuple(s) => assignable(target_item, &types::new_union_type(s.types()), infer_map, inside_types),
            _ => false,
        };
    }

    // When target is a union or enum type then check if source type can be
    // assigned to any variant.
    if let TypeKind::Union(u) = &**target {
        for t in u.types() {
            if assignable(t, source, infer_map, inside_types) {
                return true;
            }
        }
        return false;
    }
    if let TypeKind::Enum(e) = &**target {
        for t in &e.types {
            if assignable(t, source, infer_map, inside_types) {
                return true;
            }
        }
        return false;
    }

    // When target is an intersection type then source can be assigned to it if
    // it matches all sub types. Object types within the intersection must be
    // combined first.
    if let TypeKind::Intersection(i) = &**target {
        for t in combine_intersecting_types(i, &target.id()) {
            if !assignable(&t, source, infer_map, inside_types) {
                return false;
            }
        }
        return true;
    }

    // Check literal types.
    if let TypeKind::Literal(l) = &**source {
        // Note: the upstream implementation resets insideTypes here.
        let Some(prim) = get_primitive_type(&l.value) else { fail("nil pointer dereference") };
        return assignable(target, &prim, infer_map, &HashSet::new());
    }

    if let TypeKind::Object(target_object) = &**target {
        // Primitives are not assignable to `object`.
        if target_object.non_primitive && matches!(&**source, TypeKind::Number | TypeKind::String { .. } | TypeKind::Boolean) {
            return false;
        }
        let target_members = get_object_properties(target);
        if target_members.is_empty() {
            // When target object is empty then anything except null and
            // undefined can be assigned to it.
            let nullish = types::new_union_type(&[types::new(TypeKind::Undefined), types::new(TypeKind::Null)]);
            return !assignable(&nullish, source, infer_map, inside_types);
        } else if matches!(&**source, TypeKind::Object(_)) {
            let source_members = get_object_properties(source);
            let source_by_name = members_by_name(&source_members);
            let target_by_name = members_by_name(&target_members);

            // Check if target has properties in common with source.
            let in_common = target_members.iter().any(|m| source_by_name.contains_key(&m.name));

            // Make sure that every required property in target type is present.
            for target_member in &target_members {
                if !source_by_name.contains_key(&target_member.name) && !(in_common && !target_member.required) {
                    return false;
                }
            }

            let mut inside = inside_types.clone();
            inside.insert(ty_key(source));
            inside.insert(ty_key(target));
            for source_member in &source_members {
                let Some(target_member) = target_by_name.get(&source_member.name) else { continue };
                if !assignable(&target_member.ty, &source_member.ty, infer_map, &inside) {
                    return false;
                }
            }
            return true;
        }
        let source_is_array = matches!(&**source, TypeKind::Array(_));
        let source_tuple = match &**source {
            TypeKind::Tuple(t) => Some(t),
            _ => None,
        };
        if source_is_array || source_tuple.is_some() {
            let length_prop_type = target_members.iter().find(|p| p.name == "length" && p.required).map(|p| p.ty.clone());
            if source_is_array {
                return matches!(length_prop_type.as_deref(), Some(TypeKind::Number));
            }
            if let Some(TypeKind::Literal(l)) = length_prop_type.as_deref() {
                return match l.value.as_f64() {
                    Some(v) => source_tuple.unwrap().types().len() as f64 == v,
                    None => false,
                };
            }
        }
    }

    // Check if tuple types are compatible.
    if let (TypeKind::Tuple(target_tuple), TypeKind::Tuple(source_tuple)) = (&**target, &**source) {
        let source_members = source_tuple.types();
        let target_members = target_tuple.types();
        let num_target = target_members.len();
        let num_source = source_members.len();

        // TODO(upstream): the final element of the target tuple may be a rest
        // type. However, since TypeScript 4.0, a tuple may contain multiple
        // rest types at arbitrary locations.
        for (i, target_member) in target_members.iter().enumerate() {
            if i == num_target - 1 && num_target <= num_source + 1 {
                if let TypeKind::Rest(rest) = &**target_member {
                    let remaining: Vec<Ty> = (i..num_source).map(|j| source_members[j].clone()).collect();
                    if !assignable(&rest.ty, &types::new_tuple_type(&remaining), infer_map, inside_types) {
                        return false;
                    }
                    continue;
                } else if num_target < num_source {
                    // The type cannot be assigned if more than one source
                    // member is remaining and the final target type is not a
                    // rest type.
                    return false;
                }
            }

            let source_member = source_members.get(i);
            if let TypeKind::Optional(optional) = &**target_member {
                if let Some(sm) = source_member {
                    if !assignable(target_member, sm, infer_map, inside_types) && !assignable(&optional.ty, sm, infer_map, inside_types) {
                        return false;
                    }
                }
                continue;
            }

            let Some(sm) = source_member else { return false };
            if !assignable(target_member, sm, infer_map, inside_types) {
                return false;
            }
        }
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tsjg::types::{LiteralType, new, new_object_type};
    use serde_json::Value;

    fn lit(v: Value) -> Ty {
        new(TypeKind::Literal(LiteralType { value: v }))
    }
    fn string() -> Ty {
        new(TypeKind::String { preserve_literals: false })
    }

    #[test]
    fn literal_assignable_to_its_primitive() {
        assert!(is_assignable_to(&string(), &lit(Value::from("a")), None));
        assert!(!is_assignable_to(&new(TypeKind::Number), &lit(Value::from("a")), None));
    }

    #[test]
    fn infer_collects_union() {
        let infer = new(TypeKind::Infer(types::InferType { id: "T".into() }));
        let mut m = InferMap::new();
        assert!(is_assignable_to(&infer, &string(), Some(&mut m)));
        assert!(is_assignable_to(&infer, &new(TypeKind::Number), Some(&mut m)));
        assert_eq!(m.get("T").unwrap().id(), "(string|number)");
    }

    #[test]
    fn empty_object_accepts_everything_but_nullish() {
        let empty = new_object_type("o".into(), vec![], vec![], Some(AdditionalProperties::Bool(false)), false);
        assert!(is_assignable_to(&empty, &string(), None));
        assert!(!is_assignable_to(&empty, &new(TypeKind::Null), None));
    }

    #[test]
    fn required_property_missing() {
        let t = new_object_type("t".into(), vec![], vec![ObjectProperty::new("a".into(), string(), true)], None, false);
        let s = new_object_type("s".into(), vec![], vec![ObjectProperty::new("b".into(), string(), true)], None, false);
        assert!(!is_assignable_to(&t, &s, None));
        assert!(is_assignable_to(&t, &t, None));
    }
}
