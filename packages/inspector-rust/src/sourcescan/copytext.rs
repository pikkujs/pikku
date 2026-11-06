//! Port of `copytext.go`: `looksLikeCopy` and `readsAsEnglish` of
//! `verify/source-checks.ts`. Go's RE2 `\b`, `\w` and `\d` are ASCII; they are
//! spelled out here because the Rust `regex` crate's are Unicode.

use regex::Regex;
use std::sync::OnceLock;

use super::{JS_WHITESPACE, js_trim, js_whitespace_run};

/// JavaScript's `.` without the s flag.
pub const JS_DOT: &str = r"[^\n\r\x{2028}\x{2029}]";
const WORD: &str = "[0-9A-Za-z_]";

/// Writes the letters of a pattern as `[xX]` classes, outside bracket
/// expressions and escapes: JavaScript's /i without /u folds ASCII only.
pub fn ascii_fold(pattern: &str) -> String {
    let b = pattern.as_bytes();
    let mut out = String::new();
    let mut in_class = false;
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c == b'\\' && i + 1 < b.len() {
            out.push(c as char);
            i += 1;
            out.push(b[i] as char);
        } else if c == b'[' && !in_class {
            in_class = true;
            out.push('[');
        } else if c == b']' && in_class {
            in_class = false;
            out.push(']');
        } else if !in_class && c.is_ascii_alphabetic() {
            out.push('[');
            out.push(c.to_ascii_lowercase() as char);
            out.push(c.to_ascii_uppercase() as char);
            out.push(']');
        } else {
            out.push(c as char);
        }
        i += 1;
    }
    out
}

/// `\b` as RE2 means it (ASCII).
fn ascii_b(p: &str) -> String {
    p.replace(r"\b", r"(?-u:\b)")
}

pub fn ws() -> String {
    format!("[{JS_WHITESPACE}]")
}

macro_rules! re {
    ($name:ident, $build:expr) => {
        pub fn $name() -> &'static Regex {
            static R: OnceLock<Regex> = OnceLock::new();
            R.get_or_init(|| Regex::new(&$build).unwrap_or_else(|e| panic!("{}: {e}", stringify!($name))))
        }
    };
}

re!(copy_letter_re, r"\p{L}".to_string());
re!(copy_url_like_re, ascii_b(&ascii_fold(r"^(https?:|mailto:|tel:|data:|/|\.{1,2}/|#|@)")));
re!(copy_one_word_re, r"^\p{Lu}[\p{L}'’]+[.!?…:]*$".to_string());
re!(copy_code_re, ascii_b(&format!(r"[;{{}}]|=>|\bimport\b{JS_DOT}*\bfrom\b")));
re!(copy_class_tok, r"^[a-z0-9_:/\[\]().%#,=-]+$".to_string());
re!(copy_class_punct, r"[-_:/\[\]=.0-9]".to_string());

re!(english_list_re, format!(r"^[-*#>]{}", ws()));
re!(
    english_path_re,
    ascii_b(&ascii_fold(r"^(https?:|mailto:|tel:|data:|file:|/|\.{1,2}/|#|@|~/|\$\{?[A-Za-z_]+\}?/)"))
);
re!(
    english_code_re,
    ascii_b(&format!(r"[;{{}}]|=>|===|\bimport\b{JS_DOT}*\bfrom\b|</?[a-z][^>]*>|\$\{{[^}}]*\}}{}*\(", ws()))
);
re!(
    english_sql_head_re,
    ascii_b(&format!(
        "{}{}",
        ascii_fold("^(select|insert|update|delete|create|alter|drop|with|pragma|begin|commit|truncate)"),
        ws()
    ))
);
re!(
    english_sql_body_re,
    ascii_b(&ascii_fold(r"\b(from|into|set|table|where|values|index|select|transaction)\b"))
);
re!(
    english_shell_re,
    format!(
        "^(git|npm|npx|pnpm|yarn|bun|node|tsc|pikku|cloud|docker|curl|cd|ls|rm|mkdir|cp|mv|chmod|sh|bash|echo|cat|grep|sed|awk|brew|apt|pip|python3?){}+-?[0-9A-Za-z_./@:-]*",
        ws()
    )
);
re!(
    english_shell_flag,
    format!("(^|{ws})-{{1,2}}[a-z]|{ws}[0-9A-Za-z_@./-]+/[0-9A-Za-z_./-]+", ws = ws())
);
re!(
    english_css_re,
    format!("^[0-9.\\-+]+(px|rem|em|%|vh|vw|s|ms|fr)?{}", ws())
);
re!(
    english_css_func_re,
    ascii_b(&format!(r"\b(calc|var|rgba?|hsla?|oklch|url|translate{WORD}*|rotate|scale|linear-gradient|min|max|clamp)\("))
);
re!(english_ident_tok, "^[a-z0-9_:/\\[\\]().%#,=@*&|<>+!'\"`~$^?\\\\-]+$".to_string());
re!(english_ident_punct, r"[-_:/\[\]=.0-9@*&|<>+!~$^?\\()%#,]".to_string());
re!(english_camel_tok, r"^[A-Za-z0-9_$]+$".to_string());
re!(english_lower_start, r"^[a-z]".to_string());
re!(english_has_upper, r"[A-Z_]".to_string());
re!(english_upper_start, r"^\p{Lu}".to_string());
re!(sentence_end_re, r"[.!?…:]$".to_string());

pub fn normalize_whitespace(s: &str) -> String {
    js_trim(&js_whitespace_run().replace_all(s, " ")).to_string()
}

fn every(tokens: &[&str], re: &Regex) -> bool {
    tokens.iter().all(|t| re.is_match(t))
}

fn some(tokens: &[&str], re: &Regex) -> bool {
    tokens.iter().any(|t| re.is_match(t))
}

/// `looksLikeCopy` of `verify/source-checks.ts`.
pub fn looks_like_copy(value: &str, allowed: &[String]) -> bool {
    let s = normalize_whitespace(value);
    if s.is_empty() || allowed.iter().any(|a| *a == s) || !copy_letter_re().is_match(&s) {
        return false;
    }
    if copy_url_like_re().is_match(&s) {
        return false;
    }
    if !s.contains(' ') {
        return copy_one_word_re().is_match(&s);
    }
    let bare = s.replace("{…}", "");
    if copy_code_re().is_match(&bare) {
        return false;
    }
    let tokens: Vec<&str> = s.split(' ').collect();
    if every(&tokens, copy_class_tok()) && some(&tokens, copy_class_punct()) {
        return false;
    }
    true
}

/// `readsAsEnglish` of `verify/source-checks.ts`.
pub fn reads_as_english(text: &str) -> bool {
    let s = normalize_whitespace(text);
    let n = s.encode_utf16().count();
    if n < 5 || n > 200 || english_list_re().is_match(&s) || !copy_letter_re().is_match(&s) {
        return false;
    }
    let tokens: Vec<&str> = s.split(' ').collect();
    let word_tokens = tokens.iter().filter(|t| copy_letter_re().is_match(t)).count();
    if word_tokens < 2 {
        return false;
    }
    if english_path_re().is_match(&s) || english_code_re().is_match(&s) {
        return false;
    }
    if english_sql_head_re().is_match(&s) && english_sql_body_re().is_match(&s) {
        return false;
    }
    if english_shell_re().is_match(&s)
        && !sentence_end_re().is_match(&s)
        && tokens.len() > 1
        && english_shell_flag().is_match(&s)
    {
        return false;
    }
    if english_css_re().is_match(&s) && !sentence_end_re().is_match(&s) {
        return false;
    }
    if english_css_func_re().is_match(&s) {
        return false;
    }
    if every(&tokens, english_ident_tok()) && some(&tokens, english_ident_punct()) {
        return false;
    }
    if every(&tokens, english_camel_tok()) && all_camel_tail(&tokens) {
        return false;
    }
    if !english_upper_start().is_match(&s) && !sentence_end_re().is_match(&s) && word_tokens < 3 {
        return false;
    }
    true
}

fn all_camel_tail(tokens: &[&str]) -> bool {
    tokens.iter().all(|t| english_lower_start().is_match(t) && english_has_upper().is_match(&t[1..]))
}
