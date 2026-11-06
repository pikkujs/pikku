//! Port of Go `tsjg/parser/intersection_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles intersection types (src/NodeParser/IntersectionNodeParser.ts).
pub struct IntersectionNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<IntersectionNodeParser> {
    Rc::new(IntersectionNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for IntersectionNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::IntersectionType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let member_types = create_types(&self.child_node_parser, node.as_intersection_type_node().types().nodes(), ctx);
        // If any type is never, the intersection type resolves to never.
        if member_types.iter().any(types::is_never_like) {
            return types::new(TypeKind::Never);
        }
        // Handle autocomplete hacks like `string & {}`.
        if member_types.len() == 2 && (is_empty_object(&member_types[0]) || is_empty_object(&member_types[1])) {
            for typ in &member_types {
                if matches!(&**typ, TypeKind::String { .. }) {
                    return types::new(TypeKind::String { preserve_literals: true });
                }
            }
            let non_object = member_types.iter().find(|t| !is_empty_object(t));
            if let Some(non_object) = non_object {
                match &**non_object {
                    TypeKind::Literal(_) => return non_object.clone(),
                    TypeKind::Union(u) if types::is_literal_union(u) => return non_object.clone(),
                    _ => {}
                }
            }
        }
        types::translate(&member_types)
    }
}

fn is_empty_object(x: &Ty) -> bool {
    let d = types::deref_type(x);
    let TypeKind::Object(object) = &*d else { return false };
    matches!(&object.additional_properties, None | Some(types::AdditionalProperties::Bool(false))) && object.properties.is_empty()
}
