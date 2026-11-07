//! Port of Go `tsjg/parser/type_literal_node_parser.go`: inline object type
//! literals (src/NodeParser/TypeLiteralNodeParser.ts).

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::{member_additional_properties, member_property_name};
use super::{Chk, Context, NodeParser, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, AdditionalProperties, ObjectProperty, Ty, TypeKind};

pub struct TypeLiteralNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
    additional_properties: bool,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>, additional_properties: bool) -> Rc<TypeLiteralNodeParser> {
    Rc::new(TypeLiteralNodeParser { type_checker, child_node_parser, additional_properties })
}

impl SubNodeParser for TypeLiteralNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::TypeLiteral
    }

    fn create_type(&self, node: P<Node>, context: &Context, reference: Option<&Ty>) -> Ty {
        let id = self.get_type_id(node, context);
        if let Some(r) = reference {
            if let TypeKind::Reference(r) = &**r {
                r.set_id(id.clone());
                r.set_name(id.clone());
            }
        }

        let Some(properties) = self.get_properties(node, context) else { return types::new(TypeKind::Never) };
        types::new_object_type(
            id,
            Vec::new(),
            properties,
            member_additional_properties(
                &self.child_node_parser,
                node,
                context,
                Some(AdditionalProperties::Bool(self.additional_properties)),
            ),
            false,
        )
    }
}

impl TypeLiteralNodeParser {
    /// None when a required property resolved to never (Go's hasRequiredNever).
    fn get_properties(&self, node: P<Node>, context: &Context) -> Option<Vec<ObjectProperty>> {
        let mut has_required_never = false;
        let mut properties = Vec::new();
        for member in node.members() {
            if member.kind() != Kind::PropertySignature && member.kind() != Kind::MethodSignature {
                continue;
            }
            if tsutils::is_node_hidden(*member) {
                continue;
            }
            let property = ObjectProperty::new(
                member_property_name(&self.type_checker, member.name().unwrap()),
                self.child_node_parser.create_type(member.type_node(), context, None),
                member.question_token().is_none(),
            );
            if types::is_never_like(&property.ty) {
                if property.required {
                    has_required_never = true;
                }
                continue;
            }
            properties.push(property);
        }
        if has_required_never {
            return None;
        }
        Some(properties)
    }

    fn get_type_id(&self, node: P<Node>, context: &Context) -> String {
        format!("structure-{}", get_node_key(node, context))
    }
}
