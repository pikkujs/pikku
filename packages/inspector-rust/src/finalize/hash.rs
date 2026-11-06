//! Port of Go `finalize/hash.go` (utils/hash.ts).

use sha2::{Digest, Sha256};

use super::jsval::V;

/// `canonicalJSON`: JSON.stringify with every object's keys sorted (UTF-16
/// code unit order; array-index keys still enumerate first).
pub fn canonical_json(v: &V) -> String {
    sort_deep(v).stringify().unwrap_or_else(|e| panic!("{e}"))
}

fn sort_deep(v: &V) -> V {
    match v {
        V::Arr(a) => V::arr(a.borrow().iter().map(sort_deep).collect()),
        V::Obj(_) => {
            let mut keys = v.keys();
            sort_js(&mut keys);
            let out = V::obj();
            for k in keys {
                out.set(&k, sort_deep(&v.get(&k)));
            }
            out
        }
        other => other.clone(),
    }
}

/// Sorts strings the way `Array#sort` does without a comparator.
pub fn sort_js(keys: &mut [String]) {
    keys.sort_by(|a, b| cmp_utf16(a, b));
}

pub fn cmp_utf16(a: &str, b: &str) -> std::cmp::Ordering {
    if a.is_ascii() && b.is_ascii() {
        return a.cmp(b);
    }
    a.encode_utf16().cmp(b.encode_utf16())
}

/// `hashString`: the first `length` hex digits of the SHA-256 of the input.
pub fn hash_string(input: &str, length: usize) -> String {
    let sum = Sha256::digest(input.as_bytes());
    let hex: String = sum.iter().map(|b| format!("{b:02x}")).collect();
    hex[..length.min(hex.len())].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorts_keys_deeply_and_by_utf16() {
        let v = V::of(vec![
            ("b", V::num(1.0)),
            ("a", V::of(vec![("z", V::Null), ("y", V::arr(vec![V::of(vec![("2", V::num(2.0)), ("1", V::num(1.0))])]))])),
        ]);
        assert_eq!(canonical_json(&v), r#"{"a":{"y":[{"1":1,"2":2}],"z":null},"b":1}"#);
        // U+1F600 (surrogates D83D..) sorts before U+FF5E in UTF-16 order, after it in UTF-8.
        let mut k = vec!["\u{ff5e}".to_string(), "\u{1f600}".to_string()];
        sort_js(&mut k);
        assert_eq!(k[0], "\u{1f600}");
    }

    #[test]
    fn hash_prefix() {
        assert_eq!(hash_string("abc", 8), "ba7816bf");
    }
}
