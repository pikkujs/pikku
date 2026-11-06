//! Port of Go `tsutil/sortjs.go`.

use std::cmp::Ordering;

/// Compares two strings by UTF-16 code units, as `Array#sort` without a
/// comparator (and `<` on JS strings) does.
pub fn compare_utf16(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// `SortStringsJS`: a stable sort by UTF-16 code units.
pub fn sort_strings_js(values: &mut [String]) {
    values.sort_by(|a, b| compare_utf16(a, b));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_by_code_unit_not_code_point() {
        // In code points U+FF5E < U+1F600; in UTF-16 the astral char starts
        // with 0xD83D, which sorts first.
        let mut v = vec!["\u{ff5e}".to_string(), "\u{1f600}".into(), "a".into()];
        sort_strings_js(&mut v);
        assert_eq!(v, ["a", "\u{1f600}", "\u{ff5e}"]);
        assert_eq!(compare_utf16("ab", "abc"), Ordering::Less);
    }
}
