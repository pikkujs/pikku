//! Port of Go `finalize/jsvalue.go`: the JS-value model the finalize steps work
//! on where a state section is Raw JSON. Objects enumerate keys as a JS object
//! does (array-index keys first), can hold `undefined` members (they keep their
//! position and are dropped on encoding) and are shared by reference, so
//! in-place mutation behaves like JS object references.

use std::cell::RefCell;
use std::rc::Rc;

use indexmap::IndexMap;
use serde::ser::{SerializeMap, SerializeSeq};
use serde::{Serialize, Serializer};
use serde_json::Value;

#[derive(Default, Debug)]
pub struct Obj {
    map: IndexMap<String, V>,
}

pub type ObjRef = Rc<RefCell<Obj>>;
pub type ArrRef = Rc<RefCell<Vec<V>>>;

/// A JS value. `Undef` is `undefined`; `Null` is `null`.
#[derive(Clone, Debug, Default)]
pub enum V {
    #[default]
    Undef,
    Null,
    Bool(bool),
    Num(f64),
    Str(Rc<str>),
    Arr(ArrRef),
    Obj(ObjRef),
}

/// Some(n) when `k` is a canonical array index (JS enumerates those first).
pub fn array_index(k: &str) -> Option<u64> {
    let b = k.as_bytes();
    if b.is_empty() || b.len() > 10 || (b.len() > 1 && b[0] == b'0') || !b.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let n: u64 = k.parse().ok()?;
    (n < (1 << 32) - 1).then_some(n)
}

pub fn js_key_order<'a>(keys: impl Iterator<Item = &'a String>) -> Vec<String> {
    let all: Vec<&String> = keys.collect();
    let mut idx: Vec<(u64, &String)> = all.iter().filter_map(|k| array_index(k).map(|n| (n, *k))).collect();
    if idx.is_empty() {
        return all.into_iter().cloned().collect();
    }
    idx.sort_by_key(|(n, _)| *n);
    let mut out: Vec<String> = idx.into_iter().map(|(_, k)| k.clone()).collect();
    out.extend(all.into_iter().filter(|k| array_index(k).is_none()).cloned());
    out
}

impl V {
    pub fn obj() -> V {
        V::Obj(Rc::new(RefCell::new(Obj::default())))
    }

    pub fn arr(items: Vec<V>) -> V {
        V::Arr(Rc::new(RefCell::new(items)))
    }

    pub fn str(s: impl AsRef<str>) -> V {
        V::Str(Rc::from(s.as_ref()))
    }

    pub fn num(n: impl Into<f64>) -> V {
        V::Num(n.into())
    }

    /// `Obj("k", v, ...)`.
    pub fn of(kv: Vec<(&str, V)>) -> V {
        let o = V::obj();
        for (k, v) in kv {
            o.set(k, v);
        }
        o
    }

    pub fn is_undef(&self) -> bool {
        matches!(self, V::Undef)
    }

    pub fn is_null(&self) -> bool {
        matches!(self, V::Null)
    }

    /// `v == null`.
    pub fn nullish(&self) -> bool {
        matches!(self, V::Undef | V::Null)
    }

    pub fn truthy(&self) -> bool {
        match self {
            V::Undef | V::Null => false,
            V::Bool(b) => *b,
            V::Num(n) => *n != 0.0 && !n.is_nan(),
            V::Str(s) => !s.is_empty(),
            _ => true,
        }
    }

    pub fn as_obj(&self) -> Option<&ObjRef> {
        match self {
            V::Obj(o) => Some(o),
            _ => None,
        }
    }

    pub fn as_arr(&self) -> Option<&ArrRef> {
        match self {
            V::Arr(a) => Some(a),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            V::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            V::Num(n) => Some(*n),
            _ => None,
        }
    }

    pub fn is_obj(&self) -> bool {
        matches!(self, V::Obj(_))
    }

    pub fn is_arr(&self) -> bool {
        matches!(self, V::Arr(_))
    }

    /// `v === "s"`.
    pub fn is_str(&self, s: &str) -> bool {
        matches!(self, V::Str(x) if &**x == s)
    }

    /// `o[k]`; `Undef` when absent or when `self` is not an object.
    pub fn get(&self, k: &str) -> V {
        match self {
            V::Obj(o) => o.borrow().map.get(k).cloned().unwrap_or(V::Undef),
            _ => V::Undef,
        }
    }

    /// Like [`get`](Self::get), but also indexes arrays by array-index keys
    /// (`jsGet`).
    pub fn js_get(&self, k: &str) -> V {
        match self {
            V::Obj(_) => self.get(k),
            V::Arr(a) => match array_index(k) {
                Some(n) if (n as usize) < a.borrow().len() => a.borrow()[n as usize].clone(),
                _ => V::Undef,
            },
            _ => V::Undef,
        }
    }

    pub fn js_set(&self, k: &str, v: V) {
        match self {
            V::Obj(_) => {
                self.set(k, v);
            }
            V::Arr(a) => {
                if let Some(n) = array_index(k) {
                    let mut a = a.borrow_mut();
                    if (n as usize) < a.len() {
                        a[n as usize] = v;
                    }
                }
            }
            _ => {}
        }
    }

    /// `o[k] = v`: a new key goes last, an existing one keeps its place.
    pub fn set(&self, k: &str, v: V) -> V {
        if let V::Obj(o) = self {
            o.borrow_mut().map.insert(k.to_string(), v);
        }
        self.clone()
    }

    pub fn has(&self, k: &str) -> bool {
        match self {
            V::Obj(o) => o.borrow().map.contains_key(k),
            _ => false,
        }
    }

    pub fn delete(&self, k: &str) {
        if let V::Obj(o) = self {
            o.borrow_mut().map.shift_remove(k);
        }
    }

    /// `Object.keys(o)` (members holding undefined included); array keys for
    /// arrays.
    pub fn keys(&self) -> Vec<String> {
        match self {
            V::Obj(o) => js_key_order(o.borrow().map.keys()),
            V::Arr(a) => (0..a.borrow().len()).map(|i| i.to_string()).collect(),
            _ => vec![],
        }
    }

    pub fn len(&self) -> usize {
        match self {
            V::Obj(o) => o.borrow().map.len(),
            V::Arr(a) => a.borrow().len(),
            _ => 0,
        }
    }

    /// A shallow copy of an object (`Clone`) or array.
    pub fn shallow_clone(&self) -> V {
        match self {
            V::Obj(o) => {
                let c = V::obj();
                for (k, v) in o.borrow().map.iter() {
                    c.set(k, v.clone());
                }
                c
            }
            V::Arr(a) => V::arr(a.borrow().clone()),
            other => other.clone(),
        }
    }

    pub fn deep_clone(&self) -> V {
        match self {
            V::Obj(o) => {
                let c = V::obj();
                for (k, v) in o.borrow().map.iter() {
                    c.set(k, v.deep_clone());
                }
                c
            }
            V::Arr(a) => V::arr(a.borrow().iter().map(V::deep_clone).collect()),
            other => other.clone(),
        }
    }

    /// The elements of an array (empty for anything else).
    pub fn items(&self) -> Vec<V> {
        match self {
            V::Arr(a) => a.borrow().clone(),
            _ => vec![],
        }
    }

    /// `arr.push(v)`.
    pub fn push(&self, v: V) {
        if let V::Arr(a) = self {
            a.borrow_mut().push(v);
        }
    }

    /// Reference identity of an object, or of a non-empty array (Go uses the
    /// backing store; an empty array has none).
    pub fn identity(&self) -> Option<usize> {
        match self {
            V::Obj(o) => Some(Rc::as_ptr(o) as *const u8 as usize),
            V::Arr(a) if !a.borrow().is_empty() => Some(Rc::as_ptr(a) as *const u8 as usize),
            _ => None,
        }
    }

    /// `String(v)` / `${v}` for the values a template interpolates.
    pub fn template_string(&self) -> String {
        match self {
            V::Null => "null".into(),
            V::Undef => "undefined".into(),
            V::Bool(b) => b.to_string(),
            V::Num(n) => number_string(*n),
            V::Str(s) => s.to_string(),
            V::Obj(_) => "[object Object]".into(),
            V::Arr(a) => {
                let mut s = String::new();
                for (i, x) in a.borrow().iter().enumerate() {
                    if i > 0 {
                        s.push(',');
                    }
                    if !x.nullish() {
                        s.push_str(&x.template_string());
                    }
                }
                s
            }
        }
    }

    pub fn from_json(v: &Value) -> V {
        match v {
            Value::Null => V::Null,
            Value::Bool(b) => V::Bool(*b),
            Value::Number(n) => V::Num(n.as_f64().unwrap_or(f64::NAN)),
            Value::String(s) => V::str(s),
            Value::Array(a) => V::arr(a.iter().map(V::from_json).collect()),
            Value::Object(o) => {
                let r = V::obj();
                for (k, x) in o {
                    r.set(k, V::from_json(x));
                }
                r
            }
        }
    }

    /// The `serde_json::Value` JSON.stringify would write: undefined members
    /// dropped, undefined array elements and non-finite numbers null.
    pub fn to_json(&self) -> Value {
        match self {
            V::Undef | V::Null => Value::Null,
            V::Bool(b) => Value::Bool(*b),
            V::Num(n) => num_json(*n),
            V::Str(s) => Value::String(s.to_string()),
            V::Arr(a) => Value::Array(a.borrow().iter().map(V::to_json).collect()),
            V::Obj(_) => {
                let mut m = serde_json::Map::new();
                for k in self.keys() {
                    let x = self.get(&k);
                    if !x.is_undef() {
                        m.insert(k, x.to_json());
                    }
                }
                Value::Object(m)
            }
        }
    }

    /// `JSON.stringify(v)`; Err on a circular structure.
    pub fn stringify(&self) -> Result<String, String> {
        crate::jsjson::to_string(self).map_err(|e| e.to_string())
    }
}

fn num_json(n: f64) -> Value {
    if !n.is_finite() {
        return Value::Null;
    }
    if n.fract() == 0.0 && n.abs() < 9.0e15 {
        return Value::from(n as i64);
    }
    serde_json::Number::from_f64(n).map(Value::Number).unwrap_or(Value::Null)
}

/// `String(n)`.
pub fn number_string(n: f64) -> String {
    if n.is_nan() {
        "NaN".into()
    } else if n == f64::INFINITY {
        "Infinity".into()
    } else if n == f64::NEG_INFINITY {
        "-Infinity".into()
    } else {
        crate::jsjson::format_number(n)
    }
}

thread_local! {
    static STACK: RefCell<Vec<usize>> = const { RefCell::new(Vec::new()) };
}

impl Serialize for V {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            V::Undef | V::Null => s.serialize_unit(),
            V::Bool(b) => s.serialize_bool(*b),
            V::Num(n) => {
                if n.is_finite() {
                    s.serialize_f64(*n)
                } else {
                    s.serialize_unit()
                }
            }
            V::Str(x) => s.serialize_str(x),
            V::Arr(a) => {
                let id = Rc::as_ptr(a) as *const u8 as usize;
                guard(id, || {
                    let a = a.borrow();
                    let mut seq = s.serialize_seq(Some(a.len()))?;
                    for x in a.iter() {
                        seq.serialize_element(x)?;
                    }
                    seq.end()
                })
            }
            V::Obj(o) => {
                let id = Rc::as_ptr(o) as *const u8 as usize;
                guard(id, || {
                    let keys: Vec<String> = self.keys().into_iter().filter(|k| !self.get(k).is_undef()).collect();
                    let mut m = s.serialize_map(Some(keys.len()))?;
                    for k in &keys {
                        m.serialize_entry(k, &o.borrow().map[k])?;
                    }
                    m.end()
                })
            }
        }
    }
}

fn guard<T, E: serde::ser::Error>(id: usize, f: impl FnOnce() -> Result<T, E>) -> Result<T, E> {
    let circular = STACK.with(|st| st.borrow().contains(&id));
    if circular {
        return Err(E::custom("Converting circular structure to JSON"));
    }
    STACK.with(|st| st.borrow_mut().push(id));
    let r = f();
    STACK.with(|st| st.borrow_mut().pop());
    r
}

/// An ordered JS `Set<string>`.
#[derive(Default, Clone)]
pub struct OrderedSet {
    pub items: Vec<String>,
    seen: std::collections::HashSet<String>,
}

impl OrderedSet {
    pub fn add(&mut self, v: impl Into<String>) {
        let v = v.into();
        if self.seen.insert(v.clone()) {
            self.items.push(v);
        }
    }

    pub fn has(&self, v: &str) -> bool {
        self.seen.contains(v)
    }
}
