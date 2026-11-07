//! Port of Go `internal/tsjg/schema` (definition.go, unreachable.go,
//! marshal.go): JSON Schema draft-07 definitions as produced by the type
//! formatters.
//!
//! Go shares `*Definition` pointers and mutates them after the fact (the
//! circular-reference formatter hands out an empty definition and fills it
//! in), so a definition handle is [`Def`] = `Rc<RefCell<Definition>>`.

use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::rc::Rc;

use indexmap::IndexMap;
use serde_json::{Map, Value};

use super::fail;

pub type Def = Rc<RefCell<Definition>>;

pub fn def(d: Definition) -> Def {
    Rc::new(RefCell::new(d))
}

/// Pointer identity of a definition (Go compares `*Definition` values).
pub fn def_key(d: &Def) -> usize {
    Rc::as_ptr(d) as *const () as usize
}

/// `*Definition | []*Definition` (items).
#[derive(Clone, Debug)]
pub enum Items {
    One(Def),
    Many(Vec<Def>),
}

/// `bool | *Definition` (additionalProperties, additionalItems).
#[derive(Clone, Debug)]
pub enum Additional {
    Bool(bool),
    Def(Def),
}

/// Insertion-ordered property map; `Option<Properties>` on a definition is Go's
/// nil-able `*Properties`.
#[derive(Clone, Debug, Default)]
pub struct Properties(pub IndexMap<String, Def>);

impl Properties {
    pub fn new() -> Properties {
        Properties(IndexMap::new())
    }
    /// Keeps the position of an existing key.
    pub fn set(&mut self, key: String, value: Def) {
        self.0.insert(key, value);
    }
    pub fn get(&self, key: &str) -> Option<&Def> {
        self.0.get(key)
    }
    pub fn keys(&self) -> impl Iterator<Item = &String> {
        self.0.keys()
    }
    pub fn iter(&self) -> impl Iterator<Item = (&String, &Def)> {
        self.0.iter()
    }
    pub fn len(&self) -> usize {
        self.0.len()
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Go `schema.Definition`. `type_` holds a JSON string or an array of strings.
#[derive(Clone, Debug, Default)]
pub struct Definition {
    pub id: String,
    pub schema: String,
    pub ref_: String,
    pub comment: String,
    pub title: String,
    pub type_: Option<Value>,
    pub format: String,
    pub enum_: Option<Vec<Value>>,
    pub const_: Option<Value>,
    pub not: Option<Def>,
    pub all_of: Option<Vec<Def>>,
    pub any_of: Option<Vec<Def>>,
    pub one_of: Option<Vec<Def>>,
    pub if_: Option<Def>,
    pub then: Option<Def>,
    pub else_: Option<Def>,
    pub items: Option<Items>,
    pub min_items: Option<i64>,
    pub max_items: Option<i64>,
    pub additional_items: Option<Additional>,
    pub properties: Option<Properties>,
    pub required: Vec<String>,
    pub additional_properties: Option<Additional>,
    pub pattern_properties: Option<BTreeMap<String, Def>>,
    pub property_names: Option<Def>,
    pub discriminator: Option<Value>,
    pub definitions: Option<HashMap<String, Def>>,
    /// The key order of `definitions`: the generator's reachability order.
    pub definition_order: Vec<String>,
    /// Keywords TS adds to an existing definition object after creation, in the
    /// order they were added; they serialize after the others.
    pub appended: Vec<String>,
    /// Annotation keywords merged into the definition (sorted on output).
    pub extra: BTreeMap<String, Value>,
}

impl Definition {
    pub fn with_type(t: &str) -> Definition {
        Definition { type_: Some(Value::String(t.into())), ..Definition::default() }
    }

    pub fn set_extra(&mut self, key: &str, value: Value) {
        self.extra.insert(key.to_string(), value);
    }

    /// Whether the definition's type is or includes `name`.
    pub fn has_type(&self, name: &str) -> bool {
        match &self.type_ {
            Some(Value::String(s)) => s == name,
            Some(Value::Array(a)) => a.iter().any(|v| v.as_str() == Some(name)),
            _ => false,
        }
    }

    /// `Object.keys(def).length === 0`.
    pub fn is_empty(&self) -> bool {
        self.id.is_empty()
            && self.schema.is_empty()
            && self.ref_.is_empty()
            && self.comment.is_empty()
            && self.title.is_empty()
            && self.type_.is_none()
            && self.format.is_empty()
            && self.enum_.is_none()
            && self.const_.is_none()
            && self.not.is_none()
            && self.all_of.is_none()
            && self.any_of.is_none()
            && self.one_of.is_none()
            && self.if_.is_none()
            && self.then.is_none()
            && self.else_.is_none()
            && self.items.is_none()
            && self.min_items.is_none()
            && self.max_items.is_none()
            && self.additional_items.is_none()
            && self.properties.as_ref().is_none_or(|p| p.is_empty())
            && self.required.is_empty()
            && self.additional_properties.is_none()
            && self.pattern_properties.is_none()
            && self.property_names.is_none()
            && self.discriminator.is_none()
            && self.definitions.is_none()
            && self.extra.is_empty()
    }

    /// Type string equality (`def.Type == "null"`).
    pub fn type_is(&self, name: &str) -> bool {
        matches!(&self.type_, Some(Value::String(s)) if s == name)
    }
}

// ---------------------------------------------------------------------------
// Marshal (Definition.MarshalJSON): keyword order, appended keywords, sorted
// extras, definitions last.

/// Go `jsonSafe` plus encoding/json's sorted map keys.
fn json_safe(v: &Value) -> Value {
    match v {
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(0.0);
            if !f.is_finite() {
                Value::Null
            } else if f == 0.0 {
                Value::from(0.0f64)
            } else {
                v.clone()
            }
        }
        Value::Array(a) => Value::Array(a.iter().map(json_safe).collect()),
        Value::Object(m) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            Value::Object(keys.into_iter().map(|k| (k.clone(), json_safe(&m[k]))).collect::<Map<_, _>>())
        }
        _ => v.clone(),
    }
}

fn defs_to_value(l: &[Def]) -> Value {
    Value::Array(l.iter().map(to_value).collect())
}

fn additional_to_value(a: &Additional) -> Value {
    match a {
        Additional::Bool(b) => Value::Bool(*b),
        Additional::Def(d) => to_value(d),
    }
}

/// The JSON value of a definition, with the key order Go's MarshalJSON writes.
pub fn to_value(d: &Def) -> Value {
    let d = d.borrow();
    let mut fields: Vec<(&'static str, Value)> = Vec::new();
    let mut push = |k: &'static str, on: bool, v: &dyn Fn() -> Value| {
        if on {
            fields.push((k, v()));
        }
    };
    push("$id", !d.id.is_empty(), &|| Value::String(d.id.clone()));
    push("$schema", !d.schema.is_empty(), &|| Value::String(d.schema.clone()));
    push("$ref", !d.ref_.is_empty(), &|| Value::String(d.ref_.clone()));
    push("$comment", !d.comment.is_empty(), &|| Value::String(d.comment.clone()));
    push("title", !d.title.is_empty(), &|| Value::String(d.title.clone()));
    push("type", d.type_.is_some(), &|| json_safe(d.type_.as_ref().unwrap()));
    push("format", !d.format.is_empty(), &|| Value::String(d.format.clone()));
    push("enum", d.enum_.is_some(), &|| json_safe(&Value::Array(d.enum_.clone().unwrap())));
    push("const", d.const_.is_some(), &|| json_safe(d.const_.as_ref().unwrap()));
    push("not", d.not.is_some(), &|| to_value(d.not.as_ref().unwrap()));
    push("allOf", d.all_of.is_some(), &|| defs_to_value(d.all_of.as_ref().unwrap()));
    push("anyOf", d.any_of.is_some(), &|| defs_to_value(d.any_of.as_ref().unwrap()));
    push("oneOf", d.one_of.is_some(), &|| defs_to_value(d.one_of.as_ref().unwrap()));
    push("if", d.if_.is_some(), &|| to_value(d.if_.as_ref().unwrap()));
    push("then", d.then.is_some(), &|| to_value(d.then.as_ref().unwrap()));
    push("else", d.else_.is_some(), &|| to_value(d.else_.as_ref().unwrap()));
    push("items", d.items.is_some(), &|| match d.items.as_ref().unwrap() {
        Items::One(x) => to_value(x),
        Items::Many(l) => defs_to_value(l),
    });
    push("minItems", d.min_items.is_some(), &|| Value::from(d.min_items.unwrap()));
    push("maxItems", d.max_items.is_some(), &|| Value::from(d.max_items.unwrap()));
    push("additionalItems", d.additional_items.is_some(), &|| additional_to_value(d.additional_items.as_ref().unwrap()));
    push("properties", d.properties.is_some(), &|| {
        let p = d.properties.as_ref().unwrap();
        Value::Object(p.iter().map(|(k, v)| (k.clone(), to_value(v))).collect())
    });
    push("required", !d.required.is_empty(), &|| Value::Array(d.required.iter().cloned().map(Value::String).collect()));
    push("additionalProperties", d.additional_properties.is_some(), &|| {
        additional_to_value(d.additional_properties.as_ref().unwrap())
    });
    push("patternProperties", d.pattern_properties.is_some(), &|| {
        Value::Object(d.pattern_properties.as_ref().unwrap().iter().map(|(k, v)| (k.clone(), to_value(v))).collect())
    });
    push("propertyNames", d.property_names.is_some(), &|| to_value(d.property_names.as_ref().unwrap()));
    push("discriminator", d.discriminator.is_some(), &|| json_safe(d.discriminator.as_ref().unwrap()));

    let appended: HashSet<&str> = d.appended.iter().map(String::as_str).collect();
    let mut out = Map::new();
    let mut emitted: HashSet<String> = HashSet::new();
    for (k, v) in fields.iter().filter(|(k, _)| !appended.contains(k)) {
        out.insert(k.to_string(), v.clone());
        emitted.insert(k.to_string());
    }
    for k in &d.appended {
        if let Some((_, v)) = fields.iter().find(|(fk, _)| fk == k) {
            if !emitted.contains(k) {
                out.insert(k.clone(), v.clone());
                emitted.insert(k.clone());
            }
        }
    }
    for (k, v) in &d.extra {
        if emitted.contains(k) || (k == "definitions" && d.definitions.is_some()) {
            continue;
        }
        out.insert(k.clone(), json_safe(v));
        emitted.insert(k.clone());
    }
    if let Some(defs) = &d.definitions {
        let mut keys: Vec<&String> = Vec::new();
        let mut named: HashSet<&String> = HashSet::new();
        for k in &d.definition_order {
            if defs.contains_key(k) && named.insert(k) {
                keys.push(k);
            }
        }
        let mut rest: Vec<&String> = defs.keys().filter(|k| !named.contains(k)).collect();
        rest.sort();
        keys.extend(rest);
        out.insert("definitions".into(), Value::Object(keys.into_iter().map(|k| (k.clone(), to_value(&defs[k]))).collect()));
    }
    Value::Object(out)
}

// ---------------------------------------------------------------------------
// unreachable.go

const DEFINITION_PREFIX: &str = "#/definitions/";

/// The names reachable from `root`, in the order TS's Set first meets them.
pub fn remove_unreachable(root: Option<&Def>, definitions: &HashMap<String, Def>) -> Vec<String> {
    let Some(root) = root else {
        let mut names: Vec<String> = definitions.keys().cloned().collect();
        names.sort();
        return names;
    };
    let mut seen = HashSet::new();
    let mut order = Vec::new();
    add_reachable(root, definitions, &mut seen, &mut order);
    order
}

fn add_reachable(d: &Def, definitions: &HashMap<String, Def>, seen: &mut HashSet<String>, order: &mut Vec<String>) {
    let b = d.borrow();
    if !b.ref_.is_empty() {
        if !b.ref_.starts_with('#') {
            return;
        }
        let name = decode_ref(b.ref_.strip_prefix(DEFINITION_PREFIX).unwrap_or(&b.ref_));
        if !seen.insert(name.clone()) {
            return;
        }
        order.push(name.clone());
        match definitions.get(&name) {
            Some(r) => add_reachable(r, definitions, seen, order),
            None => fail(&format!("encountered a reference to a missing definition {:?}, this is a bug", b.ref_)),
        }
    } else if let Some(l) = &b.any_of {
        l.iter().for_each(|s| add_reachable(s, definitions, seen, order));
    } else if let Some(l) = &b.all_of {
        l.iter().for_each(|s| add_reachable(s, definitions, seen, order));
    } else if let Some(l) = &b.one_of {
        l.iter().for_each(|s| add_reachable(s, definitions, seen, order));
    } else if let Some(n) = &b.not {
        add_reachable(n, definitions, seen, order);
    } else if b.has_type("object") {
        if let Some(p) = &b.properties {
            p.iter().for_each(|(_, v)| add_reachable(v, definitions, seen, order));
        }
        if let Some(Additional::Def(ap)) = &b.additional_properties {
            add_reachable(ap, definitions, seen, order);
        }
    } else if b.has_type("array") {
        match &b.items {
            Some(Items::Many(l)) => l.iter().for_each(|s| add_reachable(s, definitions, seen, order)),
            Some(Items::One(i)) => add_reachable(i, definitions, seen, order),
            None => {}
        }
        if let Some(Additional::Def(ai)) = &b.additional_items {
            add_reachable(ai, definitions, seen, order);
        }
    } else if let Some(t) = &b.then {
        add_reachable(t, definitions, seen, order);
    }
}

/// `url.PathUnescape`; on a malformed escape the input is returned unchanged.
fn decode_ref(r: &str) -> String {
    let b = r.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = |c: u8| (c as char).to_digit(16);
            match (b.get(i + 1).and_then(|c| hex(*c)), b.get(i + 2).and_then(|c| hex(*c))) {
                (Some(h), Some(l)) => {
                    out.push((h * 16 + l) as u8);
                    i += 3;
                    continue;
                }
                _ => return r.to_string(),
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| r.to_string())
}

/// `encodeURIComponent` for a definition name.
pub fn encode_ref(name: &str) -> String {
    let mut s = String::new();
    for &b in name.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')' => s.push(b as char),
            _ => s.push_str(&format!("%{b:02X}")),
        }
    }
    s
}
