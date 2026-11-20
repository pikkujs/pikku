//! Port of Go `internal/schemas/unknowns.go`: the generated-schema check.

use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use crate::diag::codes::GENERATED_SCHEMA_HAS_UNKNOWN;
use crate::diag::{Level, Logger};
use crate::state::State;
use crate::state::raw::Raw;

/// A place in a schema that admits anything ("unknown") or nothing ("never").
/// `path` names properties with `.name`, array items with `[]` and open-map
/// values with `[*]`; anyOf/allOf/$ref hops add nothing, so the same path is
/// reachable from the TypeScript type or the Zod schema it came from.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Hole {
    pub path: String,
    pub kind: &'static str,
}

/// The holes of one JSON Schema, without repeats.
pub fn find_schema_holes(schema: &Raw) -> Vec<Hole> {
    let Some(Value::Object(obj)) = schema.value() else { return Vec::new() };
    let mut definitions: HashMap<String, &Value> = HashMap::new();
    for key in ["definitions", "$defs"] {
        if let Some(Value::Object(group)) = obj.get(key) {
            for (name, target) in group {
                definitions.insert(name.clone(), target);
            }
        }
    }
    let mut body = Map::new();
    for (k, v) in obj {
        if k != "definitions" && k != "$defs" {
            body.insert(k.clone(), v.clone());
        }
    }
    let mut walker = Walker { definitions, holes: Vec::new(), seen: HashSet::new() };
    walker.visit(&Value::Object(body), "", &[]);
    walker.holes
}

struct Walker<'a> {
    definitions: HashMap<String, &'a Value>,
    holes: Vec<Hole>,
    seen: HashSet<String>,
}

impl Walker<'_> {
    fn add(&mut self, path: &str, kind: &'static str) {
        let path = if path.is_empty() { "$" } else { path };
        if self.seen.insert(format!("{kind}:{path}")) {
            self.holes.push(Hole { path: path.to_string(), kind });
        }
    }

    fn visit(&mut self, node: &Value, path: &str, refs: &[String]) {
        let Value::Object(n) = node else { return };
        if n.is_empty() {
            self.add(path, "unknown");
            return;
        }
        if let Some(Value::Object(not)) = n.get("not") {
            if not.is_empty() {
                self.add(path, "never");
                return;
            }
        }
        if let Some(Value::String(r)) = n.get("$ref") {
            let trimmed = r.strip_prefix("#/definitions/").unwrap_or(r);
            let trimmed = trimmed.strip_prefix("#/$defs/").unwrap_or(trimmed);
            let name = path_unescape(trimmed).unwrap_or_else(|| r.clone());
            if refs.iter().any(|x| *x == name) {
                return;
            }
            if let Some(target) = self.definitions.get(&name).copied() {
                let mut next = refs.to_vec();
                next.push(name);
                self.visit(target, path, &next);
            }
        }
        if let Some(Value::Object(props)) = n.get("properties") {
            let mut names: Vec<&String> = props.keys().collect();
            names.sort();
            for name in names {
                self.visit(&props[name], &format!("{path}.{name}"), refs);
            }
        }
        if let Some(Value::Array(prefix)) = n.get("prefixItems") {
            for child in prefix {
                self.visit(child, &format!("{path}[]"), refs);
            }
        }
        match n.get("items") {
            Some(items @ Value::Object(_)) => self.visit(items, &format!("{path}[]"), refs),
            Some(Value::Array(items)) => {
                for child in items {
                    self.visit(child, &format!("{path}[]"), refs);
                }
            }
            _ => {}
        }
        if let Some(ap @ Value::Object(_)) = n.get("additionalProperties") {
            self.visit(ap, &format!("{path}[*]"), refs);
        }
        for key in ["anyOf", "oneOf", "allOf"] {
            if let Some(Value::Array(members)) = n.get(key) {
                for m in members {
                    self.visit(m, path, refs);
                }
            }
        }
    }
}

/// Go `url.PathUnescape`: None when a `%` is not followed by two hex digits.
fn path_unescape(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Fails a function whose generated input or output schema admits anything or
/// nothing at a place its source did not say `unknown`: that is a type the
/// generator could not follow, and the schema validating the wire is looser
/// than the TypeScript the caller sees. `declared` maps a schema name to the
/// paths its source wrote as unknown/any.
pub fn check_generated(log: &mut Logger, st: &State, declared: &HashMap<String, HashSet<String>>) {
    let tm = &st.functions.types_map;
    for (_, fm) in st.functions.meta.iter() {
        for (label, names) in [("input", &fm.inputs), ("output", &fm.outputs)] {
            for type_name in names {
                let Ok(schema_name) = tm.get_unique_name(type_name) else { continue };
                if schema_name.is_empty() {
                    continue;
                }
                let Some(schema) = st.schemas.get(&schema_name) else { continue };
                for hole in find_schema_holes(schema) {
                    if hole.kind == "unknown" && declared.get(&schema_name).is_some_and(|p| p.contains(&hole.path)) {
                        continue;
                    }
                    let what = if hole.kind == "never" { "admits nothing (never)" } else { "admits anything (unknown)" };
                    log.diagnostic(
                        Level::Error,
                        GENERATED_SCHEMA_HAS_UNKNOWN,
                        format!(
                            "'{}' {label} schema '{schema_name}' {what} at '{}', which its source does not declare as unknown. \
                             The generator could not follow a type there, so the schema is looser than the TypeScript type. \
                             Declare the type fully, or write `unknown` explicitly if that is the intent.",
                            fm.pikku_func_id, hole.path
                        ),
                    );
                }
            }
        }
    }
}
