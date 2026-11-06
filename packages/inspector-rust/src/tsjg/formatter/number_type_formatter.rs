//! Port of Go `tsjg/formatter/number_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct NumberTypeFormatter;

impl NumberTypeFormatter {
    pub fn new() -> Rc<NumberTypeFormatter> {
        Rc::new(NumberTypeFormatter)
    }
}

impl TypeFormatter for NumberTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Number)
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition::with_type("number"))
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
