//! Port of Go `tsjg/formatter/array_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, Items, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct ArrayTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
}

impl ArrayTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>) -> Rc<ArrayTypeFormatter> {
        Rc::new(ArrayTypeFormatter { child_type_formatter })
    }
    fn item(t: &Ty) -> Ty {
        match &**t {
            TypeKind::Array(a) => a.item.clone(),
            _ => unreachable!(),
        }
    }
}

impl TypeFormatter for ArrayTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Array(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        let items = self.child_type_formatter.get_definition(&Self::item(t));
        def(Definition { items: Some(Items::One(items)), ..Definition::with_type("array") })
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        self.child_type_formatter.get_children(&Self::item(t))
    }
}
