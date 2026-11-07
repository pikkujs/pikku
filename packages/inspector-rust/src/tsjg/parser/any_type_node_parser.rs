//! Port of Go `tsjg/parser/any_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles the `any` keyword. It also claims the `symbol` keyword, but SymbolTypeNodeParser is registered earlier in the chain so symbols become SymbolType (src/NodeParser/AnyTypeNodeParser.ts).
pub struct AnyTypeNodeParser;

pub fn new() -> Rc<AnyTypeNodeParser> {
    Rc::new(AnyTypeNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for AnyTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::AnyKeyword || node.kind() == Kind::SymbolKeyword
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Any)
    }
}
