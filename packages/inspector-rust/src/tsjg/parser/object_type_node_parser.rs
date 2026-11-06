//! Port of Go `tsjg/parser/object_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `object` keyword (src/NodeParser/ObjectTypeNodeParser.ts).
pub struct ObjectTypeNodeParser;

pub fn new() -> Rc<ObjectTypeNodeParser> {
    Rc::new(ObjectTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for ObjectTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::ObjectKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new_object_type(format!("object-{}", get_node_key(node, ctx)), Vec::new(), Vec::new(), Some(types::AdditionalProperties::Bool(true)), true)
    }
}
