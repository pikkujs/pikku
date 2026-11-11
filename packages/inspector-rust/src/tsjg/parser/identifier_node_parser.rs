//! Port of Go `tsjg/parser/identifier_node_parser.go`: identifiers whose value
//! is a compile-time constant. Only `const` variables are resolved.

use std::rc::Rc;

use tsrs_ast::{Kind, Node, NodeFlags};
use tsrs_core::P;

use super::{Chk, Context, NodeParser, SubNodeParser, unknown_node_error};
use crate::tsjg::tsutils;
use crate::tsjg::types::Ty;

pub struct IdentifierNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
    checker: Chk,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>, type_checker: Chk) -> Rc<IdentifierNodeParser> {
    Rc::new(IdentifierNodeParser { child_node_parser, checker: type_checker })
}

impl SubNodeParser for IdentifierNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::Identifier
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let Some(symbol) = tsutils::get_symbol_at_location(&self.checker, Some(node)) else { unknown_node_error(Some(node)) };

        if let Some(declaration) = symbol.value_declaration() {
            if declaration.kind() == Kind::VariableDeclaration
                && declaration.initializer().is_some()
                && tsrs_ast::get_combined_node_flags(declaration).intersects(NodeFlags::Const)
            {
                return self.child_node_parser.create_type(declaration.initializer(), ctx, None);
            }
        }
        unknown_node_error(Some(node))
    }
}
