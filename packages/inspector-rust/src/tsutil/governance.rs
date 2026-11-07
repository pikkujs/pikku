//! Port of Go `tsutil/governance.go`: ports of `utils/literal-properties.ts`
//! (readers for object-literal properties that must be statically knowable)
//! plus JS number helpers. Each reader returns `None` for a computed value.

use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::props::initializer_of;

/// `LiteralProperty`: literal-properties.ts getProperty: the initializer of a
/// property assignment whose name is an identifier or a string literal.
pub fn literal_property(obj: P<Node>, name: &str) -> Option<P<Node>> {
    for p in obj.properties() {
        if !ast::is_property_assignment(*p) {
            continue;
        }
        let k = p.name().unwrap();
        if (ast::is_identifier(k) || ast::is_string_literal(k)) && k.text() == name {
            return Some(initializer_of(*p));
        }
    }
    None
}

/// `LiteralString` (stringProperty).
pub fn literal_string(obj: P<Node>, name: &str) -> Option<String> {
    let v = literal_property(obj, name)?;
    if ast::is_string_literal_like(v) { Some(v.text().to_string()) } else { None }
}

/// `LiteralNumber` (numberProperty): a numeric literal, or `-` over one.
pub fn literal_number(obj: P<Node>, name: &str) -> Option<f64> {
    numeric_value(literal_property(obj, name)?)
}

/// `NumericValue` reads a numeric literal or a unary minus over one as
/// `Number(text)` / `-Number(text)`.
pub fn numeric_value(v: P<Node>) -> Option<f64> {
    if ast::is_prefix_unary_expression(v) {
        let pu = v.as_prefix_unary_expression();
        if pu.operator() == Kind::MinusToken && ast::is_numeric_literal(pu.operand()) {
            return Some(-js_number(pu.operand().text()));
        }
        return None;
    }
    if ast::is_numeric_literal(v) {
        return Some(js_number(v.text()));
    }
    None
}

/// `LiteralBool` (booleanProperty).
pub fn literal_bool(obj: P<Node>, name: &str) -> Option<bool> {
    match literal_property(obj, name)?.kind() {
        Kind::TrueKeyword => Some(true),
        Kind::FalseKeyword => Some(false),
        _ => None,
    }
}

/// `LiteralStringArray` (stringArrayProperty): all-or-nothing.
pub fn literal_string_array(obj: P<Node>, name: &str) -> Option<Vec<String>> {
    let v = literal_property(obj, name)?;
    if !ast::is_array_literal_expression(v) {
        return None;
    }
    let mut out = Vec::new();
    for e in v.elements() {
        if !ast::is_string_literal_like(*e) {
            return None;
        }
        out.push(e.text().to_string());
    }
    Some(out)
}

/// `JSNumber` is `Number(text)` for a numeric literal's text.
pub fn js_number(text: &str) -> f64 {
    let t: String = text.replace('_', "");
    let b = t.as_bytes();
    if b.len() > 2 && b[0] == b'0' {
        let radix = match b[1] {
            b'x' | b'X' => Some(16),
            b'o' | b'O' => Some(8),
            b'b' | b'B' => Some(2),
            _ => None,
        };
        if let Some(r) = radix {
            if let Ok(n) = u64::from_str_radix(&t[2..], r) {
                return n as f64;
            }
        }
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// `JSNumberString` is `String(n)` for a JS number.
pub fn js_number_string(f: f64) -> String {
    if f.is_nan() {
        return "NaN".into();
    }
    if f.is_infinite() {
        return if f > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    if f == 0.0 {
        return "0".into();
    }
    crate::jsjson::format_number(f)
}

/// JS's `\s`.
fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{0b}' | '\u{0c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
            | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

/// `CollapseWhitespace` is `s.replace(/\s+/g, ' ')`.
pub fn collapse_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_ws = false;
    for c in s.chars() {
        if is_js_whitespace(c) {
            if !in_ws {
                out.push(' ');
            }
            in_ws = true;
        } else {
            out.push(c);
            in_ws = false;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn js_numbers() {
        assert_eq!(js_number("12"), 12.0);
        assert_eq!(js_number("0x10"), 16.0);
        assert_eq!(js_number("0b101"), 5.0);
        assert_eq!(js_number("1_000"), 1000.0);
        assert_eq!(js_number("1e3"), 1000.0);
        assert!(js_number("x").is_nan());
    }

    #[test]
    fn js_number_strings() {
        assert_eq!(js_number_string(0.0), "0");
        assert_eq!(js_number_string(1e21), "1e+21");
        assert_eq!(js_number_string(0.0000001), "1e-7");
        assert_eq!(js_number_string(123.5), "123.5");
        assert_eq!(js_number_string(f64::NAN), "NaN");
    }

    #[test]
    fn collapse() {
        assert_eq!(collapse_whitespace("a \n\t b\u{a0}c"), "a b c");
        assert_eq!(collapse_whitespace("  x "), " x ");
    }
}
