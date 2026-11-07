//! Port of Go `tsjg/formatter/string_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct StringTypeFormatter;

impl StringTypeFormatter {
    pub fn new() -> Rc<StringTypeFormatter> {
        Rc::new(StringTypeFormatter)
    }
}

impl TypeFormatter for StringTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::String { .. })
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition::with_type("string"))
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
