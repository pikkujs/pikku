//! Port of Go `tsjg/formatter/primitive_union_type_formatter.go`.

use std::rc::Rc;

use serde_json::Value;

use super::{TypeFormatter, unique};
use crate::tsjg::fail;
use crate::tsjg::schema::{Def, Definition, def};
use crate::tsjg::types::{self, Ty, TypeKind, UnionType};

pub struct PrimitiveUnionTypeFormatter;

impl PrimitiveUnionTypeFormatter {
    pub fn new() -> Rc<PrimitiveUnionTypeFormatter> {
        Rc::new(PrimitiveUnionTypeFormatter)
    }
}

fn is_primitive_union(u: &UnionType) -> bool {
    u.types().iter().all(|i| matches!(&**i, TypeKind::String { .. } | TypeKind::Number | TypeKind::Boolean | TypeKind::Null))
}

fn get_primitive_type(item: &Ty) -> String {
    match &**item {
        TypeKind::String { .. } => "string",
        TypeKind::Number => "number",
        TypeKind::Boolean => "boolean",
        TypeKind::Null => "null",
        other => fail(&format!("unexpected code branch for type {}", types::go_type_name(other))),
    }
    .to_string()
}

impl TypeFormatter for PrimitiveUnionTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Union(u) if !u.types().is_empty() && is_primitive_union(u))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Union(u) = &**t else { unreachable!() };
        let names: Vec<String> = u.types().iter().map(get_primitive_type).collect();
        let names = unique(&names);
        def(Definition { type_: Some(Value::Array(names.into_iter().map(Value::String).collect())), ..Definition::default() })
    }
    fn get_children(&self, _t: &Ty) -> Vec<Ty> {
        Vec::new()
    }
}
