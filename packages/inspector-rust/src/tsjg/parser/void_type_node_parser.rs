//! Port of Go `tsjg/parser/void_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `void` keyword (src/NodeParser/VoidTypeNodeParser.ts).
pub struct VoidTypeNodeParser;

pub fn new() -> Rc<VoidTypeNodeParser> {
    Rc::new(VoidTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for VoidTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::VoidKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Void)
    }
}
