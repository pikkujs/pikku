//! Port of Go `internal/schemas/customtypes.go` (utils/custom-types-generator.ts):
//! the source of the virtual file the schema program is rooted at.

use std::collections::HashMap;
use std::sync::OnceLock;

use regex::Regex;

use super::names::OrderedSet;
use crate::typesmap::TypesMap;

fn undefined_generic() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?-u:\b)(Name|In|Out|Key)(?-u:\b)").unwrap())
}
fn bracketed() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\[.*\]").unwrap())
}
fn capitalised_ident() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"(?-u:\b)[A-Z][a-zA-Z0-9]*(?-u:\b)").unwrap())
}
const UTILITY_TYPE_NAMES: [&str; 6] = ["Pick", "Omit", "Partial", "Required", "Record", "Readonly"];
fn is_classification_tag(s: &str) -> bool {
    matches!(s, "Private" | "Pii" | "Secret")
}

/// sanitizeTypeName. The TS regex has no u flag, so a character outside the
/// BMP is two code units and becomes two underscores.
pub fn sanitize_type_name(name: &str) -> String {
    let mut b = String::new();
    for r in name.chars() {
        if r.is_ascii() && is_ident_part(r as u8) {
            b.push(r);
        } else if (r as u32) > 0xFFFF {
            b.push_str("__");
        } else {
            b.push('_');
        }
    }
    if b.as_bytes().first().is_some_and(|c| c.is_ascii_digit()) {
        return format!("_{b}");
    }
    b
}

fn is_ident_start(c: u8) -> bool {
    c == b'_' || c == b'$' || c.is_ascii_alphabetic()
}

fn is_ident_part(c: u8) -> bool {
    is_ident_start(c) || c.is_ascii_digit()
}

fn find_matching_angle_bracket(typ: &[u8], start: usize) -> Option<usize> {
    let mut depth = 0;
    for i in start..typ.len() {
        if typ[i] == b'<' {
            depth += 1;
        } else if typ[i] == b'>' && (i == 0 || typ[i - 1] != b'=') {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
    }
    None
}

fn strip_classification_wrappers(typ: &str) -> String {
    let b = typ.as_bytes();
    let mut out: Vec<u8> = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if !is_ident_start(b[i]) {
            out.push(b[i]);
            i += 1;
            continue;
        }
        let mut end = i + 1;
        while end < b.len() && is_ident_part(b[end]) {
            end += 1;
        }
        let ident = &typ[i..end];
        if is_classification_tag(ident) && end < b.len() && b[end] == b'<' {
            if let Some(closing) = find_matching_angle_bracket(b, end) {
                out.extend_from_slice(strip_classification_wrappers(&typ[end + 1..closing]).as_bytes());
                i = closing + 1;
                continue;
            }
        }
        out.extend_from_slice(ident.as_bytes());
        i = end;
    }
    String::from_utf8(out).expect("only ASCII bytes are acted on")
}

/// Stands in for String.prototype.localeCompare under Node's default ICU
/// locale. Only declaration order in the virtual file depends on it, never a
/// schema. Approximation: case-insensitive first, lowercase before uppercase on ties.
fn locale_sort(names: &mut [String]) {
    names.sort_by(|a, b| {
        a.to_lowercase().cmp(&b.to_lowercase()).then_with(|| b.cmp(a))
    });
}

/// generateCustomTypes: the virtual file's source and the names it imports.
pub fn generate_custom_types(tm: &TypesMap) -> (String, Vec<String>) {
    let mut required = OrderedSet::default();
    let mut names = tm.custom_type_keys();
    locale_sort(&mut names);

    let mut decls: Vec<String> = Vec::new();
    for original_name in &names {
        let ct = tm.custom_type(original_name).expect("key from custom_type_keys");
        if undefined_generic().is_match(&ct.ty) && bracketed().is_match(&ct.ty) {
            continue;
        }
        let name = sanitize_type_name(original_name);
        for r in &ct.references {
            if r != "__object" && !r.starts_with("__object_") && !is_classification_tag(r) {
                required.add(r);
            }
        }

        let type_string = strip_classification_wrappers(&ct.ty);
        for m in capitalised_ident().find_iter(&type_string) {
            let type_name = m.as_str();
            if type_string.contains(&format!("\"{type_name}\"")) || UTILITY_TYPE_NAMES.contains(&type_name) {
                continue;
            }
            if let Ok(meta) = tm.get_type_meta(type_name) {
                if meta.path.as_deref().is_some_and(|p| !p.is_empty()) {
                    required.add(&meta.original_name);
                }
            }
        }

        if name == type_string {
            continue;
        }
        decls.push(format!("export type {name} = {type_string}"));
    }

    let mut paths: Vec<String> = Vec::new();
    let mut imports_by_path: HashMap<String, OrderedSet> = HashMap::new();
    for type_name in &required.items {
        if is_classification_tag(type_name) {
            continue;
        }
        let Ok(meta) = tm.get_type_meta(type_name) else { continue };
        let Some(path) = meta.path.filter(|p| !p.is_empty()) else { continue };
        if !imports_by_path.contains_key(&path) {
            paths.push(path.clone());
        }
        imports_by_path.entry(path).or_default().add(&meta.original_name);
    }

    let imports: Vec<String> = paths
        .iter()
        .map(|p| format!("import type {{ {} }} from '{}'", imports_by_path[p].items.join(", "), p))
        .collect();
    (format!("{}\n\n{}", imports.join("\n"), decls.join("\n")), required.items)
}
