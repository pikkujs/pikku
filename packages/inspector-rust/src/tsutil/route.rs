//! Port of Go `tsutil/route.go`: route patterns and `path-to-regexp` v8.4's
//! parameter extraction.

/// `RouteMatchesPattern`: equal, or the pattern with `*` read as `.*`, anchored.
pub fn route_matches_pattern(route: &str, pattern: &str) -> bool {
    if route == pattern {
        return true;
    }
    // Go builds `^<QuoteMeta(pattern) with \* -> .*>$`; the only wildcard is `*`,
    // so match the literal pieces between stars, in order, anchored.
    let pieces: Vec<&str> = pattern.split('*').collect();
    if pieces.len() == 1 {
        return false; // no star, and route != pattern
    }
    // `.` does not match a newline in Go regexp.
    let mut rest = route;
    let first = pieces[0];
    let Some(r) = rest.strip_prefix(first) else { return false };
    rest = r;
    let last = pieces[pieces.len() - 1];
    for mid in &pieces[1..pieces.len() - 1] {
        // `.*` between stars may match any non-newline run; leftmost match is fine
        // for a boolean answer as long as no newline is skipped.
        let Some(i) = rest.find(mid) else { return false };
        if rest[..i].contains('\n') {
            return false;
        }
        rest = &rest[i + mid.len()..];
    }
    // The last `.*` then `last` anchored at the end.
    if !rest.ends_with(last) {
        return false;
    }
    let skipped = &rest[..rest.len() - last.len()];
    !skipped.contains('\n')
}

#[derive(Clone, Debug)]
struct PathToken {
    kind: Kind,
    value: String,
    name: String,
    tokens: Vec<PathToken>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Text,
    Param,
    Wildcard,
    Group,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Kind::Text => "text",
            Kind::Param => "param",
            Kind::Wildcard => "wildcard",
            Kind::Group => "group",
        }
    }
}

fn path_error(msg: &str, path: &str) -> String {
    let mut m = msg.to_string();
    if !path.is_empty() {
        m.push_str(": ");
        m.push_str(path);
    }
    m + "; visit https://git.new/pathToRegexpError for info"
}

fn is_id_start(c: char) -> bool {
    c == '$' || c == '_' || c.is_alphabetic() || is_letter_number(c)
}

fn is_letter_number(c: char) -> bool {
    // Nl: roman numerals and a few more; ID_Start includes them.
    matches!(c as u32, 0x16EE..=0x16F0 | 0x2160..=0x2182 | 0x2185..=0x2188 | 0x3007 | 0x3021..=0x3029 | 0x3038..=0x303A | 0xA6E6..=0xA6EF)
}

fn is_id_continue(c: char) -> bool {
    // ID_Continue approximation: ID_Start, digits, connector punctuation and
    // combining marks (std has no Mn/Mc tables, so alphanumeric + the common
    // combining ranges are used).
    c == '$'
        || c == '\u{200c}'
        || c == '\u{200d}'
        || is_id_start(c)
        || c.is_alphanumeric()
        || c == '_'
        || matches!(c as u32, 0x203F | 0x2040 | 0x2054 | 0xFE33 | 0xFE34 | 0xFE4D..=0xFE4F | 0xFF3F | 0x00B7 | 0x0300..=0x036F | 0x1AB0..=0x1AFF | 0x1DC0..=0x1DFF | 0x20D0..=0x20FF | 0xFE20..=0xFE2F)
}

/// path-to-regexp's `parse()`; indexes are code-point indexes, as `[...str]`
/// gives.
fn parse_path(s: &str) -> Result<Vec<PathToken>, String> {
    let chars: Vec<char> = s.chars().collect();
    let mut index = 0usize;
    fn consume(chars: &[char], index: &mut usize, end: Option<char>, str_: &str) -> Result<Vec<PathToken>, String> {
        let mut out: Vec<PathToken> = Vec::new();
        let mut text = String::new();
        macro_rules! flush {
            () => {
                if !text.is_empty() {
                    out.push(PathToken { kind: Kind::Text, value: std::mem::take(&mut text), name: String::new(), tokens: vec![] });
                }
            };
        }
        while *index < chars.len() {
            let c = chars[*index];
            *index += 1;
            if Some(c) == end {
                flush!();
                return Ok(out);
            }
            match c {
                '\\' => {
                    if *index == chars.len() {
                        return Err(path_error(&format!("Unexpected end after \\ at index {}", *index), str_));
                    }
                    text.push(chars[*index]);
                    *index += 1;
                    continue;
                }
                ':' | '*' => {
                    let kind = if c == '*' { Kind::Wildcard } else { Kind::Param };
                    let mut name = String::new();
                    if *index < chars.len() && is_id_start(chars[*index]) {
                        loop {
                            name.push(chars[*index]);
                            *index += 1;
                            if *index >= chars.len() || !is_id_continue(chars[*index]) {
                                break;
                            }
                        }
                    } else if *index < chars.len() && chars[*index] == '"' {
                        let mut quote_start = *index;
                        while *index < chars.len() {
                            *index += 1;
                            if *index < chars.len() && chars[*index] == '"' {
                                *index += 1;
                                quote_start = 0;
                                break;
                            }
                            if *index < chars.len() && chars[*index] == '\\' {
                                *index += 1;
                            }
                            if *index < chars.len() {
                                name.push(chars[*index]);
                            }
                        }
                        if quote_start != 0 {
                            return Err(path_error(&format!("Unterminated quote at index {quote_start}"), str_));
                        }
                    }
                    if name.is_empty() {
                        return Err(path_error(&format!("Missing parameter name at index {}", *index), str_));
                    }
                    flush!();
                    out.push(PathToken { kind, value: String::new(), name, tokens: vec![] });
                    continue;
                }
                '{' => {
                    flush!();
                    let group = consume(chars, index, Some('}'), str_)?;
                    out.push(PathToken { kind: Kind::Group, value: String::new(), name: String::new(), tokens: group });
                    continue;
                }
                '}' | '(' | ')' | '[' | ']' | '+' | '?' | '!' => {
                    return Err(path_error(&format!("Unexpected {c} at index {}", *index - 1), str_));
                }
                _ => {}
            }
            text.push(c);
        }
        if let Some(e) = end {
            return Err(path_error(&format!("Unexpected end at index {}, expected {e}", *index), str_));
        }
        flush!();
        Ok(out)
    }
    consume(&chars, &mut index, None, s)
}

/// path-to-regexp's `flatten()`: every sequence with each group either included
/// or not, included first.
fn flatten_path(tokens: &[PathToken], mut index: usize, mut result: Vec<PathToken>, cb: &mut dyn FnMut(&[PathToken])) {
    while index < tokens.len() {
        let t = &tokens[index];
        index += 1;
        if t.kind == Kind::Group {
            let rest = index;
            let n = result.len();
            let base = result.clone();
            flatten_path(&t.tokens, 0, base, &mut |seq: &[PathToken]| {
                flatten_path(tokens, rest, seq.to_vec(), cb);
            });
            result.truncate(n);
            continue;
        }
        result.push(t.clone());
    }
    cb(&result);
}

/// `PathParams` is `pathToRegexp(path).keys.filter(k => k.type === 'param')
/// .map(k => k.name)` for path-to-regexp v8.4: optional `{...}` groups are
/// flattened into every combination (with the group first, then without), each
/// contributing its keys, so a name can repeat. The error carries
/// path-to-regexp's PathError message.
pub fn path_params(path: &str) -> Result<Vec<String>, String> {
    let tokens = parse_path(path)?;
    let mut params = Vec::new();
    let mut combinations = 0;
    let mut failure: Option<String> = None;
    flatten_path(&tokens, 0, Vec::new(), &mut |seq: &[PathToken]| {
        if failure.is_some() {
            return;
        }
        if combinations >= 256 {
            failure = Some(path_error("Too many path combinations", path));
            return;
        }
        combinations += 1;
        let mut prev_capture = false;
        let mut backtrack = String::new();
        for t in seq {
            if t.kind == Kind::Text {
                backtrack.push_str(&t.value);
                continue;
            }
            if prev_capture && backtrack.is_empty() {
                failure = Some(path_error(&format!("Missing text before \"{}\" {}", t.name, t.kind.as_str()), path));
                return;
            }
            if t.kind == Kind::Param {
                params.push(t.name.clone());
            }
            prev_capture = true;
            backtrack.clear();
        }
    });
    match failure {
        Some(f) => Err(f),
        None => Ok(params),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_patterns() {
        assert!(route_matches_pattern("/a/b", "/a/b"));
        assert!(route_matches_pattern("/a/b/c", "/a/*"));
        assert!(route_matches_pattern("/a/b/c", "*"));
        assert!(route_matches_pattern("/a/b/c", "/a/*/c"));
        assert!(!route_matches_pattern("/x/b", "/a/*"));
        assert!(!route_matches_pattern("/a/b", "/a"));
        assert!(route_matches_pattern("/a.b", "/a.b"));
        assert!(!route_matches_pattern("/aXb", "/a.b*"));
    }

    #[test]
    fn path_params_basic() {
        assert_eq!(path_params("/todos/:id").unwrap(), ["id"]);
        assert_eq!(path_params("/a/:x/b/:y").unwrap(), ["x", "y"]);
        assert_eq!(path_params("/files/*path").unwrap(), Vec::<String>::new());
        assert_eq!(path_params("/").unwrap(), Vec::<String>::new());
    }

    #[test]
    fn optional_groups_flatten_with_group_first() {
        // {:a} then without: names repeat per combination.
        assert_eq!(path_params("/x{/:a}").unwrap(), ["a"]);
        assert_eq!(path_params("/x{/:a}{/:b}").unwrap(), ["a", "b", "a", "b"]);
    }

    #[test]
    fn errors_carry_path_to_regexp_messages() {
        let e = path_params("/a/(b)").unwrap_err();
        assert!(e.starts_with("Unexpected ( at index 3: /a/(b); visit"), "{e}");
        assert!(path_params("/a/:").unwrap_err().starts_with("Missing parameter name at index 4"));
        assert!(path_params("/:a:b").unwrap_err().starts_with("Missing text before \"b\" param"));
    }
}
