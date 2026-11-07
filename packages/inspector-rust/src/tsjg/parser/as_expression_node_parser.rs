//! Port of Go `tsjg/parser/as_expression_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles `x as T` (src/NodeParser/AsExpressionNodeParser.ts).
pub struct AsExpressionNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<AsExpressionNodeParser> {
    Rc::new(AsExpressionNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for AsExpressionNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::AsExpression
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        self.child_node_parser.create_type(Some(node.as_as_expression().expression()), ctx, None)
    }
}
