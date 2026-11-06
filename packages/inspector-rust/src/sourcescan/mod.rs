//! Port of Go `internal/sourcescan`: the single-file parse-only helpers of
//! `@pikku/inspector`, the CLI and `@pikku/code-edit`. None builds a program;
//! each parses one file the way `ts.createSourceFile` does.

use std::sync::OnceLock;

use regex::Regex;
use serde::{Serialize, Serializer};
use serde_json::value::RawValue;
use tsrs_ast::{Node, SourceFile, SourceFileParseOptions, is_string_literal, is_no_substitution_template_literal};
use tsrs_core::tspath::{self, Path};
use tsrs_core::{P, ScriptKind};

pub mod copyskip;
pub mod copytext;
pub mod files;
pub mod jsxprops;
pub mod jsxtext;
pub mod messageusage;
pub mod modspec;
pub mod pikkucall;
pub mod remoteaddon;
pub mod sourcechecks;
pub mod stubscan;
pub mod syntax;
pub mod tsconfig;

/// Go `Parse`: `ts.createSourceFile(fileName, content, Latest, true, kind)`.
/// `ScriptKind::Unknown` takes the kind from the extension, falling back to TS.
pub fn parse(file_name: &str, content: &str, kind: ScriptKind) -> P<SourceFile> {
    let kind = if kind == ScriptKind::Unknown {
        let k = tsrs_core::get_script_kind_from_file_name(file_name);
        if k == ScriptKind::Unknown { ScriptKind::TS } else { k }
    } else {
        kind
    };
    // The name only labels the parse; a relative one is rooted at "/".
    let name = tspath::get_normalized_absolute_path(file_name, "/");
    let opts = SourceFileParseOptions { file_name: name.clone(), path: Path(name.into()), ..Default::default() };
    tsrs_parser::parse_source_file(opts, content, kind)
}

/// `node.getStart(source)`.
pub fn start(n: P<Node>, sf: P<SourceFile>) -> usize {
    tsrs_scanner::get_token_pos_of_node(n, sf, false) as usize
}

pub fn end(n: P<Node>) -> usize {
    n.end().expect_source("parsed node") as usize
}

/// `source.getLineAndCharacterOfPosition(pos).line + 1`.
pub fn line_of(sf: P<SourceFile>, pos: usize) -> usize {
    tsrs_scanner::get_ecma_line_of_position(&*sf, pos as u32) + 1
}

/// `node.getText(source)`.
pub fn get_text(n: P<Node>, sf: P<SourceFile>) -> &'static str {
    &sf.text()[start(n, sf)..end(n)]
}

/// `ts.forEachChild(node, visit)` for a visit that never stops.
pub fn for_each_child(n: P<Node>, visit: &mut dyn FnMut(P<Node>)) {
    n.for_each_child(&mut |c| {
        visit(c);
        false
    });
}

/// Visits `n` and every node below it, pre-order.
pub fn walk(n: P<Node>, visit: &mut dyn FnMut(P<Node>)) {
    visit(n);
    n.for_each_child(&mut |c| {
        walk(c, visit);
        false
    });
}

/// Kind predicates tsrs keeps crate-private.
pub mod kinds {
    use tsrs_ast::{Kind, Node};
    use tsrs_core::P;
    macro_rules! k {
        ($f:ident, $k:ident) => {
            pub fn $f(n: P<Node>) -> bool {
                n.kind() == Kind::$k
            }
        };
    }
    k!(is_as_expression, AsExpression);
    k!(is_type_assertion, TypeAssertionExpression);
    k!(is_case_block, CaseBlock);
}

pub fn is_string_literal_like(n: Option<P<Node>>) -> bool {
    n.is_some_and(|n| is_string_literal(n) || is_no_substitution_template_literal(n))
}

/// JavaScript's `\s` / `String#trim` set (WhiteSpace and LineTerminator).
pub fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
            | '\u{205f}' | '\u{3000}' | '\u{feff}'
    ) || ('\u{2000}'..='\u{200a}').contains(&c)
}

/// The same set as a regexp bracket-expression body (Go `JSWhitespace`).
pub const JS_WHITESPACE: &str =
    r"\t\n\x0b\x0c\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}";

/// `String.prototype.trim`.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_whitespace)
}

/// A lazily compiled regex.
pub struct Lazy(OnceLock<Regex>, &'static str);

impl Lazy {
    pub const fn new(pattern: &'static str) -> Lazy {
        Lazy(OnceLock::new(), pattern)
    }
    pub fn get(&self) -> &Regex {
        self.0.get_or_init(|| Regex::new(self.1).unwrap_or_else(|e| panic!("bad regex {}: {e}", self.1)))
    }
    pub fn is_match(&self, s: &str) -> bool {
        self.get().is_match(s)
    }
}

pub fn js_whitespace_run() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(&format!("[{JS_WHITESPACE}]+")).unwrap())
}

/// `s.slice(0, n)` for n UTF-16 code units, as a `String` (a cut inside a
/// surrogate pair becomes U+FFFD, as Go's `string(utf16.Decode(..))`).
pub fn slice_utf16(s: &str, n: usize) -> String {
    let units: Vec<u16> = s.encode_utf16().collect();
    if units.len() <= n {
        return s.to_string();
    }
    String::from_utf16_lossy(&units[..n])
}

/// A string cut by UTF-16 length, as `String#slice` cuts it. The cut can land
/// inside a surrogate pair, which only a JSON escape can carry across.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JsText(pub Vec<u16>);

/// `s.slice(0, n)`.
pub fn slice_js(s: &str, n: usize) -> JsText {
    let mut units: Vec<u16> = s.encode_utf16().collect();
    units.truncate(n);
    JsText(units)
}

impl JsText {
    /// Go `jsText.MarshalJSON`.
    pub fn to_json(&self) -> String {
        let t = &self.0;
        let mut out = String::from("\"");
        let mut i = 0;
        while i < t.len() {
            let u = t[i];
            match u {
                0x22 => out.push_str("\\\""),
                0x5c => out.push_str("\\\\"),
                u if u < 0x20 => out.push_str(&format!("\\u{u:04x}")),
                0xd800..=0xdbff if i + 1 < t.len() && (0xdc00..0xe000).contains(&t[i + 1]) => {
                    let c = char::decode_utf16([u, t[i + 1]]).next().unwrap().unwrap_or('\u{fffd}');
                    out.push(c);
                    i += 1;
                }
                0xd800..=0xdfff => out.push_str(&format!("\\u{u:04x}")),
                u => out.push(char::from_u32(u as u32).unwrap_or('\u{fffd}')),
            }
            i += 1;
        }
        out.push('"');
        out
    }
}

impl Serialize for JsText {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let raw = RawValue::from_string(self.to_json()).map_err(serde::ser::Error::custom)?;
        raw.serialize(s)
    }
}

/// Go's `strings.TrimPrefix`-free `contains` on string slices.
pub fn contains(list: &[String], s: &str) -> bool {
    list.iter().any(|i| i == s)
}
