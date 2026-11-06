//! Port of Go `tsjg/parser/annotations_reader.go`.

use tsrs_ast::{Kind, Node, NodeFlags};
use tsrs_core::P;

use crate::tsjg::tsutils;
use crate::tsjg::types::Annotations;

/// Extracts JSDoc annotations from a node (src/AnnotationsReader.ts). None
/// means no annotations.
///
/// `is_nullable` replaces Go's `p.annotationsReader.(*ExtendedAnnotationsReader)`
/// type assertion in AnnotatedNodeParser: only the extended reader overrides it.
pub trait AnnotationsReader {
    fn get_annotations(&self, node: P<Node>) -> Option<Annotations>;
    fn is_nullable(&self, _node: P<Node>) -> bool {
        false
    }
}

/// ts.JSDocTagInfo with the tag text collapsed to a plain string.
#[derive(Clone, Debug)]
pub struct JsDocTagInfo {
    pub name: String,
    pub text: String,
}

/// The JSDoc tags of the symbol bound to `node` over all of its declarations,
/// mirroring TypeScript's symbol.getJsDocTags() (ported from typescript-go's
/// ls.GetSymbolJSDocTags).
pub fn symbol_jsdoc_tags(node: P<Node>) -> Vec<JsDocTagInfo> {
    let Some(symbol) = tsutils::symbol_at_node(node) else { return Vec::new() };
    let mut infos = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for decl in symbol.declarations() {
        if !seen.insert(&**decl as *const Node as usize) {
            continue;
        }
        let tags = declaration_jsdoc_tags(*decl);
        // Skip comments containing @typedef/@callback since they're not
        // associated with a particular declaration, unless they also carry
        // @param/@return (treated as local docs).
        let mut has_typedef = false;
        let mut has_param_or_return = false;
        for tag in &tags {
            match tag.kind() {
                Kind::JSDocTypedefTag | Kind::JSDocCallbackTag => has_typedef = true,
                Kind::JSDocParameterTag | Kind::JSDocReturnTag => has_param_or_return = true,
                _ => {}
            }
        }
        if has_typedef && !has_param_or_return {
            continue;
        }
        for tag in tags {
            infos.push(JsDocTagInfo {
                name: tag.tag_name().text().to_string(),
                text: tsrs_scanner::get_text_of_jsdoc_comment(tag.comment_list()),
            });
        }
    }
    infos
}

/// The JSDoc tags associated with a declaration, walking the JSDoc comment
/// location chain like the checker's getAllJSDocTags.
fn declaration_jsdoc_tags(node: P<Node>) -> Vec<P<Node>> {
    if !node.flags().intersects(NodeFlags::JSDoc) {
        let mut current = Some(node);
        while let Some(c) = current {
            let jsdocs = c.jsdoc(None);
            if let Some(last) = jsdocs.last() {
                if let Some(tags) = last.as_jsdoc().tags() {
                    return tags.nodes().to_vec();
                }
            }
            current = tsrs_ast::get_next_jsdoc_comment_location(c);
        }
    }
    Vec::new()
}
