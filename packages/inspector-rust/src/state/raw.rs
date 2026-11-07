//! Port of Go `state/raw.go`.
//!
//! [`Raw`] holds an already-parsed JSON value verbatim, key order included. It
//! is the element type of every section whose visitor group is not ported yet:
//! an unported group never writes it, so it stays empty, and a state decoded
//! from the TS serializer round-trips it. When a group is ported its section
//! gets a typed struct and `Raw` drops out of it.
//!
//! Go keeps the raw bytes; Rust keeps a `serde_json::Value` (with
//! `preserve_order`), which re-encodes identically for anything
//! `JSON.stringify` produced: numbers are re-formatted by
//! [`crate::jsjson::JsFormatter`], which is the form `JSON.stringify` wrote
//! them in.

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

/// `None` is Go's empty `Raw` (nil bytes): it encodes as `null` and, on an
/// `omitempty` field, is omitted. `Some(Value::Null)` is `Raw("null")`, which
/// is non-empty and is therefore kept.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Raw(pub Option<Value>);

impl Raw {
    pub fn null() -> Raw {
        Raw(Some(Value::Null))
    }

    pub fn of(v: Value) -> Raw {
        Raw(Some(v))
    }

    /// `len(raw) == 0`: the test of Go's `omitempty`.
    pub fn is_empty(&self) -> bool {
        self.0.is_none()
    }

    pub fn value(&self) -> Option<&Value> {
        self.0.as_ref()
    }
}

impl Serialize for Raw {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match &self.0 {
            Some(v) => v.serialize(s),
            None => s.serialize_unit(),
        }
    }
}

impl<'de> Deserialize<'de> for Raw {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Value::deserialize(d).map(|v| Raw(Some(v)))
    }
}
