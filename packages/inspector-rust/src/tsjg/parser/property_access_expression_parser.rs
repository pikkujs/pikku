//! Port of Go `tsjg/parser/property_access_expression_parser.go`: delegates to
//! the declaration of the accessed type's symbol.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::import_type_node_parser::first_declaration;
use super::{Chk, Context, NodeParser, SubNodeParser};
use crate::tsjg::fail;
use crate::tsjg::types::Ty;

pub struct PropertyAccessExpressionParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>) -> Rc<PropertyAccessExpressionParser> {
    Rc::new(PropertyAccessExpressionParser { type_checker, child_node_parser })
}

impl SubNodeParser for PropertyAccessExpressionParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::PropertyAccessExpression
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let typ = self.type_checker.with(|c| c.get_type_at_location(node));
        // No null guards, matching the TypeScript implementation (primitives
        // with no symbol throw there as well).
        let Some(symbol) = typ.symbol() else { fail("nil pointer dereference") };
        self.child_node_parser.create_type(Some(first_declaration(&symbol)), ctx, None)
    }
}
