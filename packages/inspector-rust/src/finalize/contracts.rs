//! Port of Go `finalize/contracts.go` (utils/contract-hashes.ts) and the
//! manifest block of finalize.ts.

use std::collections::{HashMap, HashSet};

use super::hash::{canonical_json, hash_string};
use super::jsval::{number_string, V};
use crate::diag::codes;
use crate::state::{FunctionMeta, Raw, State};
use crate::typesmap::TypesMap;

#[derive(Clone, Debug)]
pub struct ContractEntry {
    pub function_key: String,
    pub version: i64,
    pub contract_hash: String,
    pub input_hash: String,
    pub output_hash: String,
}

/// The TS `Map<funcId, ContractEntry>`, in insertion order.
#[derive(Default)]
pub struct Contracts {
    pub ids: Vec<String>,
    pub entries: HashMap<String, ContractEntry>,
}

impl Contracts {
    fn set(&mut self, id: &str, e: ContractEntry) {
        if !self.entries.contains_key(id) {
            self.ids.push(id.to_string());
        }
        self.entries.insert(id.to_string(), e);
    }
}

/// `@pikku/core parseVersionedId`; version `None` is null.
pub fn parse_versioned_id(id: &str) -> (String, Option<i64>) {
    let Some(idx) = id.rfind("@v") else { return (id.to_string(), None) };
    let vs = &id[idx + 2..];
    match js_number(vs) {
        Some(f) if f >= 1.0 && f == f.trunc() && f.is_finite() => (id[..idx].to_string(), Some(f as i64)),
        _ => (id.to_string(), None),
    }
}

pub fn is_versioned_id(id: &str) -> bool {
    parse_versioned_id(id).1.is_some()
}

pub fn format_versioned_id(base: &str, version: i64) -> String {
    format!("{base}@v{version}")
}

fn is_js_space(c: char) -> bool {
    // String.prototype.trim / Number(): WhiteSpace + LineTerminator. Go's port only trims ASCII.
    matches!(c, ' ' | '\t' | '\n' | '\r' | '\u{b}' | '\u{c}')
}

/// `Number(str)`: whitespace-trimmed decimal, hex, octal or binary literal,
/// "" is 0, Infinity allowed; `None` for NaN.
pub fn js_number(s: &str) -> Option<f64> {
    let t = s.trim_matches(is_js_space);
    if t.is_empty() {
        return Some(0.0);
    }
    match t {
        "Infinity" | "+Infinity" => return Some(f64::INFINITY),
        "-Infinity" => return Some(f64::NEG_INFINITY),
        _ => {}
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
            // Go's strconv.ParseUint(t[2:], base, 64): digits only, no sign.
            return u64::from_str_radix(&t[2..], base).ok().filter(|_| !t[2..].starts_with('+')).map(|n| n as f64);
        }
    }
    if !t.chars().all(|c| c.is_ascii_digit() || matches!(c, '.' | 'e' | 'E' | '+' | '-')) {
        return None;
    }
    go_parse_float(t)
}

/// Go's strconv.ParseFloat for the character set above (no underscores,
/// no hex, no inf/nan).
fn go_parse_float(t: &str) -> Option<f64> {
    // Rust's parser rejects a few forms Go accepts ("1.", ".5", "+.5e1" are accepted by both);
    // both reject "", ".", "e5", "1e", "--1".
    t.parse::<f64>().ok()
}

fn uniq(tm: &TypesMap, name: &str) -> String {
    tm.get_unique_name(name).unwrap_or_else(|_| name.to_string())
}

struct SchemaCache<'a> {
    st: &'a State,
    parsed: HashMap<String, V>,
}

impl SchemaCache<'_> {
    fn get(&mut self, key: &str) -> V {
        if let Some(v) = self.parsed.get(key) {
            return v.clone();
        }
        let v = match self.st.schemas.get(key) {
            Some(raw) => match raw.value() {
                Some(j) => V::from_json(j),
                None => V::Null,
            },
            None => V::Undef,
        };
        self.parsed.insert(key.to_string(), v.clone());
        v
    }
}

fn resolve_schema(type_names: &[String], cache: &mut SchemaCache, tm: &TypesMap) -> V {
    let mut parts = Vec::new();
    let mut n = 0;
    for name in type_names {
        if name == "void" {
            continue;
        }
        n += 1;
        let s = cache.get(&uniq(tm, name));
        if s.truthy() {
            parts.push(s);
        }
    }
    if n == 0 || parts.is_empty() {
        return V::Null;
    }
    if parts.len() == 1 {
        return parts.pop().unwrap();
    }
    V::arr(parts)
}

fn contract_version(id: &str, meta: &FunctionMeta) -> (String, i64) {
    let (base, v) = parse_versioned_id(id);
    (base, v.unwrap_or_else(|| meta.version.unwrap_or(1)))
}

fn is_webhook_receive(meta: &FunctionMeta) -> bool {
    meta.webhook_receive == Some(true)
}

/// `buildCurrentContracts`.
pub fn build_current_contracts(st: &State) -> Contracts {
    let mut result = Contracts::default();
    let mut cache = SchemaCache { st, parsed: HashMap::new() };
    let tm = &st.functions.types_map;
    for (id, meta) in st.functions.meta.iter() {
        if is_webhook_receive(meta) {
            continue;
        }
        let (key, version) = contract_version(id, meta);
        let input = resolve_schema(&meta.inputs, &mut cache, tm);
        let output = resolve_schema(&meta.outputs, &mut cache, tm);
        let k = V::str(&key);
        result.set(
            id,
            ContractEntry {
                function_key: key.clone(),
                version,
                contract_hash: hash_string(
                    &canonical_json(&V::of(vec![("functionKey", k.clone()), ("inputSchema", input.clone()), ("outputSchema", output.clone())])),
                    16,
                ),
                input_hash: hash_string(&canonical_json(&V::of(vec![("functionKey", k.clone()), ("inputSchema", input)])), 8),
                output_hash: hash_string(&canonical_json(&V::of(vec![("functionKey", k), ("outputSchema", output)])), 8),
            },
        );
    }
    result
}

/// `computeContractHashes`: stamps contractHash, inputHash and outputHash on
/// every function's meta.
pub fn compute_contract_hashes(st: &mut State) {
    let contracts = build_current_contracts(st);
    for id in &contracts.ids {
        let e = &contracts.entries[id];
        if let Some(meta) = st.functions.meta.get_mut(id) {
            meta.contract_hash = e.contract_hash.clone();
            meta.input_hash = e.input_hash.clone();
            meta.output_hash = e.output_hash.clone();
        }
    }
}

/// `extractContractsFromMeta`.
pub fn extract_contracts_from_meta(st: &State) -> Contracts {
    let mut result = Contracts::default();
    for (id, meta) in st.functions.meta.iter() {
        if is_webhook_receive(meta) || meta.contract_hash.is_empty() {
            continue;
        }
        let (key, version) = contract_version(id, meta);
        result.set(
            id,
            ContractEntry {
                function_key: key,
                version,
                contract_hash: meta.contract_hash.clone(),
                input_hash: meta.input_hash.clone(),
                output_hash: meta.output_hash.clone(),
            },
        );
    }
    result
}

fn create_empty_manifest() -> V {
    V::of(vec![("manifestVersion", V::num(1.0)), ("contracts", V::obj())])
}

struct Group {
    key: String,
    entries: Vec<ContractEntry>,
}

fn group_by_function_key(c: &Contracts) -> Vec<Group> {
    let mut groups: Vec<Group> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for id in &c.ids {
        let e = &c.entries[id];
        let i = *index.entry(e.function_key.clone()).or_insert_with(|| {
            groups.push(Group { key: e.function_key.clone(), entries: vec![] });
            groups.len() - 1
        });
        groups[i].entries.push(e.clone());
    }
    groups
}

fn str_field(v: &V, key: &str) -> V {
    v.get(key)
}

fn strict_eq_str(v: &V, s: &str) -> bool {
    v.is_str(s)
}

fn entry_changed(existing: &V, current: &ContractEntry) -> bool {
    if existing.is_obj() {
        !strict_eq_str(&str_field(existing, "inputHash"), &current.input_hash)
            || !strict_eq_str(&str_field(existing, "outputHash"), &current.output_hash)
    } else {
        !strict_eq_str(existing, &current.contract_hash)
    }
}

fn number_of(v: &V) -> f64 {
    match v {
        V::Num(n) => *n,
        V::Str(s) => js_number(s).unwrap_or(f64::NAN),
        V::Bool(b) => f64::from(*b),
        V::Null => 0.0,
        _ => f64::NAN,
    }
}

/// `Math.max` (NaN propagates).
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.max(b)
    }
}

fn manifest_contracts(manifest: &V) -> V {
    let c = manifest.get("contracts");
    if c.is_obj() { c } else { V::obj() }
}

fn num_eq(v: &V, f: f64) -> bool {
    matches!(v, V::Num(x) if *x == f)
}

/// `validateContracts`, returning the VersionValidateError objects TS builds.
pub fn validate_contracts(manifest: &V, current: &Contracts) -> Vec<V> {
    let mut errs = Vec::new();
    let grouped = group_by_function_key(current);
    let mut reported: HashSet<String> = HashSet::new();
    let contracts = manifest_contracts(manifest);

    for g in &grouped {
        let entry = contracts.get(&g.key);
        if !entry.is_obj() {
            continue;
        }
        let latest_v = entry.get("latest");
        let latest = number_of(&latest_v);
        let versions = entry.get("versions");
        for cur in &g.entries {
            let existing = versions.get(&cur.version.to_string());
            if !existing.is_undef() {
                if entry_changed(&existing, cur) {
                    reported.insert(format!("{}@{}", g.key, cur.version));
                    let (recorded, prev_in, prev_out) = if existing.is_obj() {
                        let i = str_field(&existing, "inputHash");
                        let o = str_field(&existing, "outputHash");
                        (format!("{}/{}", i.template_string(), o.template_string()), i, o)
                    } else {
                        (existing.template_string(), existing.clone(), existing.clone())
                    };
                    errs.push(V::of(vec![
                        ("code", V::str(codes::FUNCTION_VERSION_MODIFIED)),
                        (
                            "message",
                            V::str(format!(
                                "Contract for {}@v{} has changed (recorded: {}, current: {}). Existing versions are immutable.",
                                g.key, cur.version, recorded, cur.contract_hash
                            )),
                        ),
                        ("functionKey", V::str(&g.key)),
                        ("version", V::num(cur.version as f64)),
                        ("previousHash", prev_in.clone()),
                        ("currentHash", V::str(&cur.contract_hash)),
                        ("previousInputHash", prev_in),
                        ("currentInputHash", V::str(&cur.input_hash)),
                        ("previousOutputHash", prev_out),
                        ("currentOutputHash", V::str(&cur.output_hash)),
                    ]));
                }
            } else {
                let v = cur.version as f64;
                if v <= latest {
                    errs.push(V::of(vec![
                        ("code", V::str(codes::VERSION_REGRESSION_OR_CONFLICT)),
                        (
                            "message",
                            V::str(format!(
                                "Version {} for {} is <= latest ({}) but not recorded. Possible merge conflict.",
                                cur.version,
                                g.key,
                                latest_v.template_string()
                            )),
                        ),
                        ("functionKey", V::str(&g.key)),
                        ("version", V::num(v)),
                        ("latestVersion", latest_v.clone()),
                    ]));
                } else if v > latest + 1.0 {
                    errs.push(V::of(vec![
                        ("code", V::str(codes::VERSION_GAP_NOT_ALLOWED)),
                        (
                            "message",
                            V::str(format!(
                                "Version {} for {} skips versions. Latest is {}, next must be {}.",
                                cur.version,
                                g.key,
                                latest_v.template_string(),
                                number_string(latest + 1.0)
                            )),
                        ),
                        ("functionKey", V::str(&g.key)),
                        ("version", V::num(v)),
                        ("latestVersion", latest_v.clone()),
                        ("expectedNextVersion", V::num(latest + 1.0)),
                    ]));
                }
            }
        }
    }

    let group_index: HashMap<&str, &Group> = grouped.iter().map(|g| (g.key.as_str(), g)).collect();

    for key in contracts.keys() {
        let entry = contracts.get(&key);
        let latest_v = entry.get("latest");
        let latest = number_of(&latest_v);
        let latest_entry = entry.get("versions").get(&latest_v.template_string());
        let Some(g) = group_index.get(key.as_str()) else { continue };
        let current_latest = g.entries.iter().find(|e| num_eq(&latest_v, e.version as f64));
        if let Some(cl) = current_latest {
            if entry_changed(&latest_entry, cl) && !reported.contains(&format!("{}@{}", key, latest_v.template_string())) {
                let (prev_in, prev_out) =
                    if latest_entry.is_obj() { (str_field(&latest_entry, "inputHash"), str_field(&latest_entry, "outputHash")) } else { (V::Undef, V::Undef) };
                errs.push(V::of(vec![
                    ("code", V::str(codes::CONTRACT_CHANGED_REQUIRES_BUMP)),
                    (
                        "message",
                        V::str(format!(
                            "Contract for {} changed. Set `version: {}` on the function or run 'pikku versions update'.",
                            key,
                            number_string(latest + 1.0)
                        )),
                    ),
                    ("functionKey", V::str(&key)),
                    ("previousInputHash", prev_in),
                    ("currentInputHash", V::str(&cl.input_hash)),
                    ("previousOutputHash", prev_out),
                    ("currentOutputHash", V::str(&cl.output_hash)),
                    ("nextVersion", V::num(latest + 1.0)),
                ]));
            }
        }
    }

    for key in contracts.keys() {
        let entry = contracts.get(&key);
        let versions = entry.get("versions");
        let vkeys = versions.keys();
        if vkeys.is_empty() {
            continue;
        }
        let mut max_version = f64::NEG_INFINITY;
        for vk in &vkeys {
            match js_number(vk) {
                Some(f) if !f.is_nan() => max_version = js_max(max_version, f),
                _ => {
                    max_version = f64::NAN;
                    break;
                }
            }
        }
        let latest_v = entry.get("latest");
        if !num_eq(&latest_v, max_version) {
            errs.push(V::of(vec![
                ("code", V::str(codes::MANIFEST_INTEGRITY_ERROR)),
                (
                    "message",
                    V::str(format!(
                        "Manifest integrity error for {}: latest field ({}) inconsistent with version keys (max: {}).",
                        key,
                        latest_v.template_string(),
                        number_string(max_version)
                    )),
                ),
                ("functionKey", V::str(&key)),
                ("latestVersion", latest_v),
                ("expectedNextVersion", V::num(max_version)),
            ]));
        }
    }
    errs
}

/// `updateManifest`.
pub fn update_manifest(existing: &V, current: &Contracts) -> V {
    let contracts = manifest_contracts(existing).deep_clone();
    let manifest = V::of(vec![("manifestVersion", existing.get("manifestVersion")), ("contracts", contracts.clone())]);
    for g in group_by_function_key(current) {
        let mut entry = contracts.get(&g.key);
        if !entry.truthy() {
            entry = V::of(vec![("latest", V::num(0.0)), ("versions", V::obj())]);
            contracts.set(&g.key, entry.clone());
        }
        let mut versions = entry.get("versions");
        if !versions.is_obj() {
            versions = V::obj();
            entry.set("versions", versions.clone());
        }
        for e in &g.entries {
            versions.set(
                &e.version.to_string(),
                V::of(vec![("inputHash", V::str(&e.input_hash)), ("outputHash", V::str(&e.output_hash))]),
            );
            entry.set("latest", V::num(js_max(number_of(&entry.get("latest")), e.version as f64)));
        }
    }
    manifest
}

/// finalize.ts's manifest block: the initial manifest from options (raw
/// versions.pikku.json, or none), the updated one, and the validation errors.
pub fn apply_manifest(st: &mut State, initial: Option<&serde_json::Value>) -> Result<(), String> {
    let mut base = None;
    st.manifest.initial = Raw::null();
    if let Some(init) = initial {
        if !init.is_null() {
            let v = V::from_json(init);
            st.manifest.initial = Raw::of(v.to_json());
            if v.is_obj() {
                base = Some(v);
            }
        }
    }
    let base = base.unwrap_or_else(create_empty_manifest);
    let contracts = extract_contracts_from_meta(st);
    st.manifest.current = Raw::of(update_manifest(&base, &contracts).to_json());
    let errs = validate_contracts(&base, &contracts);
    st.manifest.errors = errs.into_iter().map(|e| Raw::of(e.to_json())).collect();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versioned_ids() {
        assert_eq!(parse_versioned_id("a@v2"), ("a".into(), Some(2)));
        assert_eq!(parse_versioned_id("a@v0"), ("a@v0".into(), None));
        assert_eq!(parse_versioned_id("a@v1.5"), ("a@v1.5".into(), None));
        assert_eq!(parse_versioned_id("a@v0x10"), ("a".into(), Some(16)));
        assert_eq!(parse_versioned_id("a@v"), ("a@v".into(), None));
        assert_eq!(parse_versioned_id("a@v 3 "), ("a".into(), Some(3)));
    }

    #[test]
    fn manifest_flow() {
        let mut st = State::new("/r");
        let mut m = crate::state::FunctionMeta::default();
        m.contract_hash = "c".into();
        m.input_hash = "i".into();
        m.output_hash = "o".into();
        st.functions.meta.set("f", m);
        let init: serde_json::Value = serde_json::from_str(
            r#"{"manifestVersion":1,"contracts":{"f":{"latest":1,"versions":{"1":{"inputHash":"x","outputHash":"o"}}}}}"#,
        )
        .unwrap();
        apply_manifest(&mut st, Some(&init)).unwrap();
        let errs = serde_json::to_string(&st.manifest.errors).unwrap();
        assert!(errs.contains("PKU861"), "{errs}");
        assert!(errs.contains("Contract for f@v1 has changed (recorded: x/o, current: c)"), "{errs}");
    }
}
