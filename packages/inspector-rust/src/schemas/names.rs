//! Port of Go `internal/schemas/names.go` and `primitive.go`.

use std::collections::HashSet;

use crate::state::State;
use crate::state::raw::Raw;

/// The names generateTSSchemas never asks the generator for.
pub const PRIMITIVE_TYPES: [&str; 9] = ["boolean", "string", "number", "null", "undefined", "void", "any", "unknown", "never"];

pub fn is_primitive(name: &str) -> bool {
    PRIMITIVE_TYPES.contains(&name)
}

/// A JS Set of strings.
#[derive(Default)]
pub struct OrderedSet {
    pub items: Vec<String>,
    seen: HashSet<String>,
}

impl OrderedSet {
    pub fn add(&mut self, v: &str) {
        if self.seen.insert(v.to_string()) {
            self.items.push(v.to_string());
        }
    }
    pub fn has(&self, v: &str) -> bool {
        self.seen.contains(v)
    }
}

/// generateTSSchemas' schemasSet, in its iteration order: every custom type,
/// the unique name of every function input and output, and schemasFromTypes.
/// Primitives are kept, as in the TS set; the caller skips them.
///
/// The TS also walks http.meta for each route's `inputTypes`, but
/// add-http-route always records `inputTypes: undefined`, so that loop never
/// adds anything and has no counterpart here.
pub fn schema_names(st: &State, schemas_from_types: &[String]) -> Vec<String> {
    let mut names = OrderedSet::default();
    let tm = &st.functions.types_map;
    for k in tm.custom_type_keys() {
        names.add(&k);
    }
    for (_, fm) in st.functions.meta.iter() {
        for list in [&fm.inputs, &fm.outputs] {
            for typ in list {
                // Types missing from the typesMap (inline types in generated
                // workflow workers) are skipped, as the TS catch does.
                if let Ok(unique) = tm.get_unique_name(typ) {
                    if !unique.is_empty() {
                        names.add(&unique);
                    }
                }
            }
        }
    }
    for typ in schemas_from_types {
        names.add(typ);
    }
    names.items
}

/// The fallback for a custom type the generator has no declaration for.
pub fn primitive_type_to_schema(typ: &str) -> Option<Raw> {
    let s = match typ.trim() {
        "boolean" | "false | true" | "true | false" => r#"{"type":"boolean"}"#,
        "true" => r#"{"const":true}"#,
        "false" => r#"{"const":false}"#,
        "string" => r#"{"type":"string"}"#,
        "number" => r#"{"type":"number"}"#,
        "null" => r#"{"type":"null"}"#,
        "any" | "unknown" => "{}",
        _ => return None,
    };
    Some(Raw::of(serde_json::from_str(s).unwrap()))
}
