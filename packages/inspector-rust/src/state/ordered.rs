//! Port of Go `state/ordered.go`: the JS collection types the serialized state
//! is made of.
//!
//! * [`Record`] is a JS plain object (`Record<string, V>`). It serialises as a
//!   JSON object whose keys follow JavaScript's own-property order: array-index
//!   keys ("0", "17") first in ascending numeric order, then every other key in
//!   insertion order. Re-setting a key keeps its position; deleting and
//!   re-adding moves it to the end, as in JS.
//! * [`Map`] is a JS `Map` as `serializeInspectorState` writes it,
//!   `Array.from(map.entries())`: an array of `[key, value]` pairs in insertion
//!   order (a Map, unlike an object, has no integer-key reordering).
//! * [`Set`] is a JS `Set<string>`, written as `Array.from(set)`.
//!
//! Go's `List[T]` (a slice that encodes nil as `[]`) is plain `Vec<T>` here,
//! and `Strings` is `Vec<String>`.

use indexmap::IndexMap;
use serde::de::{self, Deserializer, MapAccess, SeqAccess, Visitor};
use serde::ser::{SerializeMap, SerializeSeq, Serializer};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::marker::PhantomData;

pub type Strings = Vec<String>;

/// `Some(n)` when `k` is a canonical array index, the keys JS enumerates before
/// all others: "0" or a digit string without a leading zero whose value is
/// below 2^32 - 1.
fn array_index(k: &str) -> Option<u64> {
    let b = k.as_bytes();
    if b.is_empty() || b.len() > 10 || (b.len() > 1 && b[0] == b'0') || !b.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let n: u64 = k.parse().ok()?;
    (n < (1 << 32) - 1).then_some(n)
}

#[derive(Clone, Debug)]
pub struct Record<V> {
    inner: IndexMap<String, V>,
}

impl<V> Default for Record<V> {
    fn default() -> Self {
        Record { inner: IndexMap::new() }
    }
}

impl<V: PartialEq> PartialEq for Record<V> {
    /// Order-sensitive, like comparing the serialised forms.
    fn eq(&self, other: &Self) -> bool {
        self.inner.iter().eq(other.inner.iter())
    }
}

impl<V> Record<V> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, k: impl Into<String>, v: V) {
        self.inner.insert(k.into(), v);
    }

    pub fn get(&self, k: &str) -> Option<&V> {
        self.inner.get(k)
    }

    pub fn get_mut(&mut self, k: &str) -> Option<&mut V> {
        self.inner.get_mut(k)
    }

    pub fn has(&self, k: &str) -> bool {
        self.inner.contains_key(k)
    }

    /// Removes `k`; a later `set` puts it at the end, as in JS.
    pub fn delete(&mut self, k: &str) -> Option<V> {
        self.inner.shift_remove(k)
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// The keys in JS enumeration order.
    pub fn keys(&self) -> Vec<&str> {
        let mut idx: Vec<(u64, &str)> =
            self.inner.keys().filter_map(|k| array_index(k).map(|n| (n, k.as_str()))).collect();
        if idx.is_empty() {
            return self.inner.keys().map(String::as_str).collect();
        }
        idx.sort_by_key(|(n, _)| *n);
        let mut out: Vec<&str> = idx.into_iter().map(|(_, k)| k).collect();
        out.extend(self.inner.keys().filter(|k| array_index(k).is_none()).map(String::as_str));
        out
    }

    /// Entries in JS enumeration order.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &V)> {
        self.keys().into_iter().map(|k| (k, &self.inner[k]))
    }

    /// Values in JS enumeration order, mutably is not offered: use `get_mut`.
    pub fn values(&self) -> impl Iterator<Item = &V> {
        self.iter().map(|(_, v)| v)
    }
}

impl<V: Default> Record<V> {
    /// The value for `k`, inserted as `V::default()` when absent.
    pub fn entry_or_default(&mut self, k: &str) -> &mut V {
        self.inner.entry(k.to_string()).or_default()
    }
}

impl<V: Serialize> Serialize for Record<V> {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut m = s.serialize_map(Some(self.inner.len()))?;
        for (k, v) in self.iter() {
            m.serialize_entry(k, v)?;
        }
        m.end()
    }
}

impl<'de, V: Deserialize<'de>> Deserialize<'de> for Record<V> {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct Vis<V>(PhantomData<V>);
        impl<'de, V: Deserialize<'de>> Visitor<'de> for Vis<V> {
            type Value = Record<V>;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("an object")
            }
            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(Record::new())
            }
            fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> Result<Self::Value, A::Error> {
                let mut r = Record::new();
                while let Some((k, v)) = a.next_entry::<String, V>()? {
                    r.set(k, v);
                }
                Ok(r)
            }
        }
        d.deserialize_any(Vis(PhantomData))
    }
}

#[derive(Clone, Debug)]
pub struct Map<V> {
    inner: IndexMap<String, V>,
}

impl<V> Default for Map<V> {
    fn default() -> Self {
        Map { inner: IndexMap::new() }
    }
}

impl<V: PartialEq> PartialEq for Map<V> {
    fn eq(&self, other: &Self) -> bool {
        self.inner.iter().eq(other.inner.iter())
    }
}

impl<V> Map<V> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, k: impl Into<String>, v: V) {
        self.inner.insert(k.into(), v);
    }

    pub fn get(&self, k: &str) -> Option<&V> {
        self.inner.get(k)
    }

    pub fn get_mut(&mut self, k: &str) -> Option<&mut V> {
        self.inner.get_mut(k)
    }

    pub fn has(&self, k: &str) -> bool {
        self.inner.contains_key(k)
    }

    pub fn delete(&mut self, k: &str) -> Option<V> {
        self.inner.shift_remove(k)
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Keys in insertion order.
    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.inner.keys().map(String::as_str)
    }

    /// Entries in insertion order.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &V)> {
        self.inner.iter().map(|(k, v)| (k.as_str(), v))
    }
}

impl<V: Default> Map<V> {
    pub fn entry_or_default(&mut self, k: &str) -> &mut V {
        self.inner.entry(k.to_string()).or_default()
    }
}

impl<V: Serialize> Serialize for Map<V> {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut seq = s.serialize_seq(Some(self.inner.len()))?;
        for (k, v) in &self.inner {
            seq.serialize_element(&(k, v))?;
        }
        seq.end()
    }
}

impl<'de, V: Deserialize<'de>> Deserialize<'de> for Map<V> {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct Vis<V>(PhantomData<V>);
        impl<'de, V: Deserialize<'de>> Visitor<'de> for Vis<V> {
            type Value = Map<V>;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("an array of [key, value] pairs")
            }
            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(Map::new())
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut a: A) -> Result<Self::Value, A::Error> {
                let mut m = Map::new();
                while let Some((k, v)) = a.next_element::<(String, V)>()? {
                    m.set(k, v);
                }
                Ok(m)
            }
        }
        d.deserialize_any(Vis(PhantomData))
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Set {
    items: indexmap::IndexSet<String>,
}

impl Set {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, v: impl Into<String>) {
        self.items.insert(v.into());
    }

    pub fn has(&self, v: &str) -> bool {
        self.items.contains(v)
    }

    pub fn delete(&mut self, v: &str) {
        self.items.shift_remove(v);
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Members in insertion order.
    pub fn values(&self) -> impl Iterator<Item = &str> {
        self.items.iter().map(String::as_str)
    }
}

impl Serialize for Set {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut seq = s.serialize_seq(Some(self.items.len()))?;
        for v in &self.items {
            seq.serialize_element(v)?;
        }
        seq.end()
    }
}

impl<'de> Deserialize<'de> for Set {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let items: Option<Vec<String>> = Option::deserialize(d)?;
        let mut s = Set::new();
        for v in items.unwrap_or_default() {
            s.add(v);
        }
        Ok(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jsjson::to_string;

    #[test]
    fn record_key_order() {
        let mut r = Record::new();
        for (i, k) in ["b", "10", "a", "2", "01", "4294967295", "4294967294"].iter().enumerate() {
            r.set(*k, i as i64);
        }
        r.set("b", 9); // re-set keeps position
        assert_eq!(
            to_string(&r).unwrap(),
            r#"{"2":3,"10":1,"4294967294":6,"b":9,"a":2,"01":4,"4294967295":5}"#
        );
        r.delete("b");
        r.set("b", 0); // delete + re-add moves to the end
        assert_eq!(*r.keys().last().unwrap(), "b");
    }

    #[test]
    fn map_and_set_encoding() {
        let mut m = Map::new();
        m.set("2", 1);
        m.set("1", 2);
        assert_eq!(to_string(&m).unwrap(), r#"[["2",1],["1",2]]"#);
        let mut s = Set::new();
        assert_eq!(to_string(&s).unwrap(), "[]");
        s.add("b");
        s.add("a");
        s.add("b");
        assert_eq!(to_string(&s).unwrap(), r#"["b","a"]"#);
    }

    #[test]
    fn round_trips_in_document_order() {
        let r: Record<i64> = serde_json::from_str(r#"{"b":1,"a":2}"#).unwrap();
        assert_eq!(to_string(&r).unwrap(), r#"{"b":1,"a":2}"#);
        let m: Map<i64> = serde_json::from_str(r#"[["b",1],["a",2]]"#).unwrap();
        assert_eq!(to_string(&m).unwrap(), r#"[["b",1],["a",2]]"#);
    }
}
