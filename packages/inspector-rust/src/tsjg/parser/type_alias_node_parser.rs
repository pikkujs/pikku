//! Port of Go `tsjg/parser/type_alias_node_parser.go` (src/NodeParser/TypeAliasNodeParser.ts).

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::push_type_parameters;
use super::{Chk, Context, NodeParser, SubNodeParser, get_node_key, join_types};
use crate::tsjg::types::{self, Ty, TypeKind};

pub struct TypeAliasNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>) -> Rc<TypeAliasNodeParser> {
    Rc::new(TypeAliasNodeParser { type_checker, child_node_parser })
}

impl SubNodeParser for TypeAliasNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::TypeAliasDeclaration
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, reference: Option<&Ty>) -> Ty {
        push_type_parameters(&self.type_checker, &self.child_node_parser, node, ctx);

        let id = self.get_type_id(node, ctx);
        let name = self.get_type_name(node, ctx);
        if let Some(r) = reference {
            if let TypeKind::Reference(r) = &**r {
                r.set_id(id.clone());
                r.set_name(name);
            }
        }

        let typ = self.child_node_parser.create_type(node.as_type_alias_declaration().type_(), ctx, None);
        if types::is_never_like(&typ) {
            return types::new(TypeKind::Never);
        }
        types::new(TypeKind::Alias(types::AliasType { id, ty: typ }))
    }
}

impl TypeAliasNodeParser {
    fn get_type_id(&self, node: P<Node>, ctx: &Context) -> String {
        format!("alias-{}", get_node_key(node, ctx))
    }

    fn get_type_name(&self, node: P<Node>, ctx: &Context) -> String {
        let arguments = ctx.arguments();
        let full_name = tsrs_scanner::get_text_of_node(node.as_type_alias_declaration().name());
        if arguments.is_empty() {
            return full_name;
        }
        format!("{full_name}<{}>", join_types(&arguments, |t| t.name()))
    }
}
