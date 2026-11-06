//! Port of Go `tsjg/formatter/enum_type_formatter.go`.

use std::rc::Rc;

use serde_json::Value;

use super::type_name::{to_enum_type, type_name};
use super::{TypeFormatter, unique};
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct EnumTypeFormatter;

impl EnumTypeFormatter {
    pub fn new() -> Rc<EnumTypeFormatter> {
        Rc::new(EnumTypeFormatter)
    }
}

/// Go compares `any` values with `==`: same dynamic type and value.
#[derive(Clone, PartialEq, Eq, Hash)]
struct Key(String);

fn dedupe_values(values: &[Value]) -> Vec<Value> {
    let keys: Vec<Key> = values.iter().map(|v| Key(format!("{}", crate::tsjg::types::stable_stringify(v)))).collect();
    let mut seen = std::collections::HashSet::new();
    values.iter().zip(keys).filter(|(_, k)| seen.insert(k.clone())).map(|(v, _)| v.clone()).collect()
}

impl TypeFormatter for EnumTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Enum(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Enum(e) = &**t else { unreachable!() };
        let values = dedupe_values(&e.values);
        let names: Vec<String> = values.iter().map(type_name).collect();
        let names = unique(&names);
        // NOTE: We want to use "const" when referencing an enum member.
        // However, this formatter is used both for enum members and enum types,
        // so the side effect is that an enum type that contains just a single
        // value is represented as "const" too.
        if values.len() == 1 {
            return def(Definition { type_: Some(Value::String(names[0].clone())), const_: Some(values[0].clone()), ..Definition::default() });
        }
        def(Definition { type_: Some(to_enum_type(&names)), enum_: Some(values), ..Definition::default() })
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
