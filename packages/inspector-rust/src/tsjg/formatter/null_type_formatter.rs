//! Port of Go `tsjg/formatter/null_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct NullTypeFormatter;

impl NullTypeFormatter {
    pub fn new() -> Rc<NullTypeFormatter> {
        Rc::new(NullTypeFormatter)
    }
}

impl TypeFormatter for NullTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Null)
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition::with_type("null"))
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
