//! Port of Go `tsjg/formatter/literal_type_formatter.go`.

use std::rc::Rc;

use serde_json::Value;

use super::TypeFormatter;
use super::type_name::type_name;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct LiteralTypeFormatter;

impl LiteralTypeFormatter {
    pub fn new() -> Rc<LiteralTypeFormatter> {
        Rc::new(LiteralTypeFormatter)
    }
}

impl TypeFormatter for LiteralTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Literal(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Literal(l) = &**t else { unreachable!() };
        let value: &Value = &l.value;
        def(Definition { type_: Some(Value::String(type_name(value))), const_: Some(value.clone()), ..Definition::default() })
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
