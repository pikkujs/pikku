//! Port of Go `visit/addon_json.go`: a parsed JSON value that keeps object key
//! order (JS enumeration order: array-index keys first), so metadata read from
//! an addon's generated files can be edited (JSON.parse, mutate,
//! JSON.stringify in the TS) and written back in the order JS would write it.

use std::fmt;

use serde::de::{self, MapAccess, SeqAccess, Visitor};
use serde::ser::{SerializeMap, SerializeSeq};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::state::{Raw, Record};

#[derive(Clone, Debug, PartialEq)]
pub enum OJson {
    Obj(Record<OJson>),
    Arr(Vec<OJson>),
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
}

impl Serialize for OJson {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            OJson::Obj(r) => {
                let mut m = s.serialize_map(Some(r.len()))?;
                for (k, v) in r.iter() {
                    m.serialize_entry(k, v)?;
                }
                m.end()
            }
            OJson::Arr(a) => {
                let mut q = s.serialize_seq(Some(a.len()))?;
                for v in a {
                    q.serialize_element(v)?;
                }
                q.end()
            }
            OJson::Null => s.serialize_unit(),
            OJson::Bool(b) => s.serialize_bool(*b),
            OJson::Num(n) => s.serialize_f64(*n),
            OJson::Str(x) => s.serialize_str(x),
        }
    }
}

impl<'de> Deserialize<'de> for OJson {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct Vis;
        impl<'de> Visitor<'de> for Vis {
            type Value = OJson;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("any JSON value")
            }
            fn visit_unit<E: de::Error>(self) -> Result<OJson, E> {
                Ok(OJson::Null)
            }
            fn visit_bool<E: de::Error>(self, v: bool) -> Result<OJson, E> {
                Ok(OJson::Bool(v))
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<OJson, E> {
                Ok(OJson::Num(v as f64))
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<OJson, E> {
                Ok(OJson::Num(v as f64))
            }
            fn visit_f64<E: de::Error>(self, v: f64) -> Result<OJson, E> {
                Ok(OJson::Num(v))
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<OJson, E> {
                Ok(OJson::Str(v.to_string()))
            }
            fn visit_string<E: de::Error>(self, v: String) -> Result<OJson, E> {
                Ok(OJson::Str(v))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut a: A) -> Result<OJson, A::Error> {
                let mut out = Vec::new();
                while let Some(v) = a.next_element()? {
                    out.push(v);
                }
                Ok(OJson::Arr(out))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> Result<OJson, A::Error> {
                let mut r = Record::new();
                while let Some((k, v)) = a.next_entry::<String, OJson>()? {
                    r.set(k, v);
                }
                Ok(OJson::Obj(r))
            }
        }
        d.deserialize_any(Vis)
    }
}

pub fn parse_ojson(bytes: &[u8]) -> Result<OJson, serde_json::Error> {
    serde_json::from_slice(bytes)
}

impl OJson {
    pub fn new_object() -> OJson {
        OJson::Obj(Record::new())
    }

    pub fn string(s: impl Into<String>) -> OJson {
        OJson::Str(s.into())
    }

    pub fn strings(items: impl IntoIterator<Item = impl Into<String>>) -> OJson {
        OJson::Arr(items.into_iter().map(|s| OJson::Str(s.into())).collect())
    }

    pub fn is_object(&self) -> bool {
        matches!(self, OJson::Obj(_))
    }

    pub fn is_arr(&self) -> bool {
        matches!(self, OJson::Arr(_))
    }

    /// `v[k]` for an object, `None` otherwise or when absent.
    pub fn get(&self, k: &str) -> Option<&OJson> {
        match self {
            OJson::Obj(r) => r.get(k),
            _ => None,
        }
    }

    pub fn get_mut(&mut self, k: &str) -> Option<&mut OJson> {
        match self {
            OJson::Obj(r) => r.get_mut(k),
            _ => None,
        }
    }

    pub fn has(&self, k: &str) -> bool {
        self.get(k).is_some()
    }

    pub fn set(&mut self, k: &str, v: OJson) {
        if let OJson::Obj(r) = self {
            r.set(k, v);
        }
    }

    /// The value when it is a string.
    pub fn str(&self) -> Option<&str> {
        match self {
            OJson::Str(s) => Some(s),
            _ => None,
        }
    }

    /// JS truthiness.
    pub fn truthy(&self) -> bool {
        match self {
            OJson::Obj(_) | OJson::Arr(_) => true,
            OJson::Null => false,
            OJson::Bool(b) => *b,
            OJson::Num(n) => *n != 0.0 && !n.is_nan(),
            OJson::Str(s) => !s.is_empty(),
        }
    }

    /// `Object.values` for an object or an array.
    pub fn values(&self) -> Vec<&OJson> {
        match self {
            OJson::Arr(a) => a.iter().collect(),
            OJson::Obj(r) => r.values().collect(),
            _ => Vec::new(),
        }
    }

    /// `Object.values(v).forEach(f)` with mutable access; stops at the first error.
    pub fn try_for_each_value_mut<E>(&mut self, mut f: impl FnMut(&mut OJson) -> Result<(), E>) -> Result<(), E> {
        match self {
            OJson::Arr(a) => {
                for v in a.iter_mut() {
                    f(v)?;
                }
            }
            OJson::Obj(r) => {
                let keys: Vec<String> = r.keys().into_iter().map(String::from).collect();
                for k in keys {
                    if let Some(v) = r.get_mut(&k) {
                        f(v)?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// `v && typeof v === 'object'`.
    pub fn is_js_object(&self) -> bool {
        matches!(self, OJson::Obj(_) | OJson::Arr(_))
    }

    /// The string members of an array.
    pub fn string_members(&self) -> Vec<String> {
        match self {
            OJson::Arr(a) => a.iter().filter_map(|x| x.str().map(String::from)).collect(),
            _ => Vec::new(),
        }
    }

    pub fn raw(&self) -> Raw {
        let bytes = crate::jsjson::marshal(self, "").expect("ojson serialises");
        Raw::of(serde_json::from_slice(&bytes).expect("ojson output parses"))
    }

    /// `JSON.stringify(v)`.
    pub fn stringify(&self) -> String {
        crate::jsjson::to_string(self).expect("ojson serialises")
    }

    /// `v ?? fallback`: null and absent fall back, everything else stays.
    pub fn nullish_or<'a>(v: Option<&'a OJson>, fallback: &'a OJson) -> &'a OJson {
        match v {
            None | Some(OJson::Null) => fallback,
            Some(x) => x,
        }
    }
}

/// Parses a [`Raw`] back into an [`OJson`] (Go `parseOJSON(raw)`); `None` for
/// an empty Raw or one that does not round-trip.
pub fn ojson_of_raw(raw: &Raw) -> Option<OJson> {
    let v = raw.value()?;
    let bytes = crate::jsjson::marshal(v, "").ok()?;
    parse_ojson(&bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_js_key_order_and_numbers() {
        let v = parse_ojson(br#"{"b":1,"2":"x","a":[1.5,true,null],"1":0}"#).unwrap();
        assert_eq!(v.stringify(), r#"{"1":0,"2":"x","b":1,"a":[1.5,true,null]}"#);
    }

    #[test]
    fn truthiness_follows_js() {
        for (src, want) in [("0", false), ("\"\"", false), ("null", false), ("[]", true), ("{}", true), ("\"a\"", true)] {
            assert_eq!(parse_ojson(src.as_bytes()).unwrap().truthy(), want, "{src}");
        }
    }
}
