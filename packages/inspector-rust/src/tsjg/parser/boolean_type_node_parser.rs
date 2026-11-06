//! Port of Go `tsjg/parser/boolean_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `boolean` keyword (src/NodeParser/BooleanTypeNodeParser.ts).
pub struct BooleanTypeNodeParser;

pub fn new() -> Rc<BooleanTypeNodeParser> {
    Rc::new(BooleanTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for BooleanTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::BooleanKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Boolean)
    }
}
