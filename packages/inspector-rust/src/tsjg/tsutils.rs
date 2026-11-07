//! Port of Go `internal/tsjg/tsutils`: small helpers over the AST
//! (src/Utils of the TypeScript implementation).

use tsrs_ast::{Kind, Node, Symbol};
use tsrs_core::P;

use super::parser::Chk;

/// The symbol bound to a node (src/Utils/symbolAtNode.ts).
pub fn symbol_at_node(node: P<Node>) -> Option<P<Symbol>> {
    node.symbol()
}

/// Whether the symbol bound to `node` has a JSDoc tag named `tag_name` on any
/// of its declarations (src/Utils/hasJsDocTag.ts).
pub fn has_jsdoc_tag(node: P<Node>, tag_name: &str) -> bool {
    let Some(symbol) = symbol_at_node(node) else { return false };
    for declaration in symbol.declarations() {
        let source_file = tsrs_ast::get_source_file_of_node(*declaration);
        for doc in declaration.jsdoc(source_file.map(|s| s.get())) {
            if jsdoc_has_tag(source_file, *doc, tag_name) {
                return true;
            }
        }
    }
    false
}

fn jsdoc_has_tag(source_file: Option<P<tsrs_ast::SourceFile>>, doc: P<Node>, tag_name: &str) -> bool {
    let jsdoc = doc.as_jsdoc();
    if let Some(tags) = jsdoc.tags() {
        for tag in tags.nodes() {
            if tag.tag_name().text() == tag_name {
                return true;
            }
        }
    }
    // The old TypeScript parser turned `@@tag` into an empty tag followed by a
    // real `tag`; typescript-go drops the construct entirely and leaves it in
    // the comment text (vega-lite relies on `@@hidden`). Rendering the comment
    // is costly, so check the raw source first.
    let Some(source_file) = source_file else { return false };
    let raw = tsrs_scanner::get_source_text_of_node_from_source_file(source_file, doc, true);
    raw.contains("@@") && mentions_double_at_tag(&tsrs_scanner::get_text_of_jsdoc_comment(Some(jsdoc.comment())), tag_name)
}

/// Whether `text` contains `@@tagName` as a whole tag name.
fn mentions_double_at_tag(mut text: &str, tag_name: &str) -> bool {
    let needle = format!("@@{tag_name}");
    while let Some(idx) = text.find(&needle) {
        text = &text[idx + needle.len()..];
        if text.is_empty() || !is_jsdoc_tag_name_char(text.as_bytes()[0]) {
            return true;
        }
    }
    false
}

fn is_jsdoc_tag_name_char(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_' || c == b'-'
}

/// Whether the node carries a @hidden JSDoc tag (src/Utils/isHidden.ts).
pub fn is_node_hidden(node: P<Node>) -> bool {
    has_jsdoc_tag(node, "hidden")
}

/// Whether the node has the given modifier kind (src/Utils/modifiers.ts).
pub fn has_modifier(node: P<Node>, kind: Kind) -> bool {
    node.modifier_nodes().iter().any(|m| m.kind() == kind)
}

/// Public means no private/protected modifier.
pub fn is_public(node: P<Node>) -> bool {
    !(has_modifier(node, Kind::PrivateKeyword) || has_modifier(node, Kind::ProtectedKeyword))
}

pub fn is_static(node: P<Node>) -> bool {
    has_modifier(node, Kind::StaticKeyword)
}

/// A nil-safe wrapper around the checker's GetSymbolAtLocation. The TS
/// resolves the node through getParseTreeNode first and returns undefined for
/// synthesized nodes; replicate that guard.
pub fn get_symbol_at_location(chk: &Chk, node: Option<P<Node>>) -> Option<P<Symbol>> {
    let node = node?;
    if node.kind() != Kind::SourceFile && (node.parent().is_none() || tsrs_ast::get_source_file_of_node(node).is_none()) {
        return None;
    }
    chk.with(|c| c.get_symbol_at_location_exported(node))
}
