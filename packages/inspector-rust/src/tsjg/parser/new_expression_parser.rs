//! Port of Go `tsjg/parser/new_expression_parser.go`: `new Foo()` expressions
//! via the constructed type.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::call_expression_parser::expression_declaration;
use super::shared::{SynthesizedSymbols, new_call_argument_context};
use super::{Chk, Context, NodeParser, SubNodeParser};
use crate::tsjg::types::Ty;

pub struct NewExpressionParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
    synth: Rc<SynthesizedSymbols>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>, synth: Rc<SynthesizedSymbols>) -> Rc<NewExpressionParser> {
    Rc::new(NewExpressionParser { type_checker, child_node_parser, synth })
}

impl SubNodeParser for NewExpressionParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::NewExpression
    }

    fn create_type(&self, node: P<Node>, context: &Context, _reference: Option<&Ty>) -> Ty {
        let t = self.type_checker.with(|c| c.get_type_at_location(node));
        let decl = expression_declaration(&self.type_checker, t, node, &self.synth);
        self.child_node_parser.create_type(Some(decl), &new_call_argument_context(&self.child_node_parser, node, context), None)
    }
}
