//! Port of Go `internal/typesmap` (types-map.ts). Both maps keep JS Map
//! semantics: iteration is insertion order and re-setting a key keeps its
//! position, which `exists` depends on (it returns the first entry that
//! matches).
//!
//! Status: the data structure, its serialisation (`serializeTypesMap`'s
//! `{ map, customTypes }`) and `get_type_meta` are ported. NOT ported yet:
//! `CanonicalTypeString` (Go `typesmap/canonical.go`); [`canonical_type_string`]
//! is the identity until it is, so `add_custom_type` stores the type text as
//! given.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

use crate::state::ordered::Map;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub original_name: String,
    pub path: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CustomType {
    #[serde(rename = "type")]
    pub ty: String,
    pub references: Vec<String>,
}

/// getTypeMeta's result.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TypeMeta {
    pub original_name: String,
    pub unique_name: String,
    pub path: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypesMap {
    #[serde(rename = "map")]
    entries: Map<Entry>,
    custom_types: Map<CustomType>,
}

/// TODO(port): `typesmap/canonical.go` `CanonicalTypeString`.
pub fn canonical_type_string(ty: &str) -> String {
    ty.to_string()
}

const PRIMITIVES: [&str; 8] = ["string", "number", "boolean", "null", "undefined", "void", "unknown", "never"];

impl TypesMap {
    pub fn new() -> TypesMap {
        TypesMap::default()
    }

    pub fn add_custom_type(&mut self, name: &str, ty: &str, references: Vec<String>) {
        self.custom_types.set(name, CustomType { ty: canonical_type_string(ty), references });
    }

    pub fn add_type(&mut self, original_name: &str, path: &str) {
        self.entries.set(original_name, Entry { original_name: original_name.into(), path: Some(path.into()) });
    }

    /// Names the type by a digest of its path alone, so the alias is
    /// independent of traversal order.
    pub fn add_unique_type(&mut self, original_name: &str, path: &str) -> String {
        let sum = Sha256::digest(path.as_bytes());
        let hex: String = sum.iter().map(|b| format!("{b:02x}")).collect();
        let unique = format!("{original_name}_{}", &hex[..12]);
        self.entries.set(unique.clone(), Entry { original_name: original_name.into(), path: Some(path.into()) });
        unique
    }

    /// The key of the first entry with this name and path.
    pub fn exists(&self, original_name: &str, path: &str) -> Option<&str> {
        self.entries
            .iter()
            .find(|(_, e)| e.path.as_deref() == Some(path) && e.original_name == original_name)
            .map(|(k, _)| k)
    }

    pub fn keys(&self) -> Vec<String> {
        self.entries.keys().map(String::from).collect()
    }

    pub fn entry(&self, key: &str) -> Option<&Entry> {
        self.entries.get(key)
    }

    pub fn custom_type_keys(&self) -> Vec<String> {
        self.custom_types.keys().map(String::from).collect()
    }

    pub fn custom_type(&self, name: &str) -> Option<&CustomType> {
        self.custom_types.get(name)
    }

    fn find_by_original(&self, name: &str) -> Option<&Entry> {
        self.entries.iter().map(|(_, e)| e).find(|e| e.original_name == name)
    }

    /// `TypesMap.getUniqueName`.
    pub fn get_unique_name(&self, name: &str) -> Result<String, String> {
        self.get_type_meta(name).map(|m| m.unique_name)
    }

    /// `TypesMap.getTypeMeta`; the TS throw becomes an `Err`.
    pub fn get_type_meta(&self, name: &str) -> Result<TypeMeta, String> {
        if PRIMITIVES.contains(&name) || self.custom_types.has(name) {
            return Ok(TypeMeta { original_name: name.into(), unique_name: name.into(), path: None });
        }
        let meta = self
            .entries
            .get(name)
            .or_else(|| self.find_by_original(name))
            .ok_or_else(|| format!("Type {name} not found in typesMap"))?;
        let unique = self.squash(name)?;
        Ok(TypeMeta { original_name: meta.original_name.clone(), unique_name: unique, path: meta.path.clone() })
    }

    fn squash(&self, unique: &str) -> Result<String, String> {
        let mut occurrences: HashMap<&str, HashSet<&str>> = HashMap::new();
        for (_, e) in self.entries.iter() {
            if let Some(p) = e.path.as_deref().filter(|p| !p.is_empty()) {
                occurrences.entry(&e.original_name).or_default().insert(p);
            }
        }
        let is_duplicate = |k: &str| {
            self.entries.get(k).is_some_and(|e| {
                e.path.as_deref().is_some_and(|p| !p.is_empty())
                    && occurrences.get(e.original_name.as_str()).is_some_and(|s| s.len() > 1)
            })
        };
        if is_duplicate(unique) {
            return Ok(unique.to_string());
        }
        if matches!(unique, "string" | "number" | "boolean" | "null") {
            return Ok(unique.to_string());
        }
        if let Some(e) = self.entries.get(unique).or_else(|| self.find_by_original(unique)) {
            return Ok(e.original_name.clone());
        }
        Err(format!("Type {unique} not found in typesMap"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jsjson::to_string;

    #[test]
    fn serialises_like_serialize_types_map() {
        let mut m = TypesMap::new();
        assert_eq!(to_string(&m).unwrap(), r#"{"map":[],"customTypes":[]}"#);
        m.add_type("Foo", "/a/foo.ts");
        m.add_custom_type("Bar", "{a:string}", vec!["Foo".into()]);
        assert_eq!(
            to_string(&m).unwrap(),
            r#"{"map":[["Foo",{"originalName":"Foo","path":"/a/foo.ts"}]],"customTypes":[["Bar",{"type":"{a:string}","references":["Foo"]}]]}"#
        );
    }

    #[test]
    fn unique_names_are_path_digests_and_squash_keeps_duplicates() {
        let mut m = TypesMap::new();
        let a = m.add_unique_type("T", "/a.ts");
        let b = m.add_unique_type("T", "/b.ts");
        assert_ne!(a, b);
        assert_eq!(m.get_unique_name(&a).unwrap(), a);
        m.add_type("U", "/u.ts");
        assert_eq!(m.get_unique_name("U").unwrap(), "U");
        assert_eq!(m.exists("U", "/u.ts"), Some("U"));
        assert!(m.get_unique_name("Missing").is_err());
        assert_eq!(m.get_unique_name("string").unwrap(), "string");
    }
}
