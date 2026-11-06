//! Port of Go `tsjg/parser/type_operator_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles `keyof` and `readonly` (src/NodeParser/TypeOperatorNodeParser.ts).
pub struct TypeOperatorNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<TypeOperatorNodeParser> {
    Rc::new(TypeOperatorNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for TypeOperatorNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::TypeOperator
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let operator_node = node.as_type_operator_node();
        let typ = self.child_node_parser.create_type(Some(operator_node.type_()), ctx, None);
        let derefed = types::deref_type(&typ);

        // Remove readonly modifier from type.
        if operator_node.operator() == Kind::ReadonlyKeyword {
            return derefed;
        }

        if matches!(&*derefed, TypeKind::Array(_)) {
            return types::new(TypeKind::Number);
        }

        let mut key_types = types::get_type_keys(&typ);
        if let TypeKind::Object(object) = &*derefed {
            if has_typed_additional_properties(object) {
                key_types.push(types::new(TypeKind::String { preserve_literals: false }));
                return types::new_union_type(&key_types);
            }
        }
        single_or_union(key_types)
    }
}

/// Whether the object or any of its base types carries a typed index
/// signature. The TypeScript implementation only checks the object's own
/// additionalProperties; since TypeScript 7's lib files moved several index
/// signatures onto base interfaces (for example CSSStyleDeclaration), the
/// inherited case must count too for `keyof` to keep producing `string`.
fn has_typed_additional_properties(object: &types::ObjectType) -> bool {
    if matches!(&object.additional_properties, Some(types::AdditionalProperties::Type(_))) {
        return true;
    }
    for base in &object.base_types {
        if let TypeKind::Object(parent) = &*types::deref_type(base) {
            if has_typed_additional_properties(parent) {
                return true;
            }
        }
    }
    false
}
