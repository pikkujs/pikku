//! Port of `pkgjson.go`. A package.json is decoded into an order-preserving
//! `serde_json::Value` (the crate's `preserve_order` feature), which keeps the
//! key order `Object.entries` gives for the non-index keys a package.json uses.

use serde_json::{Map, Value};

pub fn decode_ordered(data: &[u8]) -> Option<Value> {
    serde_json::from_slice(data).ok()
}

pub fn get<'a>(o: &'a Map<String, Value>, key: &str) -> Option<&'a Value> {
    o.get(key)
}
