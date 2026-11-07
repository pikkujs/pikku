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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::meta::FunctionMeta;

    #[test]
    fn schema_names_order() {
        let mut st = State::new("/root");
        {
            let tm = &mut st.functions.types_map;
            tm.add_custom_type("ZodInput", "{ a: string }", vec![]);
            tm.add_custom_type("Inline", "{ b: number }", vec![]);
            tm.add_type("User", "/root/user.ts");
        }
        let item_a = st.functions.types_map.add_unique_type("Item", "/root/a.ts");
        st.functions.types_map.add_unique_type("Item", "/root/b.ts");
        let s = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let mk = |i: Vec<String>, o: Vec<String>| {
            let mut m = FunctionMeta::default();
            m.inputs = i;
            m.outputs = o;
            m
        };
        st.functions.meta.set("f2", mk(s(&["User", "string"]), vec![item_a.clone()]));
        st.functions.meta.set("f1", mk(s(&["Inline", "NotInTypesMap"]), s(&["User"])));
        st.functions.meta.set("10", mk(vec![], s(&["void"])));
        let got = schema_names(&st, &s(&["Extra", "User"]));
        // "10" is an array index, so Object.values visits it first.
        assert_eq!(got, ["ZodInput", "Inline", "void", "User", "string", &item_a, "Extra"]);
    }

    #[test]
    fn primitive_fallbacks() {
        assert_eq!(primitive_type_to_schema(" true ").unwrap().value().unwrap().to_string(), r#"{"const":true}"#);
        assert!(primitive_type_to_schema("Foo").is_none());
    }
}
