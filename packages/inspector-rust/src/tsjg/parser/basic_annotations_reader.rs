//! Port of Go `tsjg/parser/basic_annotations_reader.go`.

use std::collections::HashSet;
use std::rc::Rc;

use serde_json::Value;
use tsrs_ast::Node;
use tsrs_core::P;

use super::annotations_reader::{AnnotationsReader, JsDocTagInfo, symbol_jsdoc_tags};
use super::json5::parse_json5;
use crate::tsjg::types::Annotations;

/// Reads schema keywords from JSDoc tags (src/AnnotationsReader/BasicAnnotationsReader.ts).
pub struct BasicAnnotationsReader {
    extra_tags: HashSet<String>,
}

/// Tags emitted with a "$" prefix ($id, $comment, $ref).
const REQUIRES_DOLLAR: &[&str] = &["id", "comment", "ref"];

/// Tags that carry their raw text value.
const TEXT_TAGS: &[&str] = &[
    "title",
    "description",
    "id",
    "format",
    "pattern",
    "ref",
    // New since draft-07:
    "comment",
    "contentMediaType",
    "contentEncoding",
    // Custom tag for if-then-else support.
    "discriminator",
];

/// Tags that carry a JSON5-encoded value.
const JSON_TAGS: &[&str] = &[
    "minimum",
    "exclusiveMinimum",
    "maximum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "minProperties",
    "maxProperties",
    "minItems",
    "maxItems",
    "uniqueItems",
    "propertyNames",
    "contains",
    "const",
    "examples",
    "default",
    "required",
    // New since draft-07:
    "if",
    "then",
    "else",
    "readOnly",
    "writeOnly",
    // New since draft 2019-09:
    "deprecated",
];

/// `extra_tags` is a set of additional tag names parsed like JSON_TAGS.
pub fn new(extra_tags: HashSet<String>) -> Rc<BasicAnnotationsReader> {
    Rc::new(BasicAnnotationsReader::new(extra_tags))
}

impl BasicAnnotationsReader {
    pub fn new(extra_tags: HashSet<String>) -> BasicAnnotationsReader {
        BasicAnnotationsReader { extra_tags }
    }

    /// Converts the tags returned by `symbol_jsdoc_tags` into annotations, so
    /// that ExtendedAnnotationsReader can share one tag lookup.
    pub fn annotations_from_tags(&self, tags: &[JsDocTagInfo]) -> Option<Annotations> {
        if tags.is_empty() {
            return None;
        }
        let mut annotations = Annotations::new();
        for tag in tags {
            let Some(value) = self.parse_jsdoc_tag(tag) else { continue };
            if REQUIRES_DOLLAR.contains(&tag.name.as_str()) {
                annotations.insert(format!("${}", tag.name), value);
            } else {
                annotations.insert(tag.name.clone(), value);
            }
        }
        if annotations.is_empty() { None } else { Some(annotations) }
    }

    fn parse_jsdoc_tag(&self, tag: &JsDocTagInfo) -> Option<Value> {
        let is_text_tag = TEXT_TAGS.contains(&tag.name.as_str());
        let mut text = tag.text.as_str();
        if text.is_empty() && !is_text_tag {
            // Non-text tags without explicit value (e.g. `@deprecated`) default to `true`.
            text = "true";
        }
        if is_text_tag {
            return Some(Value::String(text.to_string()));
        }
        if !JSON_TAGS.contains(&tag.name.as_str()) && !self.extra_tags.contains(&tag.name) {
            // Unknown jsDoc tag.
            return None;
        }
        Some(parse_json5(text).unwrap_or_else(|_| Value::String(text.to_string())))
    }
}

impl AnnotationsReader for BasicAnnotationsReader {
    fn get_annotations(&self, node: P<Node>) -> Option<Annotations> {
        self.annotations_from_tags(&symbol_jsdoc_tags(node))
    }
}
