//! Port of Go `tsjg/parser/tuple_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles tuple types (src/NodeParser/TupleNodeParser.ts).
pub struct TupleNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<TupleNodeParser> {
    Rc::new(TupleNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for TupleNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::TupleType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new_tuple_type(&create_types(&self.child_node_parser, node.as_tuple_type_node().elements().nodes(), ctx))
    }
}
