//! Port of Go `tsjg/parser/optional_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles `T?` tuple members (src/NodeParser/OptionalTypeNodeParser.ts).
pub struct OptionalTypeNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<OptionalTypeNodeParser> {
    Rc::new(OptionalTypeNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for OptionalTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::OptionalType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Optional(types::OptionalType { ty: self.child_node_parser.create_type(Some(node.as_optional_type_node().type_()), ctx, None) }))
    }
}
