//! Port of Go `tsjg/parser/satisfies_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles `x satisfies T` (src/NodeParser/SatisfiesNodeParser.ts).
pub struct SatisfiesNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<SatisfiesNodeParser> {
    Rc::new(SatisfiesNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for SatisfiesNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::SatisfiesExpression
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        self.child_node_parser.create_type(Some(node.as_satisfies_expression().expression()), ctx, None)
    }
}
