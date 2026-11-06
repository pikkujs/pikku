//! Port of Go `tsjg/parser/mapped_type_node_parser.go`: expands mapped types
//! such as Record and Partial (src/NodeParser/MappedTypeNodeParser.ts).

use std::rc::Rc;

use serde_json::{Map, Value};
use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::inherit_parameters;
use super::{Context, NodeParser, SubNodeParser, describe_node, get_node_key};
use crate::tsjg::fail;
use crate::tsjg::types::{self, AdditionalProperties, Annotations, LiteralType, ObjectProperty, Ty, TypeKind, UnionType};

pub struct MappedTypeNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
    additional_properties: bool,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>, additional_properties: bool) -> Rc<MappedTypeNodeParser> {
    Rc::new(MappedTypeNodeParser { child_node_parser, additional_properties })
}

impl SubNodeParser for MappedTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::MappedType
    }

    fn create_type(&self, node: P<Node>, context: &Context, _reference: Option<&Ty>) -> Ty {
        let mapped = node.as_mapped_type_node();
        let constraint_type = self.child_node_parser.create_type(
            mapped.type_parameter.as_type_parameter_declaration().constraint(),
            context,
            None,
        );
        let key_list_type = types::deref_type(&constraint_type);
        let id = format!("indexed-type-{}", get_node_key(node, context));

        if let TypeKind::Union(key_list_union) = &*key_list_type {
            // Key type resolves to a set of known properties.
            return types::new_object_type(
                id,
                Vec::new(),
                self.get_properties(node, key_list_union, context),
                self.get_additional_properties(node, key_list_union, context),
                false,
            );
        }

        if matches!(&*key_list_type, TypeKind::Literal(_)) {
            // Key type resolves to a single known property.
            let union = types::new_union_type(&[key_list_type.clone()]);
            let TypeKind::Union(u) = &*union else { unreachable!() };
            return types::new_object_type(
                id,
                Vec::new(),
                self.get_properties(node, u, context),
                Some(AdditionalProperties::Bool(false)),
                false,
            );
        }

        let maybe_union_type =
            self.child_node_parser.create_type(mapped.type_, &self.create_sub_context(node, &key_list_type, context), None);
        if matches!(&*maybe_union_type, TypeKind::Union(_)) && constraint_type.id() == "number" {
            // Then we turn it into an array.
            return types::new(TypeKind::Array(types::ArrayType { item: maybe_union_type }));
        }

        match &*key_list_type {
            TypeKind::String { .. } | TypeKind::Number | TypeKind::Symbol | TypeKind::Any => {
                // Key type widens to `string`.
                let value_type =
                    self.child_node_parser.create_type(mapped.type_, &self.create_sub_context(node, &key_list_type, context), None);
                let result_type =
                    types::new_object_type(id, Vec::new(), Vec::new(), Some(AdditionalProperties::Type(value_type)), false);

                let mut annotations: Option<Annotations> = None;
                match &*constraint_type {
                    TypeKind::Annotated(a) => annotations = Some(a.annotations.clone()),
                    TypeKind::Definition(d) => {
                        if let TypeKind::Annotated(a) = &*d.ty {
                            annotations = Some(a.annotations.clone());
                        }
                    }
                    _ => {}
                }
                if let Some(annotations) = annotations {
                    let mut wrapper: Annotations = Map::new();
                    wrapper.insert("propertyNames".into(), Value::Object(annotations));
                    return types::new(TypeKind::Annotated(types::AnnotatedType {
                        ty: result_type,
                        annotations: wrapper,
                        nullable: false,
                    }));
                }
                result_type
            }
            TypeKind::Enum(key_list) => types::new_object_type(
                id,
                Vec::new(),
                self.get_values(node, key_list, context),
                Some(AdditionalProperties::Bool(false)),
                false,
            ),
            // HiddenType subclasses NeverType upstream, so it matches this
            // branch there as well.
            TypeKind::Never | TypeKind::Hidden => {
                types::new_object_type(id, Vec::new(), Vec::new(), Some(AdditionalProperties::Bool(false)), false)
            }
            _ => fail(&format!(
                "unexpected key type {:?} for this node. (expected \"UnionType\" or \"StringType\") {}",
                constraint_type.id(),
                describe_node(Some(node))
            )),
        }
    }
}

impl MappedTypeNodeParser {
    /// Evaluates the optional modifier of the mapped type. In mapped types,
    /// questionToken can be: absent (no optional modifier), `?` (add optional),
    /// `+?` (add optional) or `-?` (remove optional, e.g. Required<T> -> required).
    fn is_mapped_property_required(&self, node: P<Node>, has_undefined_in_type: bool) -> bool {
        match node.as_mapped_type_node().question_token {
            None => !has_undefined_in_type,
            Some(q) => q.kind() == Kind::MinusToken, // -? removes optional -> always required
        }
    }

    fn map_key(&self, node: P<Node>, raw_key: &Ty, context: &Context) -> Ty {
        match node.as_mapped_type_node().name_type {
            None => raw_key.clone(),
            Some(name_type) => types::deref_type(&self.child_node_parser.create_type(
                Some(name_type),
                &self.create_sub_context(node, raw_key, context),
                None,
            )),
        }
    }

    fn get_properties(&self, node: P<Node>, key_list_type: &UnionType, context: &Context) -> Vec<ObjectProperty> {
        let mapped = node.as_mapped_type_node();
        let mut result = Vec::new();
        let flattened = key_list_type.flattened_types(Some(&|t| types::deref_type(t)));
        for key_type in types::unique_types(&flattened) {
            let TypeKind::Literal(_) = &*key_type else { continue };
            let mapped_key = self.map_key(node, &key_type, context);
            let TypeKind::Literal(mapped_key) = &*mapped_key else { continue };

            // The sub-context binds the type parameter to the original key,
            // not the remapped one.
            let property_type =
                self.child_node_parser.create_type(mapped.type_, &self.create_sub_context(node, &key_type, context), None);
            let mut new_type = types::deref_annotated_type(&property_type);
            let mut has_undefined = false;
            if let TypeKind::Union(union) = &*new_type.clone() {
                let (num_removed, without) = types::remove_undefined(union);
                has_undefined = num_removed > 0;
                new_type = without;
            }

            result.push(ObjectProperty::new(
                types::js_value_to_string(&mapped_key.value),
                types::preserve_annotation(&property_type, new_type),
                self.is_mapped_property_required(node, has_undefined),
            ));
        }
        result
    }

    fn get_values(&self, node: P<Node>, key_list_type: &types::EnumType, context: &Context) -> Vec<ObjectProperty> {
        let mapped = node.as_mapped_type_node();
        let mut result = Vec::new();
        for value in &key_list_type.values {
            if value.is_null() {
                continue;
            }
            let key = types::new(TypeKind::Literal(LiteralType { value: value.clone() }));
            let value_type = self.child_node_parser.create_type(mapped.type_, &self.create_sub_context(node, &key, context), None);
            result.push(ObjectProperty::new(
                types::js_value_to_string(value),
                value_type,
                self.is_mapped_property_required(node, false),
            ));
        }
        result
    }

    fn get_additional_properties(&self, node: P<Node>, key_list_type: &UnionType, context: &Context) -> Option<AdditionalProperties> {
        let as_union = types::new_union_type(key_list_type.types());
        if types::is_deep_literal_union(&as_union) {
            return Some(AdditionalProperties::Bool(self.additional_properties));
        }

        let key = key_list_type.types().iter().find(|t| !matches!(&*types::deref_type(t), TypeKind::Literal(_)));
        let Some(key) = key else { return Some(AdditionalProperties::Bool(self.additional_properties)) };

        let t = self.child_node_parser.create_type(node.as_mapped_type_node().type_, &self.create_sub_context(node, key, context), None);
        Some(AdditionalProperties::Type(t))
    }

    fn create_sub_context(&self, node: P<Node>, key: &Ty, parent_context: &Context) -> Context {
        let sub = Context::new(Some(node));
        inherit_parameters(&sub, parent_context, "");
        sub.push_parameter(node.as_mapped_type_node().type_parameter.name().unwrap().text());
        sub.push_argument(Some(key.clone()));
        sub
    }
}
