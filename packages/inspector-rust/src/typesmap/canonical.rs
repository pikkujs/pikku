//! Port of Go `internal/typesmap/canonical.go` (utils/canonical-type-string.ts):
//! a printed type with the members of every union in it sorted by text, `null`
//! and `undefined` last, and everything else left byte for byte. tsgo keeps a
//! union's members sorted by value where Strada keeps them in creation order,
//! so neither order can be trusted; both engines run
//! `canonical-type-string.cases.json`.

const OPENERS: &[u8] = b"{[(<";
const CLOSERS: &[u8] = b"}])>";
const QUOTES: &[u8] = b"\"'`";
const WS: &[char] = &[' ', '\t', '\n', '\r'];

fn close_of(open: u8) -> u8 {
    match open {
        b'{' => b'}',
        b'[' => b']',
        b'(' => b')',
        _ => b'>',
    }
}

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if from > hay.len() {
        return None;
    }
    hay[from..].windows(needle.len()).position(|w| w == needle).map(|p| p + from)
}

fn comment_end(s: &[u8], i: usize) -> Option<usize> {
    if s[i] != b'/' || i + 1 >= s.len() {
        return None;
    }
    match s[i + 1] {
        b'*' => Some(find(s, b"*/", i + 2).map_or(s.len(), |e| e + 2)),
        b'/' => Some(s[(i + 2).min(s.len())..].iter().position(|&c| c == b'\n').map_or(s.len(), |e| i + 2 + e)),
        _ => None,
    }
}

/// `s` with everything inside brackets, string literals and comments blanked,
/// and its outermost bracket pairs.
fn top_level(s: &str) -> (Vec<u8>, Vec<(usize, usize)>) {
    let s = s.as_bytes();
    let mut mask = vec![b' '; s.len()];
    let mut groups = Vec::new();
    let mut depth = 0usize;
    let mut open: Option<usize> = None;
    let mut i = 0usize;
    while i < s.len() {
        let c = s[i];
        if QUOTES.contains(&c) {
            let mut j = i + 1;
            while j < s.len() && s[j] != c {
                if s[j] == b'\\' {
                    j += 2;
                } else {
                    j += 1;
                }
            }
            i = j + 1;
            continue;
        }
        if let Some(end) = comment_end(s, i) {
            i = end;
            continue;
        }
        if OPENERS.contains(&c) {
            if depth == 0 {
                open = Some(i);
            }
            depth += 1;
        } else if CLOSERS.contains(&c) && !(c == b'>' && i > 0 && s[i - 1] == b'=') {
            depth = depth.saturating_sub(1);
            if depth == 0
                && let Some(o) = open
                && close_of(s[o]) == c
            {
                groups.push((o, i));
                open = None;
            }
        } else if depth == 0 {
            mask[i] = c;
        }
        i += 1;
    }
    (mask, groups)
}

fn is_nullish(m: &str) -> bool {
    m == "null" || m == "undefined"
}

fn sort_members(members: &mut [String]) {
    members.sort_by(|a, b| {
        is_nullish(a).cmp(&is_nullish(b)).then_with(|| a.encode_utf16().cmp(b.encode_utf16()))
    });
}

fn unsplittable(mask: &[u8]) -> bool {
    if mask.iter().any(|&c| c == b'?' || c == b':') {
        return true;
    }
    for i in 0..mask.len() {
        if mask[i] == b'=' && (i + 1 >= mask.len() || mask[i + 1] != b'>') {
            return true;
        }
    }
    mask.split(|c| !(c.is_ascii_alphanumeric() || *c == b'_' || *c == b'$'))
        .any(|w| matches!(w, b"extends" | b"is" | b"asserts" | b"infer" | b"as"))
}

/// `^[A-Za-z_$][\w$]*[ \t\n\r]+in[ \t\n\r]`: the length of the match.
fn mapped_key(mask: &[u8]) -> Option<usize> {
    let ws = |c: u8| matches!(c, b' ' | b'\t' | b'\n' | b'\r');
    let word = |c: u8| c.is_ascii_alphanumeric() || c == b'_' || c == b'$';
    let first = *mask.first()?;
    if !(first.is_ascii_alphabetic() || first == b'_' || first == b'$') {
        return None;
    }
    let mut i = 1;
    while i < mask.len() && word(mask[i]) {
        i += 1;
    }
    let ws_start = i;
    while i < mask.len() && ws(mask[i]) {
        i += 1;
    }
    if i == ws_start || !mask[i..].starts_with(b"in") || i + 2 >= mask.len() || !ws(mask[i + 2]) {
        return None;
    }
    Some(i + 3)
}

pub fn canonical_type_string(typ: &str) -> String {
    let body = typ.trim_start_matches(WS);
    let lead = typ.len() - body.len();
    if lead == typ.len() {
        return typ.to_string();
    }
    let body = body.trim_end_matches(WS);
    let end = lead + body.len();
    format!("{}{}{}", &typ[..lead], canonical_body(body), &typ[end..])
}

fn canonical_body(body: &str) -> String {
    let (mask, _) = top_level(body);
    if let Some(arrow) = find(&mask, b"=>", 0)
        && !mask[..arrow].contains(&b'|')
    {
        return format!("{}=>{}", rewrite_groups(&body[..arrow]), canonical_type_string(&body[arrow + 2..]));
    }
    if let Some(n) = mapped_key(&mask) {
        return format!("{}{}", &body[..n], canonical_type_string(&body[n..]));
    }
    if !mask.contains(&b'|') || unsplittable(&mask) {
        return rewrite_groups(body);
    }
    let mut members = Vec::new();
    let mut start = 0;
    for i in 0..=mask.len() {
        if i == mask.len() || mask[i] == b'|' {
            let m = canonical_type_string(&body[start..i]);
            let m = m.trim_matches(WS);
            if !m.is_empty() {
                members.push(m.to_string());
            }
            start = i + 1;
        }
    }
    if members.len() < 2 {
        return rewrite_groups(body);
    }
    sort_members(&mut members);
    members.join(" | ")
}

fn rewrite_groups(s: &str) -> String {
    let (_, groups) = top_level(s);
    let mut out = String::new();
    let mut last = 0;
    for (o, c) in groups {
        out.push_str(&s[last..o + 1]);
        out.push_str(&rewrite_list(&s[o + 1..c], s.as_bytes()[o]));
        last = c;
    }
    out.push_str(&s[last..]);
    out
}

fn rewrite_list(inner: &str, opener: u8) -> String {
    let separators: &[u8] = if opener == b'{' { b";," } else { b"," };
    let (mask, _) = top_level(inner);
    let mut out = String::new();
    let mut start = 0;
    for i in 0..=mask.len() {
        if i == mask.len() || separators.contains(&mask[i]) {
            out.push_str(&rewrite_item(&inner[start..i], opener));
            if i < inner.len() {
                out.push(inner.as_bytes()[i] as char);
            }
            start = i + 1;
        }
    }
    out
}

fn rewrite_item(item: &str, opener: u8) -> String {
    if opener == b'<' {
        return canonical_type_string(item);
    }
    let (mask, _) = top_level(item);
    match mask.iter().position(|&c| c == b':') {
        None => canonical_type_string(item),
        Some(colon) => format!("{}:{}", rewrite_groups(&item[..colon]), canonical_type_string(&item[colon + 1..])),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Deserialize)]
    struct Case {
        #[serde(rename = "in")]
        input: String,
        out: String,
    }

    /// The TypeScript inspector's own cases, so the ports cannot drift.
    #[test]
    fn canonical_type_string_cases() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../inspector/src/utils/canonical-type-string.cases.json");
        let cases: Vec<Case> = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        assert!(!cases.is_empty());
        for c in cases {
            assert_eq!(canonical_type_string(&c.input), c.out, "canonical({:?})", c.input);
            assert_eq!(canonical_type_string(&c.out), c.out, "not idempotent on {:?}", c.out);
        }
    }
}
