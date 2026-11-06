//! Port of Go `tsjg/parser/binary_expression_node_parser.go`: approximates the
//! result type of binary expressions. The operator is never inspected; every
//! binary expression is treated like `+`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

pub struct BinaryExpressionNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<BinaryExpressionNodeParser> {
    Rc::new(BinaryExpressionNodeParser { child_node_parser })
}

impl SubNodeParser for BinaryExpressionNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::BinaryExpression
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let expr = node.as_binary_expression();
        let left = self.child_node_parser.create_type(Some(expr.left()), ctx, None);
        let right = self.child_node_parser.create_type(Some(expr.right()), ctx, None);
        if is_any_type(&left) || is_any_type(&right) {
            return types::new(TypeKind::Any);
        }
        if is_string_like(&left) || is_string_like(&right) {
            return types::new(TypeKind::String { preserve_literals: false });
        }
        if is_definitely_number_like(&left) && is_definitely_number_like(&right) {
            return types::new(TypeKind::Number);
        }
        if is_boolean_like(&left) && is_boolean_like(&right) {
            return types::new(TypeKind::Boolean);
        }
        // Anything else (objects, unknown, weird unions, etc.) returns 'string'
        // because at runtime + usually goes through ToPrimitive and ends up in
        // the string concatenation branch when non-numeric values are involved.
        types::new(TypeKind::String { preserve_literals: false })
    }
}

fn is_any_type(t: &Ty) -> bool {
    matches!(&**t, TypeKind::Any)
}

fn is_string_like(t: &Ty) -> bool {
    match &**t {
        TypeKind::Alias(a) => is_string_like(&a.ty),
        TypeKind::String { .. } => true,
        TypeKind::Literal(l) => l.is_string(),
        // Any union member being string-like is enough.
        TypeKind::Union(u) => u.types().iter().any(is_string_like),
        _ => false,
    }
}

fn is_boolean_like(t: &Ty) -> bool {
    match &**t {
        TypeKind::Boolean => true,
        TypeKind::Literal(l) => l.value.is_boolean(),
        _ => false,
    }
}

fn is_definitely_number_like(t: &Ty) -> bool {
    match &**t {
        TypeKind::Alias(a) => is_definitely_number_like(&a.ty),
        TypeKind::Number => true,
        TypeKind::Literal(l) => l.value.is_number(),
        TypeKind::Union(u) => u.types().iter().all(is_definitely_number_like),
        _ => false,
    }
}
