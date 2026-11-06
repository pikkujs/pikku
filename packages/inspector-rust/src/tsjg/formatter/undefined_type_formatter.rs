//! Port of Go `tsjg/formatter/undefined_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct UndefinedTypeFormatter;

impl UndefinedTypeFormatter {
    pub fn new() -> Rc<UndefinedTypeFormatter> {
        Rc::new(UndefinedTypeFormatter)
    }
}

impl TypeFormatter for UndefinedTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Undefined)
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition { not: Some(def(Definition::default())), ..Definition::default() })
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
