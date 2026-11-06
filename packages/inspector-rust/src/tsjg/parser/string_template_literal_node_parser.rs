//! Port of Go `tsjg/parser/string_template_literal_node_parser.go`.

use std::rc::Rc;

use serde_json::Value;
use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::*;
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::types::{self, Ty, TypeKind};

/// Handles no-substitution template literals and template literal types,
/// expanding the cartesian product of the literal values of all spans
/// (src/NodeParser/StringTemplateLiteralNodeParser.ts).
pub struct StringTemplateLiteralNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>) -> Rc<StringTemplateLiteralNodeParser> {
    Rc::new(StringTemplateLiteralNodeParser { child_node_parser })
}

impl SubNodeParser for StringTemplateLiteralNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::NoSubstitutionTemplateLiteral || node.kind() == Kind::TemplateLiteralType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let lit = |s: String| types::new(TypeKind::Literal(types::LiteralType { value: Value::String(s) }));
        if node.kind() == Kind::NoSubstitutionTemplateLiteral {
            return lit(node.text().to_string());
        }
        let template = node.as_template_literal_type_node();
        let prefix = template.head().text().to_string();
        let mut matrix: Vec<Vec<String>> = vec![vec![prefix]];
        for span in template.template_spans().nodes() {
            let type_span = span.as_template_literal_type_span();
            let suffix = type_span.literal().text().to_string();
            let typ = self.child_node_parser.create_type(Some(type_span.type_()), ctx, None);
            let Some(literals) = try_extract_literals(&typ) else {
                // A span whose type is not literal-expandable (e.g. `${string}`)
                // degrades the whole template to a plain string. This mirrors
                // catching UnknownTypeError in the TypeScript implementation.
                return types::new(TypeKind::String { preserve_literals: false });
            };
            matrix.push(literals.into_iter().map(|v| v + &suffix).collect());
        }
        let expanded: Vec<Ty> = expand_template_matrix(&matrix).into_iter().map(lit).collect();
        single_or_union(expanded)
    }
}

/// The literal expansions of a type, None for types that are not literal
/// (types::extract_literals without the failure).
fn try_extract_literals(t: &Ty) -> Option<Vec<String>> {
    let mut out = Vec::new();
    extract(t, &mut out).then_some(out)
}

fn extract(t: &Ty, out: &mut Vec<String>) -> bool {
    match &*types::deref_annotated_type(t) {
        TypeKind::Literal(l) => out.push(types::js_value_to_string(&l.value)),
        TypeKind::Union(u) => return u.types().iter().all(|m| extract(m, out)),
        TypeKind::Enum(e) => return e.types.iter().all(|m| extract(m, out)),
        TypeKind::Alias(a) => return extract(&a.ty, out),
        TypeKind::Definition(a) => return extract(&a.ty, out),
        TypeKind::Boolean => {
            out.push("true".into());
            out.push("false".into());
        }
        _ => return false,
    }
    true
}

/// The cartesian product of the matrix rows, leftmost row varying slowest.
fn expand_template_matrix(matrix: &[Vec<String>]) -> Vec<String> {
    if matrix.len() == 1 {
        return matrix[0].clone();
    }
    let nested = expand_template_matrix(&matrix[1..]);
    let mut combined = Vec::with_capacity(matrix[0].len() * nested.len());
    for prefix in &matrix[0] {
        for suffix in &nested {
            combined.push(format!("{prefix}{suffix}"));
        }
    }
    combined
}
