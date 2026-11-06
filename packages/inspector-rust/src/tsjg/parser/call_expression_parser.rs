//! Port of Go `tsjg/parser/call_expression_parser.go`: call expressions by
//! evaluating the call's return type. Also holds `expressionDeclaration`
//! (Go `shared.go`), which only call/new expressions use.

use std::rc::Rc;

use serde_json::Value;
use tsrs_ast::{Kind, Node};
use tsrs_checker::{LiteralValue, ObjectFlags, Type, TypeFlags};
use tsrs_core::P;

use super::shared::{NODE_BUILDER_FLAGS_IGNORE_ERRORS, SynthesizedSymbols, new_call_argument_context};
use super::{Chk, Context, NodeParser, SubNodeParser, unknown_node_error};
use crate::tsjg::types::{self, Ty, TypeKind};
use crate::tsjg::typenode::type_to_type_node;

pub struct CallExpressionParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
    synth: Rc<SynthesizedSymbols>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>, synth: Rc<SynthesizedSymbols>) -> Rc<CallExpressionParser> {
    Rc::new(CallExpressionParser { type_checker, child_node_parser, synth })
}

/// The declaration standing behind the type of a call or new expression. For
/// generic signatures such as <T>(type: T) => T there is no reference to the
/// original type, so the checker's synthesized type node is preferred over the
/// symbol's declaration.
pub fn expression_declaration(type_checker: &Chk, t: P<Type>, node: P<Node>, synth: &SynthesizedSymbols) -> P<Node> {
    let mut symbol = t.symbol();
    if symbol.is_none() {
        if let Some(alias) = t.alias() {
            symbol = alias.symbol();
        }
    }

    let mut decl = type_to_type_node(type_checker, t, Some(node), NODE_BUILDER_FLAGS_IGNORE_ERRORS, synth);
    if decl.is_none() {
        if let Some(symbol) = symbol {
            decl = symbol.value_declaration();
            if decl.is_none() {
                decl = symbol.declarations().first().copied();
            }
        }
    }

    match decl {
        Some(d) => d,
        None => unknown_node_error(Some(node)),
    }
}

impl SubNodeParser for CallExpressionParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::CallExpression
    }

    fn create_type(&self, node: P<Node>, context: &Context, _reference: Option<&Ty>) -> Ty {
        let t = self.type_checker.with(|c| c.get_type_at_location(node));

        // FIXME(upstream): remove special case. The upstream implementation
        // pokes at the internal `type.typeArguments[0].types` fields of a
        // resolved type reference whose first type argument is a union, and
        // maps the union constituents to literal types.
        if t.flags().intersects(TypeFlags::Object) && t.object_flags().intersects(ObjectFlags::Reference) {
            let type_arguments = self.type_checker.with(|c| c.get_type_arguments(t));
            if !type_arguments.is_empty() && type_arguments[0].flags().intersects(TypeFlags::UnionOrIntersection) {
                let members: Vec<Ty> = type_arguments[0]
                    .types()
                    .iter()
                    .map(|m| types::new(TypeKind::Literal(types::LiteralType { value: checker_literal_value(*m) })))
                    .collect();
                return types::new_tuple_type(&[types::new_union_type(&members)]);
            }
        }

        // A call expression like Symbol("entity") that resulted in a `unique
        // symbol`. Note the strict equality (not a bitmask test), mirroring
        // the upstream code.
        if t.flags() == TypeFlags::UniqueESSymbol {
            return types::new(TypeKind::Symbol);
        }

        let decl = expression_declaration(&self.type_checker, t, node, &self.synth);
        self.child_node_parser.create_type(Some(decl), &new_call_argument_context(&self.child_node_parser, node, context), None)
    }
}

/// The literal value of a checker type, mirroring the internal `.value`
/// property read upstream (undefined - here null - for non-literal types such
/// as intrinsic boolean literals).
fn checker_literal_value(t: P<Type>) -> Value {
    if t.flags().intersects(TypeFlags::StringLiteral | TypeFlags::NumberLiteral) {
        return match t.as_literal_type().value() {
            Some(LiteralValue::Number(n)) => Value::from(n.0),
            Some(LiteralValue::String(s)) => Value::String(s.to_string()),
            Some(LiteralValue::Boolean(b)) => Value::Bool(b),
            _ => Value::Null,
        };
    }
    Value::Null
}
