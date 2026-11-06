//! Port of Go `tsjg/formatter/void_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct VoidTypeFormatter;

impl VoidTypeFormatter {
    pub fn new() -> Rc<VoidTypeFormatter> {
        Rc::new(VoidTypeFormatter)
    }
}

impl TypeFormatter for VoidTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Void)
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition::with_type("null"))
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
