//! Port of Go `tsjg/parser/string_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `string` keyword (src/NodeParser/StringTypeNodeParser.ts).
pub struct StringTypeNodeParser;

pub fn new() -> Rc<StringTypeNodeParser> {
    Rc::new(StringTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for StringTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::StringKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::String { preserve_literals: false })
    }
}
