//! Port of Go `tsjg/parser/object_literal_expression_node_parser.go`: object
//! literal expressions (src/NodeParser/ObjectLiteralExpressionNodeParser.ts).

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::{NODE_BUILDER_FLAGS_NO_TRUNCATION, SynthesizedSymbols, node_text};
use super::{Chk, Context, NodeParser, SubNodeParser, describe_node, get_node_key, unknown_node_error};
use crate::tsjg::fail;
use crate::tsjg::types::{self, AdditionalProperties, ObjectProperty, Ty};
use crate::tsjg::typenode::type_to_type_node;

pub struct ObjectLiteralExpressionNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
    checker: Chk,
    synth: Rc<SynthesizedSymbols>,
}

pub fn new(
    child_node_parser: Rc<dyn NodeParser>,
    type_checker: Chk,
    synth: Rc<SynthesizedSymbols>,
) -> Rc<ObjectLiteralExpressionNodeParser> {
    Rc::new(ObjectLiteralExpressionNodeParser { child_node_parser, checker: type_checker, synth })
}

impl SubNodeParser for ObjectLiteralExpressionNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::ObjectLiteralExpression
    }

    fn create_type(&self, node: P<Node>, context: &Context, _reference: Option<&Ty>) -> Ty {
        let mut spread_assignments: Vec<P<Node>> = Vec::new();
        let mut properties: Vec<P<Node>> = Vec::new();
        for prop in node.as_object_literal_expression().properties().nodes() {
            if prop.kind() == Kind::SpreadAssignment {
                spread_assignments.push(*prop);
            } else {
                properties.push(*prop);
            }
        }

        let parsed_properties = self.parse_properties(&properties, context);
        let object = types::new_object_type(
            format!("object-{}", get_node_key(node, context)),
            Vec::new(),
            parsed_properties,
            Some(AdditionalProperties::Bool(false)),
            false,
        );
        if spread_assignments.is_empty() {
            return object;
        }

        let mut member_types = vec![object];
        for spread in &spread_assignments {
            let t = self.checker.with(|c| c.get_type_at_location(spread.as_spread_assignment().expression()));
            let Some(referenced) = type_to_type_node(&self.checker, t, None, NODE_BUILDER_FLAGS_NO_TRUNCATION, &self.synth) else {
                fail(&format!("could not find reference for spread type {}", describe_node(Some(*spread))))
            };
            member_types.push(self.child_node_parser.create_type(Some(referenced), context, None));
        }

        // Note: the upstream implementation combines spreads with an
        // intersection, so later spread keys don't override earlier ones the
        // way JavaScript spread semantics would.
        types::new_intersection_type(member_types)
    }
}

impl ObjectLiteralExpressionNodeParser {
    fn parse_properties(&self, properties: &[P<Node>], context: &Context) -> Vec<ObjectProperty> {
        let mut result = Vec::new();
        for prop in properties {
            // Spread assignments are handled by the caller.
            if prop.kind() == Kind::SpreadAssignment {
                continue;
            }

            let Some(name) = prop.name() else { unknown_node_error(Some(*prop)) };

            let type_node: Option<P<Node>> = match prop.kind() {
                Kind::ShorthandPropertyAssignment => {
                    let t = self.checker.with(|c| c.get_type_at_location(*prop));
                    type_to_type_node(&self.checker, t, None, NODE_BUILDER_FLAGS_NO_TRUNCATION, &self.synth)
                }
                Kind::PropertyAssignment => Some(prop.as_property_assignment().initializer()),
                // Method and accessor declarations are handed to the function
                // parsers as-is.
                _ => Some(*prop),
            };
            let Some(type_node) = type_node else {
                fail(&format!("could not find type for property {}", describe_node(Some(*prop))))
            };

            result.push(ObjectProperty::new(
                node_text(name),
                self.child_node_parser.create_type(Some(type_node), context, None),
                prop.question_token().is_none(),
            ));
        }
        result
    }
}
