//! Port of Go `tsjg/formatter/intersection_type_formatter.go`.

use std::rc::Rc;

use super::all_of_definition::reduce_all_of;
use super::{TypeFormatter, unique_types};
use crate::tsjg::schema::{Additional, Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct IntersectionTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
}

impl IntersectionTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>) -> Rc<IntersectionTypeFormatter> {
        Rc::new(IntersectionTypeFormatter { child_type_formatter })
    }
}

impl TypeFormatter for IntersectionTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Intersection(_))
    }

    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Intersection(intersection_type) = &**t else { unreachable!() };

        let mut dependencies: Vec<Def> = Vec::new();
        let mut non_array_like_types: Vec<Ty> = Vec::new();

        for member in intersection_type.types() {
            // Filter out array-like definitions that cannot be easily merged into
            // a single JSON Schema object.
            match &**member {
                TypeKind::Array(_) | TypeKind::Tuple(_) => dependencies.push(self.child_type_formatter.get_definition(member)),
                _ => non_array_like_types.push(member.clone()),
            }
        }

        if !non_array_like_types.is_empty() {
            // There are non-array (mergeable) requirements.
            let mut merged = def(Definition { additional_properties: Some(Additional::Bool(false)), ..Definition::with_type("object") });
            for member in &non_array_like_types {
                merged = reduce_all_of(&self.child_type_formatter, merged, member);
            }
            dependencies.push(merged);
        }

        if dependencies.len() == 1 {
            return dependencies.remove(0);
        }
        def(Definition { all_of: Some(dependencies), ..Definition::default() })
    }

    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        let TypeKind::Intersection(i) = &**t else { unreachable!() };
        let mut children = Vec::new();
        for member in i.types() {
            children.extend(self.child_type_formatter.get_children(member));
        }
        unique_types(children)
    }
}
