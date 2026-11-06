//! Port of Go `tsjg/parser/number_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `number` and `bigint` keywords (src/NodeParser/NumberTypeNodeParser.ts).
pub struct NumberTypeNodeParser;

pub fn new() -> Rc<NumberTypeNodeParser> {
    Rc::new(NumberTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for NumberTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::NumberKeyword || node.kind() == Kind::BigIntKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Number)
    }
}
