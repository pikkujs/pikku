//! Port of Go `tsjg/parser/typeof_node_parser.go`: `typeof X` type query nodes
//! (src/NodeParser/TypeofNodeParser.ts).

use std::rc::Rc;

use serde_json::Value;
use tsrs_ast::{Kind, Node, SymbolFlags};
use tsrs_core::P;

use super::function_node_parser::{get_named_arguments, get_return_type, signature_comment};
use super::{Chk, Context, NodeParser, SubNodeParser, describe_node, get_node_key};
use crate::tsjg::fail;
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, AdditionalProperties, FunctionType, LiteralType, ObjectProperty, Ty, TypeKind};

pub struct TypeofNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>) -> Rc<TypeofNodeParser> {
    Rc::new(TypeofNodeParser { type_checker, child_node_parser })
}

impl SubNodeParser for TypeofNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::TypeQuery
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, reference: Option<&Ty>) -> Ty {
        let Some(mut symbol) = tsutils::get_symbol_at_location(&self.type_checker, Some(node.as_type_query_node().expr_name())) else {
            fail("nil pointer dereference")
        };
        if symbol.flags().intersects(SymbolFlags::Alias) {
            symbol = self.type_checker.with(|c| c.get_aliased_symbol(symbol));
        }

        let Some(value_dec) = symbol.value_declaration() else {
            if symbol.name() == "globalThis" {
                // Avoids crashes on globalThis, but we really shouldn't try to
                // make a schema for globalThis.
                return types::new(TypeKind::Never);
            }
            fail(&format!("no value declaration found for symbol {:?} at node {}", symbol.name(), describe_node(Some(node))))
        };

        if value_dec.kind() == Kind::EnumDeclaration {
            return self.create_object_from_enum(value_dec, ctx, reference);
        }

        if matches!(value_dec.kind(), Kind::VariableDeclaration | Kind::PropertySignature | Kind::PropertyDeclaration) {
            if let Some(declared_type) = value_dec.type_node() {
                return self.child_node_parser.create_type(Some(declared_type), ctx, None);
            }
            if let Some(initializer) = value_dec.initializer() {
                return self.child_node_parser.create_type(Some(initializer), ctx, None);
            }
        }

        if value_dec.kind() == Kind::ClassDeclaration {
            return self.child_node_parser.create_type(Some(value_dec), ctx, None);
        }

        if value_dec.kind() == Kind::PropertyAssignment {
            return self.child_node_parser.create_type(Some(value_dec.as_property_assignment().initializer()), ctx, None);
        }

        if value_dec.kind() == Kind::FunctionDeclaration {
            return types::new(TypeKind::Function(FunctionType {
                comment: signature_comment(Some(value_dec), ""),
                named_arguments: get_named_arguments(&self.child_node_parser, value_dec, ctx),
                return_type: get_return_type(&self.child_node_parser, value_dec, ctx),
            }));
        }

        fail(&format!(
            "invalid type query for this declaration. (ts.SyntaxKind = {}) at node {}",
            value_dec.kind() as i64,
            describe_node(Some(value_dec))
        ))
    }
}

impl TypeofNodeParser {
    fn create_object_from_enum(&self, node: P<Node>, ctx: &Context, reference: Option<&Ty>) -> Ty {
        let id = format!("typeof-enum-{}", get_node_key(node, ctx));
        if let Some(r) = reference {
            if let TypeKind::Reference(r) = &**r {
                r.set_id(id.clone());
                r.set_name(id.clone());
            }
        }

        let mut current: Option<Ty> = None;
        let members = node.members();
        let mut properties = Vec::with_capacity(members.len());
        for member in members {
            let name = tsrs_scanner::get_text_of_node(member.name().unwrap());
            let missing = || -> ! {
                fail(&format!(
                    "enum initializer missing for {:?} at node {}",
                    name,
                    describe_node(member.name())
                ))
            };
            if let Some(initializer) = member.as_enum_member().initializer() {
                current = Some(self.child_node_parser.create_type(Some(initializer), ctx, None));
            } else if current.is_none() {
                current = Some(types::new(TypeKind::Literal(LiteralType { value: Value::from(0.0) })));
            } else if let TypeKind::Literal(literal) = &**current.as_ref().unwrap() {
                match literal.value.as_f64() {
                    Some(value) => current = Some(types::new(TypeKind::Literal(LiteralType { value: Value::from(value + 1.0) }))),
                    None => missing(),
                }
            } else {
                missing();
            }
            properties.push(ObjectProperty::new(name, current.clone().unwrap(), true));
        }

        types::new_object_type(id, Vec::new(), properties, Some(AdditionalProperties::Bool(false)), false)
    }
}
