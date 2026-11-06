//! Port of Go `tsjg/parser/array_literal_expression_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles array literal expressions like `[1, 2, 3]` (src/NodeParser/ArrayLiteralExpressionNodeParser.ts).
pub struct ArrayLiteralExpressionNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<ArrayLiteralExpressionNodeParser> {
    Rc::new(ArrayLiteralExpressionNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for ArrayLiteralExpressionNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::ArrayLiteralExpression
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new_tuple_type(&create_types(&self.child_node_parser, node.as_array_literal_expression().elements().nodes(), ctx))
    }
}
