//! Port of Go `tsjg/parser/intrinsic_node_parser.go`.

use std::rc::Rc;

use serde_json::Value;
use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, SubNodeParser};
use crate::tsjg::fail;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `intrinsic` keyword used by Uppercase/Lowercase/Capitalize/
/// Uncapitalize in lib.es5.d.ts, keyed off the name of the enclosing type
/// alias (src/NodeParser/IntrinsicNodeParser.ts). `NoInfer` is the one intrinsic
/// that is not string manipulation: it only blocks inference, so it is its
/// argument.
pub struct IntrinsicNodeParser;

pub fn new() -> Rc<IntrinsicNodeParser> {
    Rc::new(IntrinsicNodeParser)
}

fn intrinsic_method(name: &str) -> Option<fn(&str) -> String> {
    Some(match name {
        "Uppercase" => js_to_upper_case,
        "Lowercase" => js_to_lower_case,
        "Capitalize" => |v| js_change_first_case(v, js_to_upper_case),
        "Uncapitalize" => |v| js_change_first_case(v, js_to_lower_case),
        _ => return None,
    })
}

impl SubNodeParser for IntrinsicNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::IntrinsicKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let method_name = get_intrinsic_parent_name(node);
        if method_name == "NoInfer" {
            return ctx.arguments().into_iter().next().flatten().unwrap_or_else(|| types::new(TypeKind::Any));
        }
        let Some(method) = intrinsic_method(&method_name) else {
            fail(&format!("unknown intrinsic method: {method_name}"))
        };
        let argument = ctx.arguments().into_iter().next().flatten();
        let values = argument.map(|a| types::extract_literals(&a)).unwrap_or_default();
        let literals: Vec<Ty> = values
            .iter()
            .map(|v| types::new(TypeKind::Literal(types::LiteralType { value: Value::String(method(v)) })))
            .collect();
        single_or_union(literals)
    }
}

fn get_intrinsic_parent_name(node: P<Node>) -> String {
    match node.parent() {
        Some(parent) if parent.kind() == Kind::TypeAliasDeclaration => {
            parent.as_type_alias_declaration().name().text().to_string()
        }
        _ => fail("only intrinsics part of a TypeAliasDeclaration are supported"),
    }
}

/// String.prototype.toUpperCase (Unicode default full case conversion).
fn js_to_upper_case(v: &str) -> String {
    v.to_uppercase()
}

/// String.prototype.toLowerCase.
fn js_to_lower_case(v: &str) -> String {
    v.to_lowercase()
}

/// `v[0].toUpperCase() + v.slice(1)`: only the first UTF-16 code unit is
/// case-mapped. Fails on empty strings, like the TypeScript implementation.
fn js_change_first_case(v: &str, map_case: fn(&str) -> String) -> String {
    let Some(first) = v.chars().next() else { fail("cannot capitalize an empty string") };
    if (first as u32) > 0xFFFF {
        // In JavaScript v[0] is a lone surrogate, which case-mapping leaves
        // unchanged, so the string comes back as-is.
        return v.to_string();
    }
    map_case(&first.to_string()) + &v[first.len_utf8()..]
}
