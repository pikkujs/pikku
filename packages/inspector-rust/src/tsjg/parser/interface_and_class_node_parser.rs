//! Port of Go `tsjg/parser/interface_and_class_node_parser.go`: interface and
//! class declarations into object types
//! (src/NodeParser/InterfaceAndClassNodeParser.ts).

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::{
    NODE_BUILDER_FLAGS_NO_TRUNCATION, SynthesizedSymbols, member_additional_properties, member_property_name, push_type_parameters,
};
use super::{Chk, Context, NodeParser, SubNodeParser, get_node_key};
use crate::tsjg::tsutils;
use crate::tsjg::typenode::type_to_type_node;
use crate::tsjg::types::{self, AdditionalProperties, ObjectProperty, Ty, TypeKind};

pub struct InterfaceAndClassNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
    additional_properties: bool,
    synth: Rc<SynthesizedSymbols>,
}

pub fn new(
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
    additional_properties: bool,
    synth: Rc<SynthesizedSymbols>,
) -> Rc<InterfaceAndClassNodeParser> {
    Rc::new(InterfaceAndClassNodeParser { type_checker, child_node_parser, additional_properties, synth })
}

impl SubNodeParser for InterfaceAndClassNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::InterfaceDeclaration || node.kind() == Kind::ClassDeclaration
    }

    fn create_type(&self, node: P<Node>, context: &Context, reference: Option<&Ty>) -> Ty {
        // Note: this mutates the caller's context, zipping parameter names
        // onto the type arguments already pushed by TypeReferenceNodeParser.
        push_type_parameters(&self.type_checker, &self.child_node_parser, node, context);

        let id = self.get_type_id(node, context);
        if let Some(r) = reference {
            if let TypeKind::Reference(r) = &**r {
                r.set_id(id.clone());
                r.set_name(id.clone());
            }
        }

        let Some(properties) = self.get_properties(node, context) else { return types::new(TypeKind::Never) };

        let additional_properties = member_additional_properties(
            &self.child_node_parser,
            node,
            context,
            Some(AdditionalProperties::Bool(self.additional_properties)),
        );

        // When the type only extends Array or ReadonlyArray then create an
        // array type instead of an object type.
        if properties.is_empty() && matches!(additional_properties, Some(AdditionalProperties::Bool(false))) {
            if let Some(array_item_type) = self.get_array_item_type(node) {
                return types::new(TypeKind::Array(types::ArrayType {
                    item: self.child_node_parser.create_type(Some(array_item_type), context, None),
                }));
            }
        }

        types::new_object_type(id, self.get_base_types(node, context), properties, additional_properties, false)
    }
}

impl InterfaceAndClassNodeParser {
    /// The array item type if the node extends Array or ReadonlyArray and
    /// nothing else.
    fn get_array_item_type(&self, node: P<Node>) -> Option<P<Node>> {
        let clauses = heritage_clauses_of(node);
        if clauses.len() != 1 {
            return None;
        }
        let clause_types = clauses[0].as_heritage_clause().types().nodes();
        if clause_types.len() != 1 {
            return None;
        }
        let expr = clause_types[0];
        let symbol = tsutils::get_symbol_at_location(&self.type_checker, Some(tsrs_ast::get_heritage_clause_element_name(expr)));
        match symbol {
            Some(s) if s.name() == "Array" || s.name() == "ReadonlyArray" => {}
            _ => return None,
        }
        let type_arguments = expr.type_arguments();
        if type_arguments.len() != 1 {
            return None;
        }
        Some(type_arguments[0])
    }

    fn get_base_types(&self, node: P<Node>, context: &Context) -> Vec<Ty> {
        let mut result = Vec::new();
        for clause in heritage_clauses_of(node) {
            for expression in clause.as_heritage_clause().types().nodes() {
                result.push(self.child_node_parser.create_type(Some(*expression), context, None));
            }
        }
        result
    }

    /// The parsed object properties; None when a required property resolved to
    /// never, which makes the whole type never (the upstream implementation
    /// returns undefined then).
    fn get_properties(&self, node: P<Node>, context: &Context) -> Option<Vec<ObjectProperty>> {
        let mut members: Vec<P<Node>> = Vec::new();
        for member in node.members() {
            if member.kind() == Kind::Constructor {
                for param in member.parameters() {
                    if tsrs_ast::is_parameter_property_declaration(*param, param.parent().unwrap()) {
                        members.push(*param);
                    }
                }
            } else if matches!(member.kind(), Kind::PropertySignature | Kind::PropertyDeclaration) {
                members.push(*member);
            }
        }

        let mut has_required_never = false;
        let mut properties = Vec::new();
        for member in members {
            if !tsutils::is_public(member) || tsutils::is_static(member) || tsutils::is_node_hidden(member) {
                continue;
            }

            let mut member_type = member.type_node();

            // Use the type checker if the member has no explicit type. Ignore
            // members without an initializer; they have no useful type.
            if member_type.is_none() && member.initializer().is_some() {
                let t = self.type_checker.with(|c| c.get_type_at_location(member));
                member_type = type_to_type_node(&self.type_checker, t, Some(node), NODE_BUILDER_FLAGS_NO_TRUNCATION, &self.synth);
                // TypeToTypeNode returns a node that is detached from the AST,
                // so AnnotatedNodeParser cannot walk up to the member to read
                // its JSDoc. Point the synthesized node at the original
                // declaration so annotations such as the property description
                // are preserved. See upstream issue #1531.
                if let Some(mt) = member_type {
                    mt.set_parent(Some(member));
                }
            }

            let Some(member_type) = member_type else { continue };

            let property = ObjectProperty::new(
                member_property_name(&self.type_checker, member.name().unwrap()),
                self.child_node_parser.create_type(Some(member_type), context, None),
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
        let node_type = if node.kind() == Kind::InterfaceDeclaration { "interface" } else { "class" };
        format!("{node_type}-{}", get_node_key(node, context))
    }
}

/// The heritage clauses of an interface or class declaration (empty otherwise).
fn heritage_clauses_of(node: P<Node>) -> Vec<P<Node>> {
    let list = match node.kind() {
        Kind::InterfaceDeclaration => node.as_interface_declaration().heritage_clauses(),
        Kind::ClassDeclaration => node.as_class_declaration().heritage_clauses(),
        _ => None,
    };
    list.map(|l| l.nodes().to_vec()).unwrap_or_default()
}
