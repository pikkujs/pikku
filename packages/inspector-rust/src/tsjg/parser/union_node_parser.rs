//! Port of Go `tsjg/parser/union_node_parser.go`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles union types (src/NodeParser/UnionNodeParser.ts).
pub struct UnionNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<UnionNodeParser> {
    Rc::new(UnionNodeParser { child_node_parser })
}

#[allow(unused_variables)]
impl SubNodeParser for UnionNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::UnionType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let mut member_types = Vec::new();
        for subnode in node.as_union_type_node().types().nodes() {
            let typ = self.child_node_parser.create_type(Some(*subnode), ctx, None);
            if types::not_never(&typ) {
                member_types.push(typ);
            }
        }
        if member_types.len() == 1 {
            return member_types.remove(0);
        } else if member_types.is_empty() {
            return types::new(TypeKind::Never);
        }
        types::new_union_type(&member_types)
    }
}
