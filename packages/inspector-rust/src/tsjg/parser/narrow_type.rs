//! Port of Go `tsjg/parser/narrow_type.go` (src/Utils/narrowType.ts).

use std::rc::Rc;

use crate::tsjg::types::{self, Ty, TypeKind};

/// Narrows `t` by passing all variants to `predicate`. When `t` is a union (or
/// enum) type the predicate is called for each variant and only the variants
/// for which it returns true remain. Unions with one sub type left are
/// replaced by it; empty unions become Never. When nothing changed the original
/// type is returned (definition types are kept).
pub fn narrow_type(t: &Ty, predicate: &mut dyn FnMut(&Ty) -> bool) -> Ty {
    let derefed = types::deref_type(t);
    let member_types: Vec<Ty> = match &*derefed {
        TypeKind::Union(d) => d.types().to_vec(),
        TypeKind::Enum(d) => d.types.clone(),
        _ => {
            if predicate(&derefed) {
                return t.clone();
            }
            return types::new(TypeKind::Never);
        }
    };
    let mut changed = false;
    let mut kept: Vec<Ty> = Vec::new();
    for sub in &member_types {
        let derefed_sub = types::deref_type(sub);
        // Recursively narrow down all types within the union.
        let narrowed = narrow_type(&derefed_sub, predicate);
        if !types::is_never_like(&narrowed) {
            if Rc::ptr_eq(&narrowed, &derefed_sub) {
                kept.push(sub.clone());
            } else {
                kept.push(narrowed);
                changed = true;
            }
        } else {
            changed = true;
        }
    }
    // When union types were changed then return a new narrowed-down type,
    // otherwise return the original one to keep definitions.
    if changed {
        return match kept.len() {
            0 => types::new(TypeKind::Never),
            1 => kept.remove(0),
            _ => types::new_union_type(&kept),
        };
    }
    t.clone()
}
