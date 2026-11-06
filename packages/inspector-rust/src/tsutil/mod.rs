//! Port of Go `internal/tsutil`: AST/text helpers with no Context.
//!
//! Layout mirrors Go's files: [`text`] (text.go), [`props`] (props.go),
//! [`route`] (route.go), [`governance`] (governance.go: the literal-property
//! readers and JS number formatting), [`print`] (print.go), [`sortjs`],
//! [`types`] (types.go / ptr.go). `walk.go` lives in this file.
//!
use tsrs_ast::Node;
use tsrs_core::P;

pub mod governance;
pub mod print;
pub mod props;
pub mod route;
pub mod sortjs;
pub mod text;
pub mod typeorder;
pub mod types;
pub mod unionorder;

pub use governance::*;
pub use props::*;
pub use route::*;
pub use sortjs::*;
pub use text::*;
pub use types::*;

/// Visits `node`'s descendants in pre-order, the order recursive
/// `ts.forEachChild` gives; `node` itself is not visited.
pub fn walk(node: P<Node>, visit: &mut dyn FnMut(P<Node>)) {
    node.for_each_child(&mut |child| {
        visit(child);
        walk(child, visit);
        false
    });
}

/// [`walk`], visiting `node` first.
pub fn walk_self(node: P<Node>, visit: &mut dyn FnMut(P<Node>)) {
    visit(node);
    walk(node, visit);
}

/// Keeps the first occurrence of each string, in order.
pub fn dedupe(input: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    input.iter().filter(|s| seen.insert(s.as_str())).cloned().collect()
}

/// The keys of a set, sorted (Go `SortedKeys`, a byte-wise sort).
pub fn sorted_keys<'a>(keys: impl IntoIterator<Item = &'a String>) -> Vec<String> {
    let mut out: Vec<String> = keys.into_iter().cloned().collect();
    out.sort();
    out
}

/// Converts a UTF-8 byte offset into `text` to the UTF-16 code-unit offset
/// Strada would report for the same position. tsrs positions are byte offsets
/// like typescript-go's, so every position that reaches the state goes through
/// this (PORTING.md, "UTF-16 offsets").
pub fn utf16_offset(text: &str, byte_off: usize) -> usize {
    text[..byte_off].chars().map(char::len_utf16).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf16_offsets_count_surrogate_pairs() {
        let t = "a😀é b";
        assert_eq!(utf16_offset(t, 0), 0);
        assert_eq!(utf16_offset(t, 1), 1);
        assert_eq!(utf16_offset(t, 5), 3); // after the emoji: 2 code units
        assert_eq!(utf16_offset(t, 7), 4); // after é
    }

    #[test]
    fn dedupe_keeps_first() {
        let v = vec!["b".to_string(), "a".into(), "b".into()];
        assert_eq!(dedupe(&v), ["b", "a"]);
    }
}
