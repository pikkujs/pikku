//! Port of Go `tsjg/parser/full_description.go`.

use std::sync::OnceLock;

use regex::Regex;
use tsrs_ast::{Kind, Node};
use tsrs_core::P;

/// The raw JSDoc comment text of a node with the comment markers and leading
/// stars stripped (src/Utils/getFullDescription.ts). "" when the node has no JSDoc.
pub fn get_full_description(node: P<Node>) -> String {
    let Some(source_file) = tsrs_ast::get_source_file_of_node(node) else { return String::new() };
    let js_doc_nodes = js_doc_comments_of(node);
    if js_doc_nodes.is_empty() {
        return String::new();
    }
    let mut raw_text = String::new();
    for js_doc in js_doc_nodes {
        // getFullText: node text including leading trivia.
        raw_text.push_str(&tsrs_scanner::get_source_text_of_node_from_source_file(source_file, js_doc, true));
        raw_text.push('\n');
    }
    get_text_without_stars(raw_text.trim()).trim().to_string()
}

/// The JSDoc comment nodes applying to a node, walking the JSDoc comment
/// location chain like ts.getJSDocCommentsAndTags.
fn js_doc_comments_of(node: P<Node>) -> Vec<P<Node>> {
    let mut result = Vec::new();
    let mut current = Some(node);
    while let Some(c) = current {
        if c.parent().is_none() {
            break;
        }
        result.extend_from_slice(c.jsdoc(None));
        if c.kind() == Kind::Parameter || c.kind() == Kind::TypeParameter {
            break;
        }
        current = tsrs_ast::get_next_jsdoc_comment_location(c);
    }
    result
}

fn open_pattern() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^/\*\*[^\S\n]*\n?").unwrap())
}

fn close_pattern() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(\r?\n)?[^\S\n]*\*/$").unwrap())
}

fn get_text_without_stars(input_text: &str) -> String {
    let opened = open_pattern().replace_all(input_text, "");
    let inner = close_pattern().replace_all(&opened, "");
    let lines: Vec<String> = inner
        .split('\n')
        .map(|line| {
            let trimmed = line.trim_start();
            if !trimmed.starts_with('*') {
                return line.to_string();
            }
            let start = if trimmed.len() > 1 && trimmed.as_bytes()[1] == b' ' { 2 } else { 1 };
            trimmed[start..].to_string()
        })
        .collect();
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_comment_markers_and_stars() {
        let doc = "/**\n * Hello\n *   indented\n *\n * World\n */";
        assert_eq!(get_text_without_stars(doc).trim(), "Hello\n  indented\n\nWorld");
    }
}
