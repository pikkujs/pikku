//! Port of Go `tsjg/parser/annotated_node_parser.go`.

use std::rc::Rc;
use std::sync::OnceLock;

use regex::Regex;
use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::annotations_reader::AnnotationsReader;
use super::{Context, SubNodeParser};
use crate::tsjg::types::{self, AnnotatedType, Annotations, Ty, TypeKind};

/// Decorates a child parser with JSDoc annotations (src/NodeParser/AnnotatedNodeParser.ts).
pub struct AnnotatedNodeParser {
    child_node_parser: Rc<dyn SubNodeParser>,
    annotations_reader: Rc<dyn AnnotationsReader>,
}

pub fn new(child_node_parser: Rc<dyn SubNodeParser>, annotations_reader: Rc<dyn AnnotationsReader>) -> Rc<AnnotatedNodeParser> {
    Rc::new(AnnotatedNodeParser { child_node_parser, annotations_reader })
}

/// Matches TypeScript lib declaration files. The upstream pattern matches paths
/// like .../typescript/lib/lib.es5.d.ts; typescript-go serves its bundled libs
/// as bundled:///libs/lib.es5.d.ts, so those are matched as well.
fn lib_file_pattern() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(r"(?i)[/\\]typescript[/\\]lib[/\\]lib\.[^/\\]+\.d\.ts$|^bundled:///libs/lib\.[^/]+\.d\.ts$").unwrap()
    })
}

fn annotated(ty: Ty, annotations: Annotations, nullable: bool) -> Ty {
    types::new(TypeKind::Annotated(AnnotatedType { ty, annotations, nullable }))
}

impl SubNodeParser for AnnotatedNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        self.child_node_parser.supports_node(node)
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, reference: Option<&Ty>) -> Ty {
        let annotated_node = get_annotated_node(node);
        let mut annotations = self.annotations_reader.get_annotations(annotated_node);
        let nullable = self.annotations_reader.is_nullable(annotated_node);

        // Short-circuit parsing the underlying type if an explicit ref annotation was passed.
        if let Some(a) = &annotations {
            if a.contains_key("$ref") {
                return annotated(types::new(TypeKind::Any), a.clone(), nullable);
            }
        }

        let base_type = self.child_node_parser.create_type(node, ctx, reference);

        // Don't return annotations for lib types such as Exclude.
        // Sourceless nodes may not have a fileName, just ignore them.
        if let Some(source) = tsrs_ast::get_source_file_of_node(node) {
            if lib_file_pattern().is_match(source.file_name()) {
                let mut special_case = false;

                // Special case for Exclude<T, U>: use the annotation of T.
                if node.kind() == Kind::TypeAliasDeclaration && node.as_type_alias_declaration().name().text() == "Exclude" {
                    let mut t = ctx.get_argument("T");

                    // Handle optional properties.
                    if let Some(TypeKind::Union(u)) = t.as_deref() {
                        t = Some(types::remove_undefined(u).1);
                    }

                    if let Some(TypeKind::Definition(d)) = t.as_deref() {
                        t = Some(d.ty.clone());
                    }

                    if let Some(TypeKind::Annotated(a)) = t.as_deref() {
                        annotations = Some(a.annotations.clone());
                        special_case = true;
                    }
                }

                if !special_case {
                    return base_type;
                }
            }
        }

        match annotations {
            None if !nullable => base_type,
            None => annotated(base_type, Annotations::new(), nullable),
            Some(a) => annotated(base_type, a, nullable),
        }
    }
}

/// Hops one level to the parent when the parent is the declaration carrying
/// the JSDoc (property, index signature, or parameter).
fn get_annotated_node(node: P<Node>) -> P<Node> {
    let Some(parent) = node.parent() else { return node };
    match parent.kind() {
        Kind::PropertySignature | Kind::PropertyDeclaration | Kind::IndexSignature | Kind::Parameter => parent,
        _ => node,
    }
}
