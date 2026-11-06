//! Port of Go `tsjg/parser/named_tuple_member_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles named tuple members (src/NodeParser/NamedTupleMemberNodeParser.ts).
pub struct NamedTupleMemberNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<NamedTupleMemberNodeParser> {
    Rc::new(NamedTupleMemberNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for NamedTupleMemberNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::NamedTupleMember
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, reference: Option<&Ty>) -> Ty {
        let member = node.as_named_tuple_member();
        let base_type = self.child_node_parser.create_type(Some(member.type_()), ctx, reference);
        if matches!(&*base_type, TypeKind::Array(_)) && member.dot_dot_dot_token().is_some() {
            return types::new(TypeKind::Rest(types::RestType { ty: base_type, title: member.name().text().to_string() }));
        }
        let mut annotations = types::Annotations::new();
        annotations.insert("title".into(), serde_json::Value::String(member.name().text().to_string()));
        types::new(TypeKind::Annotated(types::AnnotatedType { ty: base_type, annotations, nullable: false }))
    }
}
