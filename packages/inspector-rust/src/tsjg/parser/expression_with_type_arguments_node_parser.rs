//! Port of Go `tsjg/parser/expression_with_type_arguments_node_parser.go`:
//! heritage-clause entries like `extends Foo<T>`.

use std::rc::Rc;

use tsrs_ast::{Kind, Node, SymbolFlags};
use tsrs_core::P;

use super::import_type_node_parser::first_declaration;
use super::shared::new_type_argument_context;
use super::{Chk, Context, NodeParser, SubNodeParser};
use crate::tsjg::fail;
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TypeKind};

/// tsrs parses the `extends` elements of an interface as type references where
/// typescript-go has ExpressionWithTypeArguments; both go through this parser,
/// as in Go.
pub fn is_heritage_type_reference(node: P<Node>) -> bool {
    node.kind() == Kind::TypeReference && node.parent().is_some_and(|p| p.kind() == Kind::HeritageClause)
}

pub struct ExpressionWithTypeArgumentsNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>) -> Rc<ExpressionWithTypeArgumentsNodeParser> {
    Rc::new(ExpressionWithTypeArgumentsNodeParser { type_checker, child_node_parser })
}

impl SubNodeParser for ExpressionWithTypeArgumentsNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::ExpressionWithTypeArguments || is_heritage_type_reference(node)
    }

    /// May return a nil type for a type parameter without an argument (unlike
    /// TypeReferenceNodeParser, which falls back to an errored UnknownType): the
    /// Rust trait cannot return nil, so that case fails like the chain's
    /// "unknown node" error the Go chain would raise for the nil result.
    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let Some(type_symbol) =
            tsutils::get_symbol_at_location(&self.type_checker, Some(tsrs_ast::get_heritage_clause_element_name(node)))
        else {
            fail("nil pointer dereference")
        };
        if type_symbol.flags().intersects(SymbolFlags::Alias) {
            let aliased = self.type_checker.with(|c| c.get_aliased_symbol(type_symbol));
            if aliased.declarations().is_empty() {
                // An import that does not resolve has no declaration (Go guards this since 1f8f4546f).
                return types::new(TypeKind::Any);
            }
            return self.child_node_parser.create_type(
                Some(first_declaration(&aliased)),
                &new_type_argument_context(&self.child_node_parser, node, ctx),
                None,
            );
        } else if type_symbol.flags().intersects(SymbolFlags::TypeParameter) {
            match ctx.get_argument(type_symbol.name()) {
                Some(t) => return t,
                None => super::unknown_node_error(Some(node)),
            }
        }
        if type_symbol.declarations().is_empty() {
            return types::new(TypeKind::Any);
        }
        self.child_node_parser.create_type(
            Some(first_declaration(&type_symbol)),
            &new_type_argument_context(&self.child_node_parser, node, ctx),
            None,
        )
    }
}
