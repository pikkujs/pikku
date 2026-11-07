//! Port of Go `tsjg/formatter/hidden_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Additional, Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct HiddenTypeFormatter;

impl HiddenTypeFormatter {
    pub fn new() -> Rc<HiddenTypeFormatter> {
        Rc::new(HiddenTypeFormatter)
    }
}

impl TypeFormatter for HiddenTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Hidden)
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition { additional_properties: Some(Additional::Bool(false)), ..Definition::default() })
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
