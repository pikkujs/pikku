//! Port of Go `tsjg/parser/infer_type_node_parser.go`: `infer T` placeholders
//! which are resolved later by the conditional type parser.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser};
use crate::tsjg::types::{self, Ty};

pub struct InferTypeNodeParser;

pub fn new() -> Rc<InferTypeNodeParser> {
    Rc::new(InferTypeNodeParser)
}

impl SubNodeParser for InferTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::InferType
    }
    fn create_type(&self, node: P<Node>, _ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(types::TypeKind::Infer(types::InferType {
            id: node.as_infer_type_node().type_parameter().name().unwrap().text().to_string(),
        }))
    }
}
