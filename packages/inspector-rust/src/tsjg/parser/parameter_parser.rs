//! Port of Go `tsjg/parser/parameter_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::Ty;

/// Parses function parameters (src/NodeParser/ParameterParser.ts). It is
/// registered wrapped in withJsDoc so parameter JSDoc is read via the
/// annotation decorator.
pub struct ParameterParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<ParameterParser> {
    Rc::new(ParameterParser { child_node_parser })
}

impl SubNodeParser for ParameterParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::Parameter
    }

    fn create_type(&self, node: P<Node>, context: &Context, _reference: Option<&Ty>) -> Ty {
        // A parameter without a type annotation passes nil down the chain, which
        // fails there (mirroring the upstream behavior).
        self.child_node_parser.create_type(node.type_node(), context, None)
    }
}
