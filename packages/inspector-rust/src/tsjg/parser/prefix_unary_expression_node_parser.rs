//! Port of Go `tsjg/parser/prefix_unary_expression_node_parser.go`.

use std::rc::Rc;

use serde_json::Value;
use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::fail;
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles +, -, ~, and ! applied to literal operands, using JavaScript
/// coercion semantics (src/NodeParser/PrefixUnaryExpressionNodeParser.ts).
pub struct PrefixUnaryExpressionNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<PrefixUnaryExpressionNodeParser> {
    Rc::new(PrefixUnaryExpressionNodeParser { child_node_parser })
}

fn literal(v: Value) -> Ty {
    types::new(TypeKind::Literal(types::LiteralType { value: v }))
}

impl SubNodeParser for PrefixUnaryExpressionNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::PrefixUnaryExpression
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let expr = node.as_prefix_unary_expression();
        let operand = self.child_node_parser.create_type(Some(expr.operand()), ctx, None);
        if let TypeKind::Literal(l) = &*operand {
            match expr.operator() {
                Kind::PlusToken => return literal(Value::from(js_to_number(&l.value))),
                Kind::MinusToken => return literal(Value::from(-js_to_number(&l.value))),
                Kind::TildeToken => return literal(Value::from(!to_int32(js_to_number(&l.value)) as f64)),
                Kind::ExclamationToken => return literal(Value::Bool(!js_to_boolean(&l.value))),
                _ => {}
            }
            fail("unsupported prefix unary operator");
        }
        fail(&format!("expected operand to be \"LiteralType\" but is {:?}", type_constructor_name(&operand)))
    }
}

/// ECMAScript ToInt32.
fn to_int32(f: f64) -> i32 {
    if !f.is_finite() {
        return 0;
    }
    let m = f.trunc().rem_euclid(4294967296.0);
    (m as u32) as i32
}

/// ECMAScript StringToNumber.
fn string_to_number(s: &str) -> f64 {
    let t = s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    if t.is_empty() {
        return 0.0;
    }
    for (p, radix) in [("0x", 16), ("0X", 16), ("0o", 8), ("0O", 8), ("0b", 2), ("0B", 2)] {
        if let Some(rest) = t.strip_prefix(p) {
            if rest.is_empty() {
                return f64::NAN;
            }
            return rest.chars().try_fold(0.0f64, |acc, c| c.to_digit(radix).map(|d| acc * radix as f64 + d as f64)).unwrap_or(f64::NAN);
        }
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    if t.bytes().all(|b| b.is_ascii_digit() || matches!(b, b'.' | b'e' | b'E' | b'+' | b'-')) {
        return t.parse::<f64>().unwrap_or(f64::NAN);
    }
    f64::NAN
}

/// JavaScript's ToNumber coercion of a literal value.
fn js_to_number(v: &Value) -> f64 {
    match v {
        Value::String(s) => string_to_number(s),
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::Bool(b) => *b as i32 as f64,
        _ => f64::NAN,
    }
}

/// JavaScript's ToBoolean coercion of a literal value.
fn js_to_boolean(v: &Value) -> bool {
    match v {
        Value::String(s) => !s.is_empty(),
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(0.0);
            f != 0.0 && !f.is_nan()
        }
        Value::Bool(b) => *b,
        _ => false,
    }
}

fn type_constructor_name(t: &Ty) -> String {
    types::go_type_name(t).trim_start_matches("*types.").to_string()
}
