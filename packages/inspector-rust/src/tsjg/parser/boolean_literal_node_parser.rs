//! Port of Go `tsjg/parser/boolean_literal_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles `true` and `false` literals (src/NodeParser/BooleanLiteralNodeParser.ts).
pub struct BooleanLiteralNodeParser;

pub fn new() -> Rc<BooleanLiteralNodeParser> {
    Rc::new(BooleanLiteralNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for BooleanLiteralNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::TrueKeyword || node.kind() == Kind::FalseKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Literal(types::LiteralType { value: serde_json::Value::Bool(node.kind() == Kind::TrueKeyword) }))
    }
}
