//! Port of `jsxprops.go`: `readJsxProps`, `writeJsxProp`, `writeJsxStyle`.

use regex::Regex;
use serde_json::Value;
use std::sync::OnceLock;
use tsrs_ast::{
    Kind, Node, is_call_expression, is_identifier, is_jsx_attribute, is_jsx_expression, is_jsx_opening_element,
    is_jsx_self_closing_element, is_numeric_literal, is_string_literal, is_no_substitution_template_literal,
};
use tsrs_core::{P, ScriptKind};

use super::{end, for_each_child, is_string_literal_like, js_trim, js_whitespace_run, parse, start};
use crate::jsjson::format_number;
use crate::tsutil::utf16_offset;

/// Raised when an element's className cannot be edited safely.
#[derive(Debug)]
pub struct JsxStyleError {
    pub message: String,
}

/// A prop value `writeJsxProp` takes: a string, a number or a boolean.
#[derive(Clone, Debug, PartialEq)]
pub enum PropValue {
    Str(String),
    Num(f64),
    Bool(bool),
    /// Any other JSON value: Go's attrText falls through to the bare name.
    Other,
}

#[derive(Clone)]
pub struct StyleEntry {
    pub prop: String,
    pub value: Option<String>,
}

fn parse_tsx(source: &str) -> P<tsrs_ast::SourceFile> {
    parse("x.tsx", source, ScriptKind::TSX)
}

fn is_opening_like(n: P<Node>) -> bool {
    is_jsx_opening_element(n) || is_jsx_self_closing_element(n)
}

fn jsx_attributes(element: P<Node>) -> &'static [P<Node>] {
    element.attributes().unwrap().as_jsx_attributes().properties().nodes()
}

/// `jsx-props.ts` findOpeningElement: the first opening or self-closing element
/// starting at 1-based line, 0-based UTF-16 column.
fn find_opening_element(sf: P<tsrs_ast::SourceFile>, line: i64, col: i64) -> Option<P<Node>> {
    let text = sf.text();
    let line_starts = tsrs_scanner::get_ecma_line_starts(&*sf);
    fn visit(
        n: P<Node>,
        sf: P<tsrs_ast::SourceFile>,
        text: &str,
        line_starts: &[u32],
        line: i64,
        col: i64,
        found: &mut Option<P<Node>>,
    ) {
        if found.is_some() {
            return;
        }
        if is_opening_like(n) {
            let at = start(n, sf);
            let idx = tsrs_scanner::get_ecma_line_of_position(&*sf, at as u32);
            let column = utf16_offset(text, at) as i64 - utf16_offset(text, line_starts[idx] as usize) as i64;
            if idx as i64 + 1 == line && column == col {
                *found = Some(n);
                return;
            }
        }
        for_each_child(n, &mut |c| visit(c, sf, text, line_starts, line, col, found));
    }
    let mut found = None;
    visit(sf.as_node(), sf, text, line_starts, line, col, &mut found);
    found
}

/// `jsx-props.ts` literalValue; `None` for "undefined".
fn literal_value(attr: P<Node>) -> Option<Value> {
    let Some(init) = attr.as_jsx_attribute().initializer else { return Some(Value::Bool(true)) };
    if is_string_literal(init) {
        return Some(Value::String(init.text().to_string()));
    }
    if !is_jsx_expression(init) || init.expression().is_none() {
        return None;
    }
    let expr = init.expression().unwrap();
    if is_string_literal(expr) || is_no_substitution_template_literal(expr) {
        return Some(Value::String(expr.text().to_string()));
    }
    if is_numeric_literal(expr) {
        return Some(num_value(js_number_from_string(expr.text())));
    }
    match expr.kind() {
        Kind::TrueKeyword => Some(Value::Bool(true)),
        Kind::FalseKeyword => Some(Value::Bool(false)),
        _ => None,
    }
}

/// A JSON number that prints the way `jsjson` prints a float64.
fn num_value(f: f64) -> Value {
    serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null)
}

/// `jsnum.FromString` for a numeric literal's text.
pub fn js_number_from_string(text: &str) -> f64 {
    let t = text.replace('_', "");
    let lower = t.to_ascii_lowercase();
    for (prefix, base) in [("0x", 16u32), ("0o", 8), ("0b", 2)] {
        if let Some(rest) = lower.strip_prefix(prefix) {
            // accumulate in f64 to keep large values like JS
            let mut v = 0f64;
            for c in rest.chars() {
                match c.to_digit(base) {
                    Some(d) => v = v * base as f64 + d as f64,
                    None => return f64::NAN,
                }
            }
            return v;
        }
    }
    // legacy octal (0777) is a syntax error in strict TS but scans as decimal-looking octal
    lower.parse::<f64>().unwrap_or(f64::NAN)
}

fn js_quote(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn attr_text(name: &str, value: &PropValue) -> String {
    match value {
        PropValue::Bool(true) => name.to_string(),
        PropValue::Bool(false) => format!("{name}={{false}}"),
        PropValue::Num(n) => format!("{name}={{{}}}", format_number(*n)),
        PropValue::Str(s) => format!("{name}=\"{}\"", js_quote(s)),
        PropValue::Other => name.to_string(),
    }
}

/// `readJsxProps`; `None` when no element starts there.
pub fn read_jsx_props(source: &str, line: i64, col: i64) -> Option<Vec<(String, Value)>> {
    let sf = parse_tsx(source);
    let element = find_opening_element(sf, line, col)?;
    let mut props = Vec::new();
    for attr in jsx_attributes(element) {
        if !is_jsx_attribute(*attr) || !is_identifier(attr.name().unwrap()) {
            continue;
        }
        if let Some(value) = literal_value(*attr) {
            props.push((attr.name().unwrap().text().to_string(), value));
        }
    }
    Some(props)
}

fn style_token_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^\[([a-z-]+):(.+)\]!$").unwrap())
}

fn kebab(prop: &str) -> String {
    let mut b = String::new();
    for r in prop.chars() {
        if r.is_ascii_uppercase() {
            b.push('-');
            b.push(r.to_ascii_lowercase());
        } else {
            b.push(r);
        }
    }
    b
}

fn restyle(classes: &str, styles: &[StyleEntry]) -> String {
    let props: Vec<String> = styles.iter().map(|s| kebab(&s.prop)).collect();
    let mut kept: Vec<String> = Vec::new();
    for token in js_whitespace_run().split(classes) {
        let matched = style_token_re().captures(token).map(|m| m[1].to_string());
        if !token.is_empty() && !(matched.is_some_and(|m| props.contains(&m))) {
            kept.push(token.to_string());
        }
    }
    for s in styles {
        let Some(v) = &s.value else { continue };
        if js_trim(v).is_empty() {
            continue;
        }
        let value = js_whitespace_run().replace_all(js_trim(v), "_");
        kept.push(format!("[{}:{}]!", kebab(&s.prop), value));
    }
    kept.join(" ")
}

fn only_style_tokens(text: &str) -> bool {
    let trimmed = js_trim(text);
    if trimmed.is_empty() {
        return false;
    }
    js_whitespace_run().split(trimmed).all(|t| style_token_re().is_match(t))
}

fn quoted(text: &str) -> String {
    format!("\"{}\"", js_quote(text))
}

fn find_attr(element: P<Node>, name: &str) -> Option<P<Node>> {
    jsx_attributes(element)
        .iter()
        .find(|a| is_jsx_attribute(**a) && is_identifier(a.name().unwrap()) && a.name().unwrap().text() == name)
        .copied()
}

fn jsx_type_arguments(element: P<Node>) -> Option<P<tsrs_ast::NodeList>> {
    if is_jsx_opening_element(element) {
        element.as_jsx_opening_element().type_arguments()
    } else {
        element.as_jsx_self_closing_element().type_arguments()
    }
}

/// `writeJsxStyle`.
pub fn write_jsx_style(source: &str, line: i64, col: i64, styles: &[StyleEntry]) -> Result<String, JsxStyleError> {
    let sf = parse_tsx(source);
    let Some(element) = find_opening_element(sf, line, col) else { return Ok(source.to_string()) };
    let attr = find_attr(element, "className");
    // value: "" when no attribute; Go keeps `value, _ = literalValue(attr)` (nil on failure)
    let value: Option<Value> = match attr {
        None => Some(Value::String(String::new())),
        Some(a) => literal_value(a),
    };
    if let Some(Value::String(current)) = &value {
        let next = restyle(current, styles);
        if &next == current {
            return Ok(source.to_string());
        }
        let prop = if next.is_empty() { None } else { Some(PropValue::Str(next)) };
        return Ok(write_jsx_prop(source, line, col, "className", prop.as_ref()));
    }
    let mut expr = None;
    if let Some(a) = attr {
        if let Some(init) = a.as_jsx_attribute().initializer {
            if is_jsx_expression(init) {
                expr = init.expression();
            }
        }
    }
    let err = || JsxStyleError { message: "This element builds its className in a way that cannot be edited safely".into() };
    let Some(expr) = expr else { return Err(err()) };
    if !is_call_expression(expr) || !is_identifier(expr.expression().unwrap()) || expr.expression().unwrap().text() != "cn" {
        return Err(err());
    }
    let args = expr.as_call_expression().arguments;
    let nodes = args.nodes();
    let last = nodes.last().copied();
    let prev = if nodes.len() > 1 { Some(nodes[nodes.len() - 2]) } else { None };
    if let Some(last) = last {
        if is_string_literal_like(Some(last)) && only_style_tokens(last.text()) {
            let next = restyle(last.text(), styles);
            if !next.is_empty() {
                return Ok(format!("{}{}{}", &source[..start(last, sf)], quoted(&next), &source[end(last)..]));
            }
            if let Some(prev) = prev {
                return Ok(format!("{}{}", &source[..end(prev)], &source[end(last)..]));
            }
            return Ok(format!("{}{}", &source[..args.pos().expect_source("args") as usize], &source[args.end().expect_source("args") as usize..]));
        }
    }
    let added = restyle("", styles);
    if added.is_empty() {
        return Ok(source.to_string());
    }
    let mut at = args.end().expect_source("args") as usize;
    let mut sep = "";
    if let Some(last) = last {
        at = end(last);
        sep = ", ";
    }
    Ok(format!("{}{}{}{}", &source[..at], sep, quoted(&added), &source[at..]))
}

/// `writeJsxProp`; `value` `None` removes the prop.
pub fn write_jsx_prop(source: &str, line: i64, col: i64, name: &str, value: Option<&PropValue>) -> String {
    let sf = parse_tsx(source);
    let Some(element) = find_opening_element(sf, line, col) else { return source.to_string() };
    let existing = find_attr(element, name);
    let Some(value) = value else {
        let Some(existing) = existing else { return source.to_string() };
        let mut at = start(existing, sf);
        let b = source.as_bytes();
        while at > 0 && (b[at - 1] == b' ' || b[at - 1] == b'\t') {
            at -= 1;
        }
        return format!("{}{}", &source[..at], &source[end(existing)..]);
    };
    if let Some(existing) = existing {
        return format!("{}{}{}", &source[..start(existing, sf)], attr_text(name, value), &source[end(existing)..]);
    }
    let props = element.attributes().unwrap().as_jsx_attributes().properties();
    let at = if !props.nodes().is_empty() {
        props.end().expect_source("props") as usize
    } else if let Some(ta) = jsx_type_arguments(element) {
        ta.end().expect_source("ta") as usize
    } else {
        end(element.tag_name())
    };
    format!("{} {}{}", &source[..at], attr_text(name, value), &source[at..])
}
