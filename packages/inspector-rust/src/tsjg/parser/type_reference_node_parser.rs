//! Port of Go `tsjg/parser/type_reference_node_parser.go`: type references
//! (src/NodeParser/TypeReferenceNodeParser.ts).

use std::rc::Rc;

use serde_json::{Map, Value};
use tsrs_ast::{Kind, Node, SymbolFlags};
use tsrs_core::P;

use super::shared::{SynthesizedSymbols, new_type_argument_context};
use super::{Chk, Context, NodeParser, SubNodeParser, unknown_node_error};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Annotations, Ty, TypeKind};

/// Declaration kinds skipped when picking a symbol's declaration
/// (src/NodeParser/TypeReferenceNodeParser.ts).
fn is_invalid_type(kind: Kind) -> bool {
    matches!(kind, Kind::ModuleDeclaration | Kind::VariableDeclaration)
}

pub fn first_valid_declaration(declarations: &[P<Node>]) -> Option<P<Node>> {
    declarations.iter().find(|d| !is_invalid_type(d.kind())).copied()
}

pub struct TypeReferenceNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
    synth: Rc<SynthesizedSymbols>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>, synth: Rc<SynthesizedSymbols>) -> Rc<TypeReferenceNodeParser> {
    Rc::new(TypeReferenceNodeParser { type_checker, child_node_parser, synth })
}

fn format_annotation(format: &str) -> Ty {
    let mut a: Annotations = Map::new();
    a.insert("format".into(), Value::String(format.into()));
    types::new(TypeKind::Annotated(types::AnnotatedType {
        ty: types::new(TypeKind::String { preserve_literals: false }),
        annotations: a,
        nullable: false,
    }))
}

impl SubNodeParser for TypeReferenceNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::TypeReference
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let type_name = node.as_type_reference_node().type_name();

        let mut type_symbol = tsutils::get_symbol_at_location(&self.type_checker, Some(type_name));
        if type_symbol.is_none() {
            // When the node doesn't have a valid source file, its position is
            // -1, so we can't search for a symbol based on its location. In
            // that case, the nodebuilder records the symbol in the
            // synthesized-symbol registry (the TypeScript factory sets
            // node.symbol instead).
            type_symbol = tsutils::symbol_at_node(type_name);
            if type_symbol.is_none() {
                type_symbol = self.synth.lookup(type_name);
            }
        }
        let Some(type_symbol) = type_symbol else { unknown_node_error(Some(node)) };

        if type_symbol.flags().intersects(SymbolFlags::Alias) {
            let aliased_symbol = self.type_checker.with(|c| c.get_aliased_symbol(type_symbol));

            let declaration = first_valid_declaration(aliased_symbol.declarations());
            let Some(declaration) = declaration else {
                // fallback for bun.sh
                return types::new(TypeKind::Any);
            };

            return self.child_node_parser.create_type(
                Some(declaration),
                &new_type_argument_context(&self.child_node_parser, node, ctx),
                None,
            );
        }

        if type_symbol.flags().intersects(SymbolFlags::TypeParameter) {
            if let Some(argument) = ctx.get_argument(type_symbol.name()) {
                return argument;
            }
            return types::new(TypeKind::Unknown { errored_source: true });
        }

        // Wraps promise type to avoid resolving to an empty Object type.
        if type_symbol.name() == "Promise" || type_symbol.name() == "PromiseLike" {
            let type_arguments = node.type_arguments();

            // Promise without type resolves to Promise<any>.
            if type_arguments.is_empty() {
                return types::new(TypeKind::Any);
            }

            return self.child_node_parser.create_type(Some(type_arguments[0]), ctx, None);
        }

        if type_symbol.name() == "Array" || type_symbol.name() == "ReadonlyArray" {
            let arguments = new_type_argument_context(&self.child_node_parser, node, ctx).arguments();
            return match arguments.first() {
                Some(Some(item)) => types::new(TypeKind::Array(types::ArrayType { item: item.clone() })),
                _ => types::new(TypeKind::Any),
            };
        }

        match type_symbol.name() {
            "Date" => return format_annotation("date-time"),
            "RegExp" => return format_annotation("regex"),
            "URL" => return format_annotation("uri"),
            _ => {}
        }

        self.child_node_parser.create_type(
            first_valid_declaration(type_symbol.declarations()),
            &new_type_argument_context(&self.child_node_parser, node, ctx),
            None,
        )
    }
}
