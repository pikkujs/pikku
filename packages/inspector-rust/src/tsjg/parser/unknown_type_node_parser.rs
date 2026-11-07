//! Port of Go `tsjg/parser/unknown_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `unknown` keyword (src/NodeParser/UnknownTypeNodeParser.ts).
pub struct UnknownTypeNodeParser;

pub fn new() -> Rc<UnknownTypeNodeParser> {
    Rc::new(UnknownTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for UnknownTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::UnknownKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Unknown { errored_source: false })
    }
}
