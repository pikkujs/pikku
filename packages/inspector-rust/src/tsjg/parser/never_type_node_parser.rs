//! Port of Go `tsjg/parser/never_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `never` keyword (src/NodeParser/NeverTypeNodeParser.ts).
pub struct NeverTypeNodeParser;

pub fn new() -> Rc<NeverTypeNodeParser> {
    Rc::new(NeverTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for NeverTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::NeverKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Never)
    }
}
