//! Port of Go `tsjg/parser/string_literal_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles string literals (src/NodeParser/StringLiteralNodeParser.ts).
pub struct StringLiteralNodeParser;

pub fn new() -> Rc<StringLiteralNodeParser> {
    Rc::new(StringLiteralNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for StringLiteralNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::StringLiteral
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Literal(types::LiteralType { value: serde_json::Value::String(node.text().to_string()) }))
    }
}
