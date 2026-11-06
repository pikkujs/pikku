//! Port of Go `tsjg/parser/literal_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles literal type nodes (src/NodeParser/LiteralNodeParser.ts).
pub struct LiteralNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<LiteralNodeParser> {
    Rc::new(LiteralNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for LiteralNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::LiteralType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        self.child_node_parser.create_type(Some(node.as_literal_type_node().literal()), ctx, None)
    }
}
