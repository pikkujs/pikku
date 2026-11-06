//! Port of `jsxtext.go`: `utils/read-jsx-literal-text.ts`.

use std::collections::HashSet;

use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;
use tsrs_ast::{
    Kind, is_call_expression, is_export_declaration, is_identifier, is_import_declaration, is_jsx_attribute,
    is_jsx_element, is_jsx_fragment, is_jsx_self_closing_element, is_literal_type_node, is_parenthesized_expression,
    is_conditional_expression, is_binary_expression, is_property_assignment, Node,
};
use tsrs_core::{P, ScriptKind};

use super::NodeLit;
use super::{JS_WHITESPACE, get_text, is_js_whitespace, is_string_literal_like, js_trim, line_of, parse, start, walk};

#[derive(Serialize, Clone)]
pub struct JsxLiteralText {
    pub text: String,
    pub line: usize,
}

const TEXT_ATTRIBUTES: &[&str] = &["placeholder", "title", "alt", "aria-label", "label", "description"];

fn is_text_property(name: &str) -> bool {
    matches!(name, "text" | "body" | "why" | "hint" | "caption" | "heading" | "subtitle" | "message" | "tooltip")
        || TEXT_ATTRIBUTES.contains(&name)
}

const NON_TEXT_ATTRIBUTES: &[&str] = &[
    "className", "class", "style", "d", "viewBox", "preserveAspectRatio", "points", "transform", "fill", "stroke",
    "href", "src", "rel", "target", "role", "to", "id", "name", "type", "value", "key",
];

const CLASS_BUILDERS: &[&str] = &["cn", "cva", "clsx", "cx", "classNames", "classnames", "tv", "twMerge", "twJoin"];

fn is_inside_class_builder(n: P<Node>) -> bool {
    let mut at = n.parent();
    while let Some(a) = at {
        if is_jsx_element(a) || is_jsx_self_closing_element(a) {
            return false;
        }
        if is_call_expression(a) {
            if let Some(callee) = a.expression() {
                if is_identifier(callee) && CLASS_BUILDERS.contains(&callee.text()) {
                    return true;
                }
            }
        }
        at = a.parent();
    }
    false
}

fn ws() -> String {
    format!("[{JS_WHITESPACE}]")
}
fn non_ws() -> String {
    format!("[^{JS_WHITESPACE}]")
}

fn prose_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    // /^\p{Lu}[^\s]*(\s+[^\s]+)+/u
    R.get_or_init(|| Regex::new(&format!(r"^\p{{Lu}}{}*{}+{}", non_ws(), ws(), non_ws())).unwrap())
}
fn prose_first_word_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"[:/\[\]=_#]").unwrap())
}
fn sentence_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(&format!(r"\p{{L}}{}+\p{{L}}", ws())).unwrap())
}
pub fn letter_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\p{L}").unwrap())
}

fn is_prose(text: &str) -> bool {
    let first = match text.find(is_js_whitespace) {
        Some(i) => &text[..i],
        None => text,
    };
    prose_re().is_match(js_trim(text)) && !prose_first_word_re().is_match(first)
}

fn is_sentence(text: &str) -> bool {
    sentence_re().is_match(text)
}

pub fn has_letter(text: &str) -> bool {
    letter_re().is_match(text)
}

/// The literals an expression can evaluate to and render.
fn rendered(n: P<Node>) -> Vec<P<Node>> {
    if is_string_literal_like(Some(n)) {
        return vec![n];
    }
    if is_parenthesized_expression(n) {
        return rendered(n.expression().unwrap());
    }
    if is_conditional_expression(n) {
        let c = n.as_conditional_expression();
        let mut v = rendered(c.when_true);
        v.extend(rendered(c.when_false));
        return v;
    }
    if is_binary_expression(n) {
        let b = n.as_binary_expression();
        match b.operator_token().kind() {
            Kind::AmpersandAmpersandToken => return rendered(b.right()),
            Kind::BarBarToken | Kind::QuestionQuestionToken => {
                let mut v = rendered(b.left());
                v.extend(rendered(b.right()));
                return v;
            }
            _ => {}
        }
    }
    vec![]
}

/// `utils/read-jsx-literal-text.ts`. The file is always parsed as TSX.
pub fn read_jsx_literal_text(file_name: &str, content: &str) -> Vec<JsxLiteralText> {
    let sf = parse(file_name, content, ScriptKind::TSX);
    let mut found: Vec<JsxLiteralText> = Vec::new();
    let mut seen: HashSet<usize> = HashSet::new();
    let mut add = |n: P<Node>, text: &str, found: &mut Vec<JsxLiteralText>| {
        if !has_letter(text) || is_inside_class_builder(n) {
            return;
        }
        let pos = start(n, sf);
        if !seen.insert(pos) {
            return;
        }
        found.push(JsxLiteralText { text: js_trim(text).to_string(), line: line_of(sf, pos) });
    };
    walk(sf.as_node(), &mut |n| {
        let parent = n.parent();
        if n.kind() == Kind::JsxText {
            add(n, &super::fix_wtf8(n.as_jsx_text().text()), &mut found);
        } else if n.kind() == Kind::JsxExpression
            && n.expression().is_some()
            && parent.is_some_and(|p| is_jsx_element(p) || is_jsx_fragment(p))
        {
            for literal in rendered(n.expression().unwrap()) {
                add(literal, &literal.lit(), &mut found);
            }
        } else if n.kind() == Kind::JsxAttribute && n.initializer().is_some() {
            let name = get_text(n.name().unwrap(), sf);
            let mut value = n.initializer();
            if value.is_some_and(|v| v.kind() == Kind::JsxExpression) {
                value = value.unwrap().expression();
            }
            if is_string_literal_like(value)
                && (TEXT_ATTRIBUTES.contains(&name)
                    || (!NON_TEXT_ATTRIBUTES.contains(&name)
                        && !name.starts_with("data-")
                        && is_sentence(&value.unwrap().lit())))
            {
                let v = value.unwrap();
                add(v, &v.lit(), &mut found);
            }
        } else if n.kind() == Kind::PropertyAssignment
            && is_text_property(get_text(n.name().unwrap(), sf))
            && is_string_literal_like(n.initializer())
        {
            let i = n.initializer().unwrap();
            add(i, &i.lit(), &mut found);
        }
        if is_string_literal_like(Some(n)) && is_prose(&n.lit()) {
            if let Some(p) = parent {
                if !is_import_declaration(p)
                    && !is_export_declaration(p)
                    && !is_literal_type_node(p)
                    && !(is_property_assignment(p) && p.name() == Some(n))
                    && !(is_jsx_attribute(p) && NON_TEXT_ATTRIBUTES.contains(&get_text(p.name().unwrap(), sf)))
                {
                    add(n, &n.lit(), &mut found);
                }
            }
        }
    });
    found
}
