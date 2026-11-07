//! Port of Go `tsjg/parser/enum_node_parser.go`: enum declarations and single
//! enum members (src/NodeParser/EnumNodeParser.ts).

use std::rc::Rc;

use serde_json::Value;
use tsrs_ast::{Kind, Node};
use tsrs_checker::LiteralValue;
use tsrs_core::P;

use super::{Chk, Context, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty};

pub struct EnumNodeParser {
    type_checker: Chk,
}

pub fn new(type_checker: Chk) -> Rc<EnumNodeParser> {
    Rc::new(EnumNodeParser { type_checker })
}

impl SubNodeParser for EnumNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::EnumDeclaration || node.kind() == Kind::EnumMember
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let members: Vec<P<Node>> = if node.kind() == Kind::EnumDeclaration { node.members().to_vec() } else { vec![node] };

        let mut values: Vec<types::EnumValue> = Vec::new();
        // Note: the index is the position after filtering hidden members, which
        // shifts implicit auto-increment values (mirrors the TS implementation).
        let mut index = 0;
        for member in members {
            if tsutils::is_node_hidden(member) {
                continue;
            }
            values.push(self.get_member_value(member, index));
            index += 1;
        }
        types::new_enum_type(format!("enum-{}", get_node_key(node, ctx)), values)
    }
}

impl EnumNodeParser {
    fn get_member_value(&self, member: P<Node>, index: usize) -> Value {
        let constant_value = self.type_checker.with(|c| c.get_constant_value(member));
        if let Some(cv) = constant_value {
            return match cv {
                LiteralValue::Number(n) => Value::from(n.0),
                LiteralValue::String(s) => Value::String(s.to_string()),
                LiteralValue::Boolean(b) => Value::Bool(b),
                LiteralValue::BigInt(b) => Value::String(format!("{b:?}")),
            };
        }

        let initializer = member.as_enum_member().initializer();
        match initializer {
            None => Value::from(index as f64),
            // Quirk of the TS implementation: the member *name*, not the template text.
            Some(i) if i.kind() == Kind::NoSubstitutionTemplateLiteral => {
                Value::String(tsrs_scanner::get_text_of_node(member.as_enum_member().name()))
            }
            Some(i) => self.parse_initializer(i),
        }
    }

    fn parse_initializer(&self, initializer: P<Node>) -> Value {
        match initializer.kind() {
            Kind::TrueKeyword => Value::Bool(true),
            Kind::FalseKeyword => Value::Bool(false),
            Kind::NullKeyword => Value::Null,
            Kind::StringLiteral => Value::String(initializer.text().to_string()),
            Kind::ParenthesizedExpression | Kind::AsExpression | Kind::TypeAssertionExpression => {
                self.parse_initializer(initializer.expression().unwrap())
            }
            _ => Value::String(tsrs_scanner::get_text_of_node(initializer)),
        }
    }
}
