//! Port of Go `tsjg/parser/symbol_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `symbol` keyword (src/NodeParser/SymbolTypeNodeParser.ts).
pub struct SymbolTypeNodeParser;

pub fn new() -> Rc<SymbolTypeNodeParser> {
    Rc::new(SymbolTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for SymbolTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::SymbolKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Symbol)
    }
}
