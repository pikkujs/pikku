//! Port of Go `tsjg/parser/parenthesized_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles parenthesized types (src/NodeParser/ParenthesizedNodeParser.ts).
pub struct ParenthesizedNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<ParenthesizedNodeParser> {
    Rc::new(ParenthesizedNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for ParenthesizedNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::ParenthesizedType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        self.child_node_parser.create_type(Some(node.as_parenthesized_type_node().type_()), ctx, None)
    }
}
