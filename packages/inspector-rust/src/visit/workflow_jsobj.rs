//! Port of Go `visit/workflow_jsobj.go`.
//!
//! The workflow extractors build plain JS objects whose key order is the order
//! of the TS object literals, including keys whose value is `undefined` (they
//! keep their position when assigned later, and `JSON.stringify` skips them).
//! [`JsObj`] models exactly that; the workflow meta is serialized from it.

use serde_json::{Number, Value};

use crate::state::Raw;

/// A JS value. [`Js::Undef`] is `undefined`: a key holding it is skipped when
/// the object is encoded, and inside an array it becomes `null`.
#[derive(Clone, Debug, PartialEq)]
pub enum Js {
    Undef,
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Js>),
    Obj(JsObj),
}

/// An object with insertion-ordered keys; re-setting a key keeps its position.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct JsObj {
    entries: Vec<(String, Js)>,
}

macro_rules! jo {
    ($($k:expr => $v:expr),* $(,)?) => {{
        #[allow(unused_mut)]
        let mut o = $crate::visit::workflow_jsobj::JsObj::new();
        $( o.set($k, $crate::visit::workflow_jsobj::Js::from($v)); )*
        o
    }};
}
pub(crate) use jo;

impl From<&str> for Js {
    fn from(s: &str) -> Js {
        Js::Str(s.to_string())
    }
}
impl From<String> for Js {
    fn from(s: String) -> Js {
        Js::Str(s)
    }
}
impl From<&String> for Js {
    fn from(s: &String) -> Js {
        Js::Str(s.clone())
    }
}
impl From<bool> for Js {
    fn from(b: bool) -> Js {
        Js::Bool(b)
    }
}
impl From<f64> for Js {
    fn from(n: f64) -> Js {
        Js::Num(n)
    }
}
impl From<JsObj> for Js {
    fn from(o: JsObj) -> Js {
        Js::Obj(o)
    }
}
/// A step list (`[]*jsObj`).
impl From<Vec<JsObj>> for Js {
    fn from(v: Vec<JsObj>) -> Js {
        Js::Arr(v.into_iter().map(Js::Obj).collect())
    }
}
/// A `[]string`.
impl From<Vec<String>> for Js {
    fn from(v: Vec<String>) -> Js {
        Js::Arr(v.into_iter().map(Js::Str).collect())
    }
}
impl From<Vec<Js>> for Js {
    fn from(v: Vec<Js>) -> Js {
        Js::Arr(v)
    }
}
impl From<Option<String>> for Js {
    fn from(v: Option<String>) -> Js {
        v.map_or(Js::Undef, Js::Str)
    }
}

impl Js {
    pub fn is_undef(&self) -> bool {
        matches!(self, Js::Undef)
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Js::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_obj(&self) -> Option<&JsObj> {
        match self {
            Js::Obj(o) => Some(o),
            _ => None,
        }
    }

    /// `JSON.stringify`'s view: `None` for `undefined`.
    pub fn to_value(&self) -> Option<Value> {
        Some(match self {
            Js::Undef => return None,
            Js::Null => Value::Null,
            Js::Bool(b) => Value::Bool(*b),
            // NaN and the infinities encode as null, as in JSON.stringify.
            Js::Num(n) => Number::from_f64(*n).map_or(Value::Null, Value::Number),
            Js::Str(s) => Value::String(s.clone()),
            Js::Arr(a) => Value::Array(a.iter().map(|e| e.to_value().unwrap_or(Value::Null)).collect()),
            Js::Obj(o) => o.to_value(),
        })
    }
}

impl JsObj {
    pub fn new() -> JsObj {
        JsObj::default()
    }

    /// Assigns `k`; an existing key keeps its position.
    pub fn set(&mut self, k: &str, v: impl Into<Js>) {
        let v = v.into();
        if let Some(e) = self.entries.iter_mut().find(|(n, _)| n == k) {
            e.1 = v;
        } else {
            self.entries.push((k.to_string(), v));
        }
    }

    pub fn has(&self, k: &str) -> bool {
        self.entries.iter().any(|(n, _)| n == k)
    }

    /// The value of `k`, or `undefined`.
    pub fn get(&self, k: &str) -> &Js {
        self.entries.iter().find(|(n, _)| n == k).map_or(&Js::Undef, |(_, v)| v)
    }

    pub fn get_mut(&mut self, k: &str) -> Option<&mut Js> {
        self.entries.iter_mut().find(|(n, _)| n == k).map(|(_, v)| v)
    }

    /// `k`'s value when it is a string.
    pub fn str(&self, k: &str) -> Option<&str> {
        self.get(k).as_str()
    }

    /// `k`'s value when it is a step list.
    pub fn steps(&self, k: &str) -> Vec<&JsObj> {
        match self.get(k) {
            Js::Arr(a) => a.iter().filter_map(Js::as_obj).collect(),
            _ => vec![],
        }
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.entries.iter().map(|(k, _)| k.as_str())
    }

    /// `Object.keys(o).length` for the keys whose value is defined.
    pub fn defined_len(&self) -> usize {
        self.entries.iter().filter(|(_, v)| !v.is_undef()).count()
    }

    pub fn to_value(&self) -> Value {
        let mut m = serde_json::Map::new();
        for (k, v) in &self.entries {
            if let Some(v) = v.to_value() {
                m.insert(k.clone(), v);
            }
        }
        Value::Object(m)
    }

    /// Encodes the object for a `Record<Raw>` state section.
    pub fn raw(&self) -> Raw {
        Raw::of(self.to_value())
    }
}

/// `Number(numericLiteral.text)`.
pub fn js_number(text: &str) -> f64 {
    let t = text.replace('_', "");
    if let Ok(f) = t.parse::<f64>() {
        return f;
    }
    let b = t.as_bytes();
    if b.len() > 2 && b[0] == b'0' {
        let base = match b[1] {
            b'x' | b'X' => 16,
            b'o' | b'O' => 8,
            b'b' | b'B' => 2,
            _ => 0,
        };
        if base != 0 {
            if let Ok(n) = u64::from_str_radix(&t[2..], base) {
                return n as f64;
            }
        }
    }
    0.0
}

/// JS `s.slice(0, n)` (UTF-16 code units).
pub fn utf16_prefix(s: &str, n: usize) -> String {
    let u: Vec<u16> = s.encode_utf16().collect();
    if u.len() <= n {
        return s.to_string();
    }
    String::from_utf16_lossy(&u[..n])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn undefined_keys_keep_their_position_and_are_skipped() {
        let mut o = jo!("a" => 1.0, "b" => Js::Undef, "c" => "x");
        o.set("b", true);
        o.set("a", Js::Undef);
        assert_eq!(crate::jsjson::to_string(&o.to_value()).unwrap(), r#"{"b":true,"c":"x"}"#);
        assert_eq!(o.defined_len(), 2);
    }

    #[test]
    fn undefined_in_array_is_null_and_numbers_are_js() {
        let v = Js::Arr(vec![Js::Undef, Js::Num(500.0), Js::Num(0.5), Js::Null]);
        assert_eq!(crate::jsjson::to_string(&v.to_value().unwrap()).unwrap(), "[null,500,0.5,null]");
    }

    #[test]
    fn numbers_and_prefixes() {
        assert_eq!(js_number("1_000"), 1000.0);
        assert_eq!(js_number("0x10"), 16.0);
        assert_eq!(js_number("0b11"), 3.0);
        assert_eq!(utf16_prefix("abcdef", 3), "abc");
        assert_eq!(utf16_prefix("ab", 3), "ab");
    }
}
