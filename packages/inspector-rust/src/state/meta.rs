//! Port of Go `state/meta.go`, `security.go`, `governance.go` and
//! `agents_mcp.go`: the typed element structs for the sections whose visitor
//! groups are ported.
//!
//! Field order is the order the TS visitor's object literal assigns the keys,
//! because that is the order `JSON.stringify` writes them. Optional fields are
//! the ones TS leaves `undefined` (and `JSON.stringify` drops); an `Option`
//! without a skip is a value TS writes as `null`.
//!
//! Go-to-Rust translation of the tag rules:
//!
//! * `*bool/*int/*string` + `omitempty`  -> `Option<_>` + `skip_serializing_if = Option::is_none`
//! * `string` + `omitempty`              -> `String` + `skip_serializing_if = String::is_empty`
//! * `[]string` + `omitempty`            -> `Vec<String>` + `skip_serializing_if = Vec::is_empty`
//! * `[]string` + `omitzero` (Tags)      -> `Option<Vec<String>>`: `None` is Go's nil
//!   slice (omitted), `Some(vec![])` is the empty non-nil slice (written `[]`)
//! * `[]string` without a tag            -> `Vec<String>`; Go's nil slice would
//!   write `null`, which a Rust `Vec` cannot express. Visitors always set these.
//! * `json:"-"` scratch fields           -> `#[serde(skip)]`

use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value};
use std::ops::{Deref, DerefMut};

use super::ordered::{Record, Strings};
use super::raw::Raw;

pub(crate) fn is_empty_str(s: &String) -> bool {
    s.is_empty()
}

pub(crate) fn is_empty_vec<T>(v: &Vec<T>) -> bool {
    v.is_empty()
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ServicesMeta {
    pub optimized: bool,
    pub services: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WiresMeta {
    pub optimized: bool,
    pub wires: Vec<String>,
}

/// A middleware or permission reference (MiddlewareMetadata /
/// PermissionMetadata in @pikku/core).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WireRef {
    #[serde(rename = "type")]
    pub ty: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub name: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub tag: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inline: Option<bool>,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub route: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AuditMeta {
    pub durability: String,
}

/// Rewrites the JSON object `v` so that the keys in `first` lead, in that
/// order, the keys in `last` close it, in that order, and every other key
/// keeps its relative order in between. Keys absent from `v` are skipped.
pub fn reorder_object_keys(v: Value, first: &[&str], last: &[&str]) -> Value {
    let Value::Object(mut obj) = v else { return v };
    let mut out = JsonMap::new();
    for k in first {
        if let Some(x) = obj.shift_remove(*k) {
            out.insert((*k).to_string(), x);
        }
    }
    let tail: Vec<(String, Value)> = last.iter().filter_map(|k| obj.shift_remove(*k).map(|x| ((*k).to_string(), x))).collect();
    for (k, x) in std::mem::take(&mut obj) {
        out.insert(k, x);
    }
    for (k, x) in tail {
        out.insert(k, x);
    }
    Value::Object(out)
}

/// Sets keys on the JSON object `v` the way JS assignment does: a key it
/// already has keeps its position and takes the new value, a new key goes at
/// the end, in the order given.
pub fn overlay_object_keys(v: Value, keys: Vec<(&str, Value)>) -> Value {
    let Value::Object(mut obj) = v else { return v };
    for (k, x) in keys {
        obj.insert(k.to_string(), x);
    }
    Value::Object(obj)
}

/// The fields of `FunctionMeta` (FunctionsMeta[string] from @pikku/core).
///
/// Fields written only by finalize (`singleton_services_only`, `contract_hash`,
/// `input_hash`, `output_hash`) are optional/empty so an analyze-only state
/// omits them exactly as TS does.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct FunctionMetaFields {
    pub pikku_func_id: String,
    pub function_type: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub func_wrapper: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sessionless: Option<bool>,
    pub name: String,
    pub services: ServicesMeta,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wires: Option<WiresMeta>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub invokes: Vec<String>,
    pub input_schema_name: Option<String>,
    pub output_schema_name: Option<String>,
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expose: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permissions_in_body: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audit: Option<AuditMeta>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scenario_step: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub webhook_receive: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scenario: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub readonly: Option<bool>,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub deploy: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_required: Option<bool>,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub approval_description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_queued: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_retries: Option<f64>,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub workflow_timeout: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compensate: Option<bool>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub scenario_step_surfaces: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scenario_step_requires_virtual_user: Option<bool>,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub scenario_step_kind: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub scenario_step_addon: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub scenario_step_template: String,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub scopes: Vec<String>,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub implementation_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub errors: Vec<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub middleware: Vec<WireRef>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub permissions: Vec<WireRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_direct_function: Option<bool>,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub source_file: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub body_source_file: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub exported_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body_start: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body_end: Option<i64>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub starts_workflows: Vec<String>,

    // Finalize-only (contract-hashes.ts, post-process.ts).
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub contract_hash: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub input_hash: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub output_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub singleton_services_only: Option<bool>,
}

/// `FunctionMeta` plus the two serialisation modes Go gives it (see
/// `meta.go`). Field access goes through `Deref` to [`FunctionMetaFields`].
#[derive(Clone, Debug, Default, PartialEq)]
pub struct FunctionMeta {
    pub fields: FunctionMetaFields,
    /// Analysis scratch: the entry was created by `ensureFunctionMetadata` for
    /// a function declared inline in a wiring rather than exported. Never
    /// serialised; it selects the key order TS gives such an entry.
    pub inline: bool,
    /// When set, what the entry serialises as instead of the typed fields:
    /// metadata read whole from an addon's generated file, or a partial entry
    /// TS writes with only some of the keys. The keys finalize assigns
    /// afterwards (the contract hashes, singletonServicesOnly) are laid over it.
    pub verbatim: Raw,
    /// Slices that were nil when the entry was decoded from JSON.
    pub nil_slices: NilSlices,
}

/// Which of an entry's slices Go holds as nil (written `null`): decoded from a
/// key that was absent or `null`. A `Vec` is never nil, so the flag stands in;
/// it only takes effect while the `Vec` is still empty.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct NilSlices {
    pub services: bool,
    pub inputs: bool,
    pub outputs: bool,
}

impl FunctionMeta {
    pub fn new(fields: FunctionMetaFields) -> FunctionMeta {
        FunctionMeta { fields, inline: false, verbatim: Raw::default(), nil_slices: NilSlices::default() }
    }

    /// `fields` as JSON with the nil slices written `null`.
    fn fields_json(&self) -> Result<Value, serde_json::Error> {
        let mut v = serde_json::to_value(&self.fields)?;
        let n = self.nil_slices;
        if n.services && self.fields.services.services.is_empty() {
            if let Some(s) = v.get_mut("services") {
                s["services"] = Value::Null;
            }
        }
        if n.inputs && self.fields.inputs.is_empty() {
            v["inputs"] = Value::Null;
        }
        if n.outputs && self.fields.outputs.is_empty() {
            v["outputs"] = Value::Null;
        }
        Ok(v)
    }
}

impl Deref for FunctionMeta {
    type Target = FunctionMetaFields;
    fn deref(&self) -> &FunctionMetaFields {
        &self.fields
    }
}

impl DerefMut for FunctionMeta {
    fn deref_mut(&mut self) -> &mut FunctionMetaFields {
        &mut self.fields
    }
}

/// The key order of a FunctionMeta that ensure-function-metadata.ts creates:
/// the literal it assigns (with its `middleware: undefined` slot), then
/// `sourceFile`, then whatever else was set, then the keys TS assigns last.
const INLINE_META_KEYS_FIRST: [&str; 10] =
    ["pikkuFuncId", "functionType", "name", "services", "inputSchemaName", "outputSchemaName", "inputs", "outputs", "middleware", "sourceFile"];
const INLINE_META_KEYS_LAST: [&str; 7] =
    ["tags", "permissions", "sessionless", "contractHash", "inputHash", "outputHash", "singletonServicesOnly"];

impl Serialize for FunctionMeta {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        if let Some(base) = self.verbatim.value() {
            let mut keys = Vec::new();
            if !self.contract_hash.is_empty() {
                keys.push(("contractHash", Value::from(self.contract_hash.clone())));
            }
            if !self.input_hash.is_empty() {
                keys.push(("inputHash", Value::from(self.input_hash.clone())));
            }
            if !self.output_hash.is_empty() {
                keys.push(("outputHash", Value::from(self.output_hash.clone())));
            }
            if let Some(b) = self.singleton_services_only {
                keys.push(("singletonServicesOnly", Value::from(b)));
            }
            return overlay_object_keys(base.clone(), keys).serialize(s);
        }
        let v = self.fields_json().map_err(serde::ser::Error::custom)?;
        if !self.inline {
            return v.serialize(s);
        }
        reorder_object_keys(v, &INLINE_META_KEYS_FIRST, &INLINE_META_KEYS_LAST).serialize(s)
    }
}

impl<'de> Deserialize<'de> for FunctionMeta {
    /// A key that is absent or `null` is a nil slice in Go (the partial entries
    /// analysis creates); it re-encodes as `null`, which a `Vec` cannot hold, so
    /// the entry remembers which slices were nil (see [`NilSlices`]).
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        let nil = |p: &[&str]| !p.iter().try_fold(&v, |x, k| x.get(*k)).is_some_and(|x| !x.is_null());
        let nil_slices = NilSlices { services: nil(&["services", "services"]), inputs: nil(&["inputs"]), outputs: nil(&["outputs"]) };
        let fields = FunctionMetaFields::deserialize(&v).map_err(serde::de::Error::custom)?;
        let mut m = FunctionMeta::new(fields);
        m.nil_slices = nil_slices;
        Ok(m)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct HttpRouteMetaFields {
    pub pikku_func_id: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub package_name: String,
    pub route: String,
    pub source_file: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<bool>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub params: Vec<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub query: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub errors: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub middleware: Vec<WireRef>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub permissions: Vec<WireRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sse: Option<bool>,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub headers_schema_name: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub group_base_path: String,
    /// Set by annotateHttpRouteAuth, a finalize step: absent after analysis.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires_session: Option<bool>,
}

/// An http.meta route entry; `verbatim` as for [`FunctionMeta`].
#[derive(Clone, Debug, Default, PartialEq)]
pub struct HttpRouteMeta {
    pub fields: HttpRouteMetaFields,
    pub verbatim: Raw,
}

impl HttpRouteMeta {
    pub fn new(fields: HttpRouteMetaFields) -> HttpRouteMeta {
        HttpRouteMeta { fields, verbatim: Raw::default() }
    }
}

impl Deref for HttpRouteMeta {
    type Target = HttpRouteMetaFields;
    fn deref(&self) -> &HttpRouteMetaFields {
        &self.fields
    }
}

impl DerefMut for HttpRouteMeta {
    fn deref_mut(&mut self) -> &mut HttpRouteMetaFields {
        &mut self.fields
    }
}

impl Serialize for HttpRouteMeta {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        if let Some(base) = self.verbatim.value() {
            return match self.requires_session {
                None => base.serialize(s),
                Some(b) => overlay_object_keys(base.clone(), vec![("requiresSession", Value::from(b))]).serialize(s),
            };
        }
        self.fields.serialize(s)
    }
}

impl<'de> Deserialize<'de> for HttpRouteMeta {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        HttpRouteMetaFields::deserialize(d).map(HttpRouteMeta::new)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct QueueWorkerMetaFields {
    pub pikku_func_id: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub package_name: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub errors: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub middleware: Vec<WireRef>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct QueueWorkerMeta {
    pub fields: QueueWorkerMetaFields,
    /// Puts `name` ahead of `pikkuFuncId`, the order of the synthetic workflow
    /// queue entries post-process.ts writes. Never serialised.
    pub name_first: bool,
}

impl Deref for QueueWorkerMeta {
    type Target = QueueWorkerMetaFields;
    fn deref(&self) -> &QueueWorkerMetaFields {
        &self.fields
    }
}

impl DerefMut for QueueWorkerMeta {
    fn deref_mut(&mut self) -> &mut QueueWorkerMetaFields {
        &mut self.fields
    }
}

impl Serialize for QueueWorkerMeta {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        if !self.name_first {
            return self.fields.serialize(s);
        }
        let v = serde_json::to_value(&self.fields).map_err(serde::ser::Error::custom)?;
        reorder_object_keys(v, &["name"], &[]).serialize(s)
    }
}

impl<'de> Deserialize<'de> for QueueWorkerMeta {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(QueueWorkerMeta { fields: QueueWorkerMetaFields::deserialize(d)?, name_first: false })
    }
}

/// One entry of http.metaInputTypes. computeInputTypes always assigns all
/// three arrays, empty ones included.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MetaInputTypes {
    pub query: Strings,
    pub params: Strings,
    pub body: Strings,
}

/// One entry of a [`PathToNameAndType`] map.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct NameAndType {
    pub variable: String,
    #[serde(rename = "type")]
    pub ty: Option<String>,
    pub type_path: Option<String>,
}

/// `Map<file, NameAndType[]>`.
pub type PathToNameAndType = super::ordered::Map<Vec<NameAndType>>;

/// The `{ path, exportedName }` value of the `*Files` maps.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct FileExport {
    pub path: String,
    pub exported_name: String,
}

/// A schemaLookup entry: a Standard Schema value to convert to JSON Schema later.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct SchemaRef {
    pub variable_name: String,
    pub source_file: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub vendor: String,
}

/// extract-secret-usage.ts's per-file result.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SecretUsage {
    pub keys: Strings,
    pub dynamic: Strings,
}

/// One symbol's counters in surfaceUsage.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceUsage {
    pub imports: i64,
    pub seen_in: Strings,
    pub files: Strings,
}

/// A state.diagnostics entry (computeDiagnostics).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct InspectorDiagnostic {
    pub code: String,
    pub message: String,
    pub source_file: String,
    pub position: i64,
}

/// InspectorPassStats; the protocol carries it beside the state.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub files: i64,
    pub project_files: i64,
    pub files_reused: i64,
    pub types: i64,
    pub instantiations: i64,
    pub symbols: i64,
    pub cpu_ms: i64,
    pub wall_ms: i64,
    pub heap_used_mb: i64,
}

// ---- security.go --------------------------------------------------------

/// InspectorMiddlewareDefinition and InspectorPermissionDefinition (the latter
/// adds `requiresData`), and the shape of an approval description (which sets
/// only the first five fields). A permission also carries `dataUnused` and
/// `skipWithoutSession`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MiddlewareDefinition {
    pub services: ServicesMeta,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wires: Option<WiresMeta>,
    pub source_file: String,
    pub position: i64,
    pub exported_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub factory: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires_data: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_unused: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip_without_session: Option<bool>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MiddlewareInstance {
    pub definition_id: String,
    pub source_file: String,
    pub position: i64,
    pub is_factory_call: bool,
}

/// One `add*Middleware` call of a group.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MiddlewareRegistration {
    pub export_name: Option<String>,
    pub source_file: String,
    pub position: i64,
    pub is_factory: bool,
}

/// A tag / HTTP-pattern middleware group.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MiddlewareGroupMeta {
    pub export_name: Option<String>,
    pub source_file: String,
    pub position: i64,
    pub services: ServicesMeta,
    pub count: i64,
    pub instance_ids: Strings,
    pub is_factory: bool,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub additional_registrations: Vec<MiddlewareRegistration>,
}

/// The single pikkuBetterAuth(...) export.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct AuthDefinition {
    pub export_name: String,
    pub source_file: String,
    pub base_path: String,
    pub has_credentials: bool,
    pub cookie_cache: bool,
    pub plugins: Strings,
    pub services: ServicesMeta,
}

// ---- governance.go ------------------------------------------------------

/// One InspectorState.analytics entry (add-analytics.ts).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnalyticsDeclaration {
    pub file: String,
    pub variable: String,
    pub events: Strings,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub props: Option<Record<Record<String>>>,
}

/// One InspectorState.outgoingWebhooks entry (add-outgoing-webhook.ts).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct OutgoingWebhook {
    pub file: String,
    pub variable: String,
    pub event: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<Record<String>>,
}

// ---- agents_mcp.go ------------------------------------------------------

/// A mcpEndpoints.resourcesMeta entry.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MCPResourceMeta {
    pub pikku_func_id: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub package_name: String,
    pub uri: String,
    pub title: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub errors: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub streaming: Option<bool>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub tags: Vec<String>,
    pub input_schema: Option<String>,
    pub output_schema: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub middleware: Vec<WireRef>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MCPToolMetaFields {
    pub pikku_func_id: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub package_name: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub errors: Vec<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub tags: Vec<String>,
    pub input_schema: Option<String>,
    pub output_schema: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub middleware: Vec<WireRef>,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub surface: String,
}

/// A mcpEndpoints.toolsMeta entry. `surface` and `package_name` are only set on
/// tools offered from an addon (load-addon-functions-meta.ts).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MCPToolMeta {
    pub fields: MCPToolMetaFields,
    /// Offered from an addon, which load-addon-functions-meta.ts writes with a
    /// key order of its own. Never serialised.
    pub from_addon: bool,
}

impl Deref for MCPToolMeta {
    type Target = MCPToolMetaFields;
    fn deref(&self) -> &MCPToolMetaFields {
        &self.fields
    }
}

impl DerefMut for MCPToolMeta {
    fn deref_mut(&mut self) -> &mut MCPToolMetaFields {
        &mut self.fields
    }
}

impl Serialize for MCPToolMeta {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        if !self.from_addon {
            return self.fields.serialize(s);
        }
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct AddonView<'a> {
            pikku_func_id: &'a str,
            name: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: &'a Option<String>,
            input_schema: &'a Option<String>,
            output_schema: &'a Option<String>,
            #[serde(skip_serializing_if = "is_empty_vec_ref")]
            tags: &'a Vec<String>,
            #[serde(skip_serializing_if = "str::is_empty")]
            surface: &'a str,
        }
        fn is_empty_vec_ref(v: &&Vec<String>) -> bool {
            v.is_empty()
        }
        let f = &self.fields;
        AddonView {
            pikku_func_id: &f.pikku_func_id,
            name: &f.name,
            description: &f.description,
            input_schema: &f.input_schema,
            output_schema: &f.output_schema,
            tags: &f.tags,
            surface: &f.surface,
        }
        .serialize(s)
    }
}

impl<'de> Deserialize<'de> for MCPToolMeta {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(MCPToolMeta { fields: MCPToolMetaFields::deserialize(d)?, from_addon: false })
    }
}

/// A mcpEndpoints.promptsMeta entry. `arguments` is always `[]` after
/// analysis; the CLI fills it during serialisation.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MCPPromptMeta {
    pub pikku_func_id: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub package_name: String,
    pub name: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub errors: Vec<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub tags: Vec<String>,
    pub input_schema: Option<String>,
    pub output_schema: Option<String>,
    pub arguments: Vec<Raw>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub middleware: Vec<WireRef>,
}

/// An agents.agentsMeta entry. `max_steps`, `temperature` and `tool_choice`
/// hold whatever getPropertyValue read (a number, or the source text of a
/// non-literal), so they stay raw JSON; `provider_options` is a JSON object
/// literal read verbatim.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct AgentMeta {
    pub name: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub role: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub personality: String,
    pub goal: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub errors: Vec<String>,
    pub source_file: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub exported_name: String,
    #[serde(default, skip_serializing_if = "Raw::is_empty")]
    pub max_steps: Raw,
    #[serde(default, skip_serializing_if = "Raw::is_empty")]
    pub temperature: Raw,
    #[serde(default, skip_serializing_if = "Raw::is_empty")]
    pub tool_choice: Raw,
    #[serde(default, skip_serializing_if = "Raw::is_empty")]
    pub provider_options: Raw,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub tools: Vec<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub agents: Vec<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub workflows: Vec<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub scorers: Vec<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub tags: Vec<String>,
    pub input_schema: Option<String>,
    pub output_schema: Option<String>,
    pub working_memory_schema: Option<String>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub middleware: Vec<WireRef>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub channel_middleware: Vec<WireRef>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub agent_middleware: Vec<WireRef>,
    #[serde(default, skip_serializing_if = "is_empty_vec")]
    pub permissions: Vec<WireRef>,
}

/// A scorers.scorersMeta entry. `sample_rate` and `requires_reference` are raw
/// for the same reason as `AgentMeta::max_steps`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct ScorerMeta {
    pub name: String,
    pub description: String,
    pub lane: String,
    pub sample_rate: Raw,
    pub requires_reference: Raw,
    pub source_file: String,
    #[serde(default, skip_serializing_if = "is_empty_str")]
    pub exported_name: String,
}
