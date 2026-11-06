//! Port of Go `tsjg/formatter/boolean_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct BooleanTypeFormatter;

impl BooleanTypeFormatter {
    pub fn new() -> Rc<BooleanTypeFormatter> {
        Rc::new(BooleanTypeFormatter)
    }
}

impl TypeFormatter for BooleanTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Boolean)
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition::with_type("boolean"))
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
