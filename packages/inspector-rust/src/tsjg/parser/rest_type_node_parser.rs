//! Port of Go `tsjg/parser/rest_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles `...T` (src/NodeParser/RestTypeNodeParser.ts).
pub struct RestTypeNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<RestTypeNodeParser> {
    Rc::new(RestTypeNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for RestTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::RestType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Rest(types::RestType { ty: self.child_node_parser.create_type(Some(node.as_rest_type_node().type_()), ctx, None), title: String::new() }))
    }
}
