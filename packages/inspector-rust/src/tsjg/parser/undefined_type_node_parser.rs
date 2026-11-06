//! Port of Go `tsjg/parser/undefined_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `undefined` keyword (src/NodeParser/UndefinedTypeNodeParser.ts).
pub struct UndefinedTypeNodeParser;

pub fn new() -> Rc<UndefinedTypeNodeParser> {
    Rc::new(UndefinedTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for UndefinedTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::UndefinedKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Undefined)
    }
}
