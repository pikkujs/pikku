//! Port of Go `tsjg/formatter/any_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct AnyTypeFormatter;

impl AnyTypeFormatter {
    pub fn new() -> Rc<AnyTypeFormatter> {
        Rc::new(AnyTypeFormatter)
    }
}

impl TypeFormatter for AnyTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Any)
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition::default())
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
