//! Port of `quotes.go`: typescript-go reuses a declaration's own type nodes and
//! keeps their quote style; Strada's typeToString always prints a literal type
//! with double quotes.

/// Rewrites the single-quoted string literal types in a printed type as
/// double-quoted ones. A single-quoted property name is left alone.
pub fn double_quote_literals(s: &str) -> String {
    if !s.contains('\'') {
        return s.to_string();
    }
    let b = s.as_bytes();
    let mut out = String::new();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'"' | b'`' => {
                let end = closing_quote(b, i);
                out.push_str(&s[i..end]);
                i = end;
            }
            b'\'' => {
                let end = closing_quote(b, i);
                let rest = &s[end..];
                if rest.starts_with(':') || rest.starts_with("?:") || rest.starts_with('(') {
                    out.push_str(&s[i..end]);
                } else {
                    out.push_str(&requote(&s[i + 1..end - 1]));
                }
                i = end;
            }
            _ => {
                // copy the whole UTF-8 character
                let ch = s[i..].chars().next().unwrap();
                out.push(ch);
                i += ch.len_utf8();
            }
        }
    }
    out
}

/// The index just past the quote that closes the string opened at `start`, or
/// the length when it is unterminated.
fn closing_quote(s: &[u8], start: usize) -> usize {
    let quote = s[start];
    let mut i = start + 1;
    while i < s.len() {
        if s[i] == b'\\' {
            i += 1;
        } else if s[i] == quote {
            return i + 1;
        }
        i += 1;
    }
    s.len()
}

fn requote(body: &str) -> String {
    let b = body.as_bytes();
    let mut out: Vec<u8> = vec![b'"'];
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c == b'\\' && i + 1 < b.len() {
            if b[i + 1] == b'\'' {
                out.push(b'\'');
            } else {
                out.push(c);
                out.push(b[i + 1]);
            }
            i += 2;
            continue;
        }
        if c == b'"' {
            out.extend_from_slice(b"\\\"");
            i += 1;
            continue;
        }
        out.push(c);
        i += 1;
    }
    out.push(b'"');
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn double_quote_literals_cases() {
        for (input, want) in [
            (r#"Omit<A, 'secrets'>"#, r#"Omit<A, "secrets">"#),
            (r#"{ 'a-b': 'x' }"#, r#"{ 'a-b': "x" }"#),
            (r#"'it\'s' | "ok""#, r#""it's" | "ok""#),
        ] {
            assert_eq!(double_quote_literals(input), want);
        }
    }
}
