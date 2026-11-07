//! Port of Go `tsjg/formatter/never_type_formatter.go`.

/// Mirrors src/TypeFormatter/NeverTypeFormatter.ts. HiddenType subclasses NeverType in TS, so
/// `is_never_like` also matches hidden types; the Hidden formatter is registered first, so it wins.

use std::rc::Rc;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{self, Ty};

pub struct NeverTypeFormatter;

impl NeverTypeFormatter {
    pub fn new() -> Rc<NeverTypeFormatter> {
        Rc::new(NeverTypeFormatter)
    }
}

impl TypeFormatter for NeverTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        types::is_never_like(t)
    }
    fn get_definition(&self, _t: &Ty) -> Def {
        def(Definition { not: Some(def(Definition::default())), ..Definition::default() })
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
