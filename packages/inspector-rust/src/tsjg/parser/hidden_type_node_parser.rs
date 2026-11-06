//! Port of Go `tsjg/parser/hidden_type_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Turns nodes annotated with the @hidden JSDoc tag into HiddenType (src/NodeParser/HiddenTypeNodeParser.ts).
pub struct HiddenNodeParser;

pub fn new() -> Rc<HiddenNodeParser> {
    Rc::new(HiddenNodeParser)
}

#[allow(unused_variables)]
impl SubNodeParser for HiddenNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        tsutils::is_node_hidden(node)
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Hidden)
    }
}
