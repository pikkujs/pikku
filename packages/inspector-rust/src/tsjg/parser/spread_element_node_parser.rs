//! Port of Go `tsjg/parser/spread_element_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles spread elements (src/NodeParser/SpreadElementNodeParser.ts).
pub struct SpreadElementNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<SpreadElementNodeParser> {
    Rc::new(SpreadElementNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for SpreadElementNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::SpreadElement
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Rest(types::RestType { ty: self.child_node_parser.create_type(Some(node.as_spread_element().expression()), ctx, None), title: String::new() }))
    }
}
