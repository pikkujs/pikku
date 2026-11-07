//! Port of Go `tsjg/formatter/symbol_type_formatter.go`.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct SymbolTypeFormatter;

impl SymbolTypeFormatter {
    pub fn new() -> Rc<SymbolTypeFormatter> {
        Rc::new(SymbolTypeFormatter)
    }
}

impl TypeFormatter for SymbolTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Symbol)
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition::default())
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
