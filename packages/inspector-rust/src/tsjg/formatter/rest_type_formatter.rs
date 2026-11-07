//! Port of Go `tsjg/formatter/rest_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Items, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct RestTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
}

impl RestTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>) -> Rc<RestTypeFormatter> {
        Rc::new(RestTypeFormatter { child_type_formatter })
    }
}

impl TypeFormatter for RestTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Rest(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Rest(rest) = &**t else { unreachable!() };
        let definition = self.child_type_formatter.get_definition(&rest.ty);
        let title = &rest.title;
        if !title.is_empty() {
            let items = match &definition.borrow().items {
                Some(Items::One(i)) => Some(i.clone()),
                _ => None,
            };
            if let Some(items) = items {
                let mut clone = definition.borrow().clone();
                let mut items_clone = items.borrow().clone();
                items_clone.title = title.clone();
                clone.items = Some(Items::One(def(items_clone)));
                return def(clone);
            }
        }
        definition
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        let TypeKind::Rest(r) = &**t else { unreachable!() };
        self.child_type_formatter.get_children(&r.ty)
    }
}
