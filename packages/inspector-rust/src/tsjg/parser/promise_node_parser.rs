//! Port of Go `tsjg/parser/promise_node_parser.go`: unwraps Promise<T>
//! (src/NodeParser/PromiseNodeParser.ts).
//!
//! It must be registered before the InterfaceDeclaration, ClassDeclaration,
//! ExpressionWithTypeArguments and TypeAliasDeclaration parsers (the chain
//! wiring is responsible for that).

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::{NODE_BUILDER_FLAGS_IGNORE_ERRORS, SynthesizedSymbols, node_text};
use super::{Chk, Context, NodeParser, SubNodeParser, describe_node, get_node_key};
use crate::tsjg::fail;
use crate::tsjg::types::{self, Ty, TypeKind};
use crate::tsjg::typenode::type_to_type_node;

pub struct PromiseNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
    synth: Rc<SynthesizedSymbols>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>, synth: Rc<SynthesizedSymbols>) -> Rc<PromiseNodeParser> {
    Rc::new(PromiseNodeParser { type_checker, child_node_parser, synth })
}

impl SubNodeParser for PromiseNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        if !matches!(
            node.kind(),
            Kind::InterfaceDeclaration // interface PromiseInterface extends Promise<T>
                | Kind::ClassDeclaration // class PromiseClass implements Promise<T>
                | Kind::ExpressionWithTypeArguments // Promise<T> in a heritage clause
                | Kind::TypeAliasDeclaration // type PromiseAlias = Promise<T>
        ) {
            return false;
        }

        let t = self.type_checker.with(|c| c.get_type_at_location(node));
        let awaited_type = self.type_checker.with(|c| c.get_awaited_type_exported(t));

        // Ignore non-awaitable types.
        let Some(awaited_type) = awaited_type else { return false };

        // If the awaited type differs from the original type, the type extends
        // promise: Awaited<Promise<T>> -> T (Promise<T> !== T);
        // Awaited<Y> -> Y (Y === Y).
        if awaited_type == t {
            return false;
        }

        // In types like: A<T> = T, type C = A<1>, C has the same type as A<1>
        // and 1; the awaited type is not the same reference as the type, so an
        // assignability check is needed.
        self.type_checker.with(|c| !c.is_type_assignable_to(t, awaited_type) && !c.is_type_assignable_to(awaited_type, t))
    }

    fn create_type(&self, node: P<Node>, context: &Context, _reference: Option<&Ty>) -> Ty {
        let t = self.type_checker.with(|c| c.get_type_at_location(node));
        let Some(awaited_type) = self.type_checker.with(|c| c.get_awaited_type_exported(t)) else {
            fail("nil pointer dereference")
        };
        let Some(awaited_node) =
            type_to_type_node(&self.type_checker, awaited_type, None, NODE_BUILDER_FLAGS_IGNORE_ERRORS, &self.synth)
        else {
            fail(&format!("could not find awaited node {}", describe_node(Some(node))))
        };

        // A fresh context: type arguments are not propagated.
        let base_node = self.child_node_parser.create_type(Some(awaited_node), &Context::new(Some(node)), None);

        let name = self.get_node_name(node);

        // Nodes without a name should just be their awaited type:
        // export class extends Promise<T> {} -> T
        // export class A extends Promise<T> {} -> A (ref to T)
        if name.is_empty() {
            return base_node;
        }

        types::new_definition_type(
            name,
            types::new(TypeKind::Alias(types::AliasType { id: format!("promise-{}", get_node_key(node, context)), ty: base_node })),
        )
    }
}

impl PromiseNodeParser {
    fn get_node_name(&self, node: P<Node>) -> String {
        if node.kind() == Kind::ExpressionWithTypeArguments {
            let parent = node.parent();
            match parent {
                Some(p) if p.kind() == Kind::HeritageClause => {
                    if let Some(name) = p.parent().and_then(|pp| pp.name()) {
                        return node_text(name);
                    }
                    return String::new();
                }
                _ => fail(&format!("expected ExpressionWithTypeArguments to have a HeritageClause parent {}", describe_node(parent))),
            }
        }
        if let Some(name) = node.name() {
            return node_text(name);
        }
        String::new()
    }
}
