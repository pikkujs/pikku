//! Port of Go `tsjg/formatter/tuple_type_formatter.go`.

use std::rc::Rc;

use super::{TypeFormatter, unique_types};
use crate::tsjg::schema::{Additional, Def, Definition, Items, def};
use crate::tsjg::types::{self, RestType, Ty, TypeKind};

pub struct TupleTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
}

impl TupleTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>) -> Rc<TupleTypeFormatter> {
        Rc::new(TupleTypeFormatter { child_type_formatter })
    }

    /// The items of a rest element (getRestAdditionalItems in
    /// src/TypeFormatter/TupleTypeFormatter.ts).
    fn get_rest_additional_items(&self, rest_type: &Ty, rest: &RestType) -> Option<Items> {
        let items = self.child_type_formatter.get_definition(rest_type).borrow().items.clone();
        if items.is_some() {
            return items;
        }
        let resolved = types::deref_type(&rest.ty);
        if !matches!(&*resolved, TypeKind::Array(_)) {
            return None;
        }
        let items = self.child_type_formatter.get_definition(&resolved).borrow().items.clone();
        items
    }
}

impl TypeFormatter for TupleTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Tuple(_))
    }

    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Tuple(tuple_type) = &**t else { unreachable!() };

        let sub_types: Vec<&Ty> = tuple_type.types().iter().filter(|m| types::not_never(m)).collect();

        let mut required_elements: Vec<Ty> = Vec::new();
        let mut optional_elements: Vec<Ty> = Vec::new();
        let mut rest_type: Option<Ty> = None;
        for member in sub_types {
            match &**member {
                TypeKind::Optional(_) => optional_elements.push(member.clone()),
                TypeKind::Rest(_) => {
                    // NOTE: A maximum of one rest type is assumed.
                    if rest_type.is_none() {
                        rest_type = Some(member.clone());
                    }
                }
                _ => required_elements.push(member.clone()),
            }
        }
        let opt_inner = |o: &Ty| match &**o {
            TypeKind::Optional(x) => x.ty.clone(),
            _ => unreachable!(),
        };

        let first_item_type: Option<Ty> = if !required_elements.is_empty() {
            Some(required_elements[0].clone())
        } else if !optional_elements.is_empty() {
            Some(opt_inner(&optional_elements[0]))
        } else {
            None
        };

        // Check whether the tuple is of any of the following forms:
        //   [A, A, A]
        //   [A, A, A?]
        //   [A?, A?]
        //   [A, A, A, ...A[]]
        let mut is_uniform_array = first_item_type.is_some();
        if let Some(first) = &first_item_type {
            if required_elements.iter().any(|i| i.id() != first.id()) {
                is_uniform_array = false;
            }
            if is_uniform_array && optional_elements.iter().any(|i| opt_inner(i).id() != first.id()) {
                is_uniform_array = false;
            }
            if is_uniform_array {
                if let Some(r) = &rest_type {
                    let TypeKind::Rest(rr) = &**r else { unreachable!() };
                    is_uniform_array = uniform_rest_type(rr, first);
                }
            }
        }

        // If so, generate a simple array with minItems (and possibly maxItems) instead.
        if is_uniform_array {
            let first = first_item_type.unwrap();
            let mut definition = Definition {
                items: Some(Items::One(self.child_type_formatter.get_definition(&first))),
                min_items: Some(required_elements.len() as i64),
                ..Definition::with_type("array")
            };
            if rest_type.is_none() {
                definition.max_items = Some((required_elements.len() + optional_elements.len()) as i64);
            }
            return def(definition);
        }

        let required_definitions: Vec<Def> = required_elements.iter().map(|i| self.child_type_formatter.get_definition(i)).collect();
        let optional_definitions: Vec<Def> = optional_elements.iter().map(|i| self.child_type_formatter.get_definition(i)).collect();
        let items_total = required_definitions.len() + optional_definitions.len();

        let additional_items: Option<Items> = match &rest_type {
            Some(r) => {
                let TypeKind::Rest(rr) = &**r else { unreachable!() };
                self.get_rest_additional_items(r, rr)
            }
            None => None,
        };

        let mut definition = Definition { min_items: Some(required_definitions.len() as i64), ..Definition::with_type("array") };
        if items_total > 0 {
            let mut all = required_definitions;
            all.extend(optional_definitions);
            definition.items = Some(Items::Many(all)); // with items
        } else if let Some(ai) = &additional_items {
            definition.items = Some(ai.clone()); // with only rest param
        } else {
            definition.max_items = Some(0); // empty
        }
        if let Some(ai) = &additional_items {
            if let Items::One(d) = ai {
                if items_total > 0 {
                    definition.additional_items = Some(Additional::Def(d.clone())); // with rest items
                }
            }
        } else if items_total > 0 {
            definition.max_items = Some(items_total as i64); // without rest
        }

        def(definition)
    }

    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        let TypeKind::Tuple(tt) = &**t else { unreachable!() };
        let mut children = Vec::new();
        for member in tt.types() {
            if !types::not_never(member) {
                continue;
            }
            children.extend(self.child_type_formatter.get_children(member));
        }
        unique_types(children)
    }
}

/// Whether a rest element only contains items whose ID matches `check_type`
/// (uniformRestType in src/TypeFormatter/TupleTypeFormatter.ts).
fn uniform_rest_type(rest_type: &RestType, check_type: &Ty) -> bool {
    match &*rest_type.ty {
        TypeKind::Array(inner) => inner.item.id() == check_type.id(),
        TypeKind::Tuple(inner) => {
            for member in inner.types() {
                if let TypeKind::Rest(rest) = &**member {
                    if !uniform_rest_type(rest, check_type) {
                        return false;
                    }
                } else if member.id() != check_type.id() {
                    return false;
                }
            }
            true
        }
        _ => false,
    }
}
