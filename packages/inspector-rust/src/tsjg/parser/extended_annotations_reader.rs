//! Port of Go `tsjg/parser/extended_annotations_reader.go`.

use std::collections::HashSet;
use std::rc::Rc;

use serde_json::Value;
use tsrs_ast::{Kind, Node, NodeFlags, NodeList, Symbol};
use tsrs_core::P;

use super::annotations_reader::{AnnotationsReader, JsDocTagInfo, symbol_jsdoc_tags};
use super::basic_annotations_reader::BasicAnnotationsReader;
use super::full_description::get_full_description;
use super::json5::parse_json5;
use super::Chk;
use crate::tsjg::tsutils;
use crate::tsjg::types::Annotations;

/// Adds descriptions, @asType, @example, and @nullable support on top of the
/// basic reader (src/AnnotationsReader/ExtendedAnnotationsReader.ts).
pub struct ExtendedAnnotationsReader {
    basic: BasicAnnotationsReader,
    type_checker: Chk,
    markdown_description: bool,
    full_description: bool,
}

pub fn new(
    type_checker: Chk,
    extra_tags: HashSet<String>,
    markdown_description: bool,
    full_description: bool,
) -> Rc<ExtendedAnnotationsReader> {
    Rc::new(ExtendedAnnotationsReader {
        basic: BasicAnnotationsReader::new(extra_tags),
        type_checker,
        markdown_description,
        full_description,
    })
}

impl AnnotationsReader for ExtendedAnnotationsReader {
    fn get_annotations(&self, node: P<Node>) -> Option<Annotations> {
        let js_doc_tags = symbol_jsdoc_tags(node);
        let mut annotations = Annotations::new();
        merge(&mut annotations, self.description_annotation(node));
        merge(&mut annotations, type_annotation(&js_doc_tags));
        merge(&mut annotations, example_annotation(&js_doc_tags));
        merge(&mut annotations, self.basic.annotations_from_tags(&js_doc_tags));
        if annotations.is_empty() { None } else { Some(annotations) }
    }

    /// Whether the node's symbol carries a @nullable JSDoc tag.
    fn is_nullable(&self, node: P<Node>) -> bool {
        symbol_jsdoc_tags(node).iter().any(|t| t.name == "nullable")
    }
}

fn merge(dst: &mut Annotations, src: Option<Annotations>) {
    if let Some(src) = src {
        for (k, v) in src {
            dst.insert(k, v);
        }
    }
}

fn sym_id(s: &P<Symbol>) -> usize {
    &**s as *const Symbol as usize
}

impl ExtendedAnnotationsReader {
    fn description_annotation(&self, node: P<Node>) -> Option<Annotations> {
        let symbol = tsutils::symbol_at_node(node)?;
        let mut annotations = Annotations::new();

        let comment = self.symbol_documentation_comment_with_inheritance(symbol, &mut HashSet::new());
        if !comment.is_empty() {
            let markdown_description = comment.replace('\r', "").trim().to_string();
            annotations.insert(
                "description".into(),
                Value::String(collapse_single_newlines(&markdown_description).trim().to_string()),
            );
            if self.markdown_description {
                annotations.insert("markdownDescription".into(), Value::String(markdown_description));
            }
        }

        if self.full_description {
            let full = get_full_description(node).trim().to_string();
            if !full.is_empty() {
                annotations.insert("fullDescription".into(), Value::String(full));
            }
        }

        if annotations.is_empty() { None } else { Some(annotations) }
    }

    /// Falls back to the documentation of the same-named member on base types
    /// when a class or interface member has no documentation of its own,
    /// mirroring the inherited-docs behavior of TypeScript's services-layer
    /// getDocumentationComment.
    fn symbol_documentation_comment_with_inheritance(&self, symbol: P<Symbol>, seen: &mut HashSet<usize>) -> String {
        if !seen.insert(sym_id(&symbol)) {
            return String::new();
        }
        let comment = symbol_documentation_comment(symbol);
        if !comment.is_empty() {
            return comment;
        }
        for decl in symbol.declarations() {
            if !matches!(
                decl.kind(),
                Kind::PropertySignature | Kind::PropertyDeclaration | Kind::MethodSignature | Kind::MethodDeclaration
            ) {
                continue;
            }
            let Some(owner) = decl.parent() else { continue };
            if owner.kind() != Kind::InterfaceDeclaration && owner.kind() != Kind::ClassDeclaration {
                continue;
            }
            let Some(name) = tsrs_ast::get_name_of_declaration(*decl) else { continue };
            for heritage in heritage_clauses_of(owner) {
                for base_expr in heritage.as_heritage_clause().types().nodes() {
                    let base_type = self.type_checker.with(|c| c.get_type_at_location(*base_expr));
                    let base_prop = self.type_checker.with(|c| c.get_property_of_type(base_type, name.text()));
                    let Some(base_prop) = base_prop else { continue };
                    let comment = self.symbol_documentation_comment_with_inheritance(base_prop, seen);
                    if !comment.is_empty() {
                        return comment;
                    }
                }
            }
        }
        String::new()
    }
}

fn heritage_clauses_of(node: P<Node>) -> Vec<P<Node>> {
    let list = match node.kind() {
        Kind::InterfaceDeclaration => node.as_interface_declaration().heritage_clauses(),
        Kind::ClassDeclaration => node.as_class_declaration().heritage_clauses(),
        _ => None,
    };
    list.map(|l| l.nodes().to_vec()).unwrap_or_default()
}

fn type_annotation(tags: &[JsDocTagInfo]) -> Option<Annotations> {
    let tag = tags.iter().find(|t| t.name == "asType")?;
    let mut a = Annotations::new();
    a.insert("type".into(), Value::String(tag.text.clone()));
    Some(a)
}

/// Examples from the @example JSDoc tag. See https://tsdoc.org/pages/tags/example/
fn example_annotation(tags: &[JsDocTagInfo]) -> Option<Annotations> {
    let mut examples = Vec::new();
    for tag in tags {
        if tag.name != "example" {
            continue;
        }
        // Ignore examples which don't parse to valid JSON.
        if let Ok(parsed) = parse_json5(&tag.text) {
            examples.push(parsed);
        }
    }
    if examples.is_empty() {
        return None;
    }
    let mut a = Annotations::new();
    a.insert("examples".into(), Value::Array(examples));
    Some(a)
}

/// Replaces a newline with a space when it is preceded by a non-newline and
/// followed by a character other than '\n', '*', or '-', mirroring the
/// TypeScript regex /(?<=[^\n])\n(?=[^\n*-])/g.
fn collapse_single_newlines(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    for i in 0..b.len() {
        let c = b[i];
        if c == b'\n' && i > 0 && b[i - 1] != b'\n' && i + 1 < b.len() {
            let next = b[i + 1];
            if next != b'\n' && next != b'*' && next != b'-' {
                out.push(b' ');
                continue;
            }
        }
        out.push(c);
    }
    String::from_utf8(out).expect("only ASCII bytes replaced")
}

/// A symbol's documentation comment as plain text, mirroring TypeScript's
/// symbol.getDocumentationComment (ported from typescript-go's
/// ls.GetSymbolDocumentationComment): comments are gathered from each unique
/// declaration, deduplicated, and joined with line breaks.
fn symbol_documentation_comment(symbol: P<Symbol>) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    for decl in symbol.declarations() {
        if !seen.insert(&**decl as *const Node as usize) {
            continue;
        }
        let doc = declaration_documentation_comment(*decl);
        if !doc.is_empty() && !parts.contains(&doc) {
            parts.push(doc);
        }
    }
    parts.join("\n")
}

/// The summary text of the JSDoc comment attached to a declaration, walking
/// the JSDoc comment location chain (e.g. from a variable declaration up to
/// its statement).
fn declaration_documentation_comment(node: P<Node>) -> String {
    if node.flags().intersects(NodeFlags::JSDoc) {
        return String::new();
    }
    // Parameter symbols document themselves through the enclosing signature's
    // @param tags (TypeScript's symbol.getDocumentationComment does the same
    // through getJSDocParameterTags).
    if node.kind() == Kind::Parameter {
        return parameter_documentation_comment(node);
    }
    let mut current = Some(node);
    while let Some(c) = current {
        let jsdocs = c.jsdoc(None);
        if let Some(last) = jsdocs.last() {
            return render_jsdoc_comment(Some(last.as_jsdoc().comment()));
        }
        current = tsrs_ast::get_next_jsdoc_comment_location(c);
    }
    String::new()
}

/// Renders a JSDoc comment node list the way TypeScript's
/// getDocumentationComment display parts render, joined with single spaces.
/// Links are expanded following services buildLinkParts.
fn render_jsdoc_comment(comment: Option<tsrs_core::P<NodeList>>) -> String {
    let Some(comment) = comment else { return String::new() };
    let mut parts: Vec<String> = Vec::new();
    for n in comment.nodes() {
        match n.kind() {
            Kind::JSDocText => parts.push(n.text().to_string()),
            Kind::JSDocLink | Kind::JSDocLinkCode | Kind::JSDocLinkPlain => parts.extend(link_parts(*n)),
            _ => {}
        }
    }
    parts.join(" ").trim_end().to_string()
}

fn link_parts(link: P<Node>) -> Vec<String> {
    let prefix = match link.kind() {
        Kind::JSDocLinkCode => "linkcode",
        Kind::JSDocLinkPlain => "linkplain",
        _ => "link",
    };
    let mut parts = vec![format!("{{@{prefix} ")];
    let name = link_name(link);
    let text = link.text();
    match name {
        None => {
            if !text.is_empty() {
                parts.push(text.to_string());
            }
        }
        Some(name) => {
            let suffix = find_link_name_end(text);
            let full_name = format!("{}{}", tsrs_scanner::get_text_of_node(name), &text[..suffix]);
            let rest = skip_separator_from_link_text(&text[suffix..]);
            let mut separator = "";
            if suffix == 0 || (suffix < text.len() && text.as_bytes()[suffix] == b'|' && !full_name.ends_with(' ')) {
                separator = " ";
            }
            parts.push(format!("{full_name}{separator}{rest}"));
        }
    }
    parts.push("}".into());
    parts
}

fn link_name(link: P<Node>) -> Option<P<Node>> {
    match link.kind() {
        Kind::JSDocLink => link.as_jsdoc_link().name(),
        Kind::JSDocLinkCode => link.as_jsdoc_link_code().name(),
        _ => link.as_jsdoc_link_plain().name(),
    }
}

fn skip_separator_from_link_text(text: &str) -> &str {
    match text.strip_prefix('|') {
        Some(rest) => rest.trim_start_matches(' '),
        None => text,
    }
}

fn find_link_name_end(text: &str) -> usize {
    if text.starts_with("://") {
        return text.find('|').unwrap_or(text.len());
    }
    if text.starts_with("()") {
        return 2;
    }
    if text.starts_with('<') {
        let mut brackets = 0i32;
        for (i, c) in text.bytes().enumerate() {
            if c == b'<' {
                brackets += 1;
            }
            if c == b'>' {
                brackets -= 1;
            }
            if brackets == 0 {
                return i + 1;
            }
        }
    }
    0
}

/// The comment of the enclosing signature's @param tag matching the
/// parameter's name, if any.
fn parameter_documentation_comment(param: P<Node>) -> String {
    let Some(name) = tsrs_ast::get_name_of_declaration(param) else { return String::new() };
    if name.kind() != Kind::Identifier {
        return String::new();
    }
    let Some(host) = param.parent() else { return String::new() };
    let mut current = Some(host);
    while let Some(c) = current {
        for doc in c.jsdoc(None) {
            let Some(tags) = doc.as_jsdoc().tags() else { continue };
            for tag in tags.nodes() {
                if tag.kind() != Kind::JSDocParameterTag {
                    continue;
                }
                let param_tag = tag.as_jsdoc_parameter_or_property_tag();
                let tag_name_node = param_tag.name();
                if tag_name_node.kind() != Kind::Identifier {
                    continue;
                }
                if tag_name_node.text() == name.text() {
                    return render_jsdoc_comment(tag.comment_list());
                }
            }
        }
        current = tsrs_ast::get_next_jsdoc_comment_location(c);
    }
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapses_single_newlines_only() {
        assert_eq!(collapse_single_newlines("a\nb"), "a b");
        assert_eq!(collapse_single_newlines("a\n\nb"), "a\n\nb");
        assert_eq!(collapse_single_newlines("a\n* b\n- c"), "a\n* b\n- c");
    }

    #[test]
    fn link_name_end() {
        assert_eq!(find_link_name_end("://x|y"), 4);
        assert_eq!(find_link_name_end("()"), 2);
        assert_eq!(find_link_name_end("abc"), 0);
    }
}
