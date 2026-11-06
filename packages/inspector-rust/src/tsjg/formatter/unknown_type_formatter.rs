//! Port of Go `tsjg/formatter/unknown_type_formatter.go`.

use std::rc::Rc;

use serde_json::Value;

use super::TypeFormatter;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct UnknownTypeFormatter;

impl UnknownTypeFormatter {
    pub fn new() -> Rc<UnknownTypeFormatter> {
        Rc::new(UnknownTypeFormatter)
    }
}

impl TypeFormatter for UnknownTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Unknown { .. })
    }
    fn get_definition(&self, t: &Ty) -> Def {
        if let TypeKind::Unknown { errored_source: true } = &**t {
            let mut d = Definition::default();
            d.set_extra("description", Value::String("Failed to correctly infer type".into()));
            return def(d);
        }
        def(Definition::default())
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
