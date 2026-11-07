//! Port of Go `internal/sourcescan`: the single-file parse-only helpers of
//! `@pikku/inspector`, the CLI and `@pikku/code-edit`. None builds a program;
//! each parses one file the way `ts.createSourceFile` does.

use std::sync::OnceLock;

use regex::Regex;
use serde::{Serialize, Serializer};
use serde_json::value::RawValue;
use tsrs_ast::{Node, SourceFile, SourceFileParseOptions, is_no_substitution_template_literal, is_string_literal};
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
    let units = utf16_units(s);
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
    let mut units = utf16_units(s);
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

/// Text of a string-like node as a Rust string. tsrs keeps a lone surrogate
/// produced by an escape (`'\ud83d'`) as WTF-8 bytes inside a `&str`, as
/// typescript-go does in a Go string. Go treats each byte of such a string as a
/// `RuneError` when it matches a regexp or encodes JSON, and
/// [`wtf8_units`](JsText) knows the three-byte form. Here a lone surrogate
/// becomes a marker character (U+10D800..U+10DFFF, [`SURROGATE_MARKER_BASE`]),
/// any other invalid byte U+FFFD, so the rest of the code works on valid UTF-8;
/// [`JsText`] turns a marker back into the lone UTF-16 unit and
/// [`unmark_surrogates`] writes the other outputs the way Go's encoder does
/// (one U+FFFD per byte).
pub trait NodeLit {
    fn lit(self) -> std::borrow::Cow<'static, str>;
}

pub const SURROGATE_MARKER_BASE: u32 = 0x10D800;

impl NodeLit for P<Node> {
    fn lit(self) -> std::borrow::Cow<'static, str> {
        fix_wtf8(self.text())
    }
}

pub fn fix_wtf8(s: &'static str) -> std::borrow::Cow<'static, str> {
    let bytes = s.as_bytes();
    if std::str::from_utf8(bytes).is_ok() {
        return std::borrow::Cow::Borrowed(s);
    }
    let mut out = String::new();
    let mut i = 0;
    while i < bytes.len() {
        match std::str::from_utf8(&bytes[i..]) {
            Ok(rest) => {
                out.push_str(rest);
                break;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                out.push_str(std::str::from_utf8(&bytes[i..i + valid]).unwrap());
                i += valid;
                let b = &bytes[i..];
                if b.len() >= 3 && b[0] == 0xed && (0xa0..=0xbf).contains(&b[1]) && (0x80..=0xbf).contains(&b[2]) {
                    let unit = 0xd000u32 | ((b[1] as u32 & 0x3f) << 6) | (b[2] as u32 & 0x3f);
                    out.push(char::from_u32(SURROGATE_MARKER_BASE + (unit - 0xd800)).unwrap());
                    i += 3;
                } else {
                    let n = e.error_len().unwrap_or(b.len());
                    for _ in 0..n {
                        out.push('\u{fffd}');
                    }
                    i += n;
                }
            }
        }
    }
    std::borrow::Cow::Owned(out)
}

/// UTF-16 units of a string with markers (see [`NodeLit`]).
pub fn utf16_units(s: &str) -> Vec<u16> {
    let mut units = Vec::with_capacity(s.len());
    for c in s.chars() {
        let cp = c as u32;
        if (SURROGATE_MARKER_BASE..SURROGATE_MARKER_BASE + 0x800).contains(&cp) {
            units.push((0xd800 + (cp - SURROGATE_MARKER_BASE)) as u16);
        } else {
            let mut buf = [0u16; 2];
            units.extend_from_slice(c.encode_utf16(&mut buf));
        }
    }
    units
}

/// Writes a surrogate marker the way Go's JSON encoder writes the three
/// invalid bytes it stands for: three U+FFFD.
pub fn unmark_surrogates(json: &str) -> std::borrow::Cow<'_, str> {
    if !json.chars().any(|c| (SURROGATE_MARKER_BASE..SURROGATE_MARKER_BASE + 0x800).contains(&(c as u32))) {
        return std::borrow::Cow::Borrowed(json);
    }
    let mut out = String::with_capacity(json.len());
    for c in json.chars() {
        if (SURROGATE_MARKER_BASE..SURROGATE_MARKER_BASE + 0x800).contains(&(c as u32)) {
            out.push_str("\u{fffd}\u{fffd}\u{fffd}");
        } else {
            out.push(c);
        }
    }
    std::borrow::Cow::Owned(out)
}
