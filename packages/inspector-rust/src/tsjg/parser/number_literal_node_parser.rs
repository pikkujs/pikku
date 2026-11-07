//! Port of Go `tsjg/parser/number_literal_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Context, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles numeric literals (src/NodeParser/NumberLiteralNodeParser.ts).
pub struct NumberLiteralNodeParser;

pub fn new() -> Rc<NumberLiteralNodeParser> {
    Rc::new(NumberLiteralNodeParser)
}

impl SubNodeParser for NumberLiteralNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::NumericLiteral
    }

    fn create_type(&self, node: P<Node>, _ctx: &Context, _reference: Option<&Ty>) -> Ty {
        types::new(TypeKind::Literal(types::LiteralType { value: serde_json::Value::from(parse_float(node.text())) }))
    }
}

/// JavaScript's parseFloat for the scanner-normalized text of a numeric
/// literal: out-of-range values become ±Inf, unparsable text becomes NaN.
pub fn parse_float(text: &str) -> f64 {
    text.parse::<f64>().unwrap_or(f64::NAN)
}
