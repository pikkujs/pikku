//! Port of Go `tsjg/parser/array_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles `T[]` (src/NodeParser/ArrayNodeParser.ts).
pub struct ArrayNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<ArrayNodeParser> {
    Rc::new(ArrayNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for ArrayNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::ArrayType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        // Generics without `extends` or `defaults` cannot be resolved, so we fall back to `any`.
        let typ = self.child_node_parser.create_type(Some(node.as_array_type_node().element_type()), ctx, None);
        types::new(TypeKind::Array(types::ArrayType { item: typ }))
    }
}
