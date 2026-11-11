//! Port of Go `internal/protocol`: the wire format between the TS wrapper and
//! the binary: one [`Request`] in, one [`Response`] out (`inspect --stdin`), or
//! NDJSON envelopes of them (`serve`). Schemas: `packages/inspector-go/protocol`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fmt;

use crate::diag::{Diagnostic, Pass};
use crate::state::State;

/// Bumped on any incompatible change to Request or Response.
pub const VERSION: i64 = 1;

/// inspect()'s (routeFiles, options) pair.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Request {
    pub route_files: Vec<String>,
    pub options: Options,
    /// A serve-mode hint; the SourceFile cache compares file text anyway, so it
    /// is only used for stats today.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub changed_files: Vec<String>,
}

/// The serializable subset of InspectorOptions the analysis reads.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Options {
    #[serde(skip_serializing_if = "String::is_empty")]
    pub tsconfig: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub root_dir: String,
    #[serde(skip_serializing_if = "is_false")]
    pub setup_only: bool,
    /// InspectorOptions.isAddon: the project is an addon package, so
    /// checkAddonBans applies.
    #[serde(skip_serializing_if = "is_false")]
    pub is_addon: bool,
    /// InspectorOptions.types. Only finalize reads it; it is accepted and
    /// passed through untouched.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub types: Option<Value>,
    /// InspectorOptions.schemaConfig; schemas are generated only when present.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_config: Option<SchemaConfig>,
    /// InspectorOptions.classificationCheck.
    #[serde(skip_serializing_if = "is_false")]
    pub classification_check: bool,
    /// InspectorOptions.allow, the project's opt-ins.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow: Option<Allow>,

    // Read only by finalize (`inspect --finalize`, `finalize --stdin`).
    #[serde(rename = "openAPI", skip_serializing_if = "Option::is_none")]
    pub open_api: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<Value>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub model_aliases: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "is_false")]
    pub strict_meta: bool,
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// Mirrors the `allow` block of pikku.config.json.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Allow {
    #[serde(skip_serializing_if = "is_false")]
    pub complex_workflows: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub permissions_in_body: bool,
}

/// Mirrors the object packages/cli/src/services.ts passes.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SchemaConfig {
    pub tsconfig: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub schemas_from_types: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema: Option<Value>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub cache_dir: String,
    /// The Node script that converts the Zod (vendor) schemas QuickJS cannot.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub vendor_script: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
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

/// The result of one inspection: the finalized state (analysis alone, from
/// `analyze::run`, leaves `finalized` false), diagnostics, stats. When the
/// inspection failed after it began logging, `error` is set, `state` is `None`
/// and `diagnostics` holds what was logged up to the failure.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Response {
    pub protocol: i64,
    pub finalized: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<Box<State>>,
    pub diagnostics: Vec<Diagnostic>,
    pub stats: Stats,
    /// Marks the diagnostics finalize logged between
    /// `logger.beginValidationPass()` and `logger.endValidationPass()`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_pass: Option<Pass>,
    /// The message the TypeScript inspector would have thrown.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub error: String,
}

/// An inspection that stopped with an error after logging: the TypeScript
/// inspector logs, then throws. It carries the diagnostics so they still reach
/// the user.
#[derive(Clone, Debug)]
pub struct Failure {
    pub message: String,
    pub diagnostics: Vec<Diagnostic>,
}

impl fmt::Display for Failure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for Failure {}

impl Failure {
    /// The Response that reports this failure.
    pub fn into_response(self) -> Response {
        Response { protocol: VERSION, diagnostics: self.diagnostics, error: self.message, ..Response::default() }
    }
}

/// One NDJSON line in `serve` mode.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ServeRequest {
    pub id: Option<Value>,
    pub method: String,
    pub params: Request,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ServeResponse {
    /// Go's `json.RawMessage` with no omitempty: a missing id writes `null`.
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Response>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ServeError>,
    /// Rust-only: set once the process has spent its leak budget, so the
    /// caller retires it after this response.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub recycle: Option<bool>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ServeError {
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_key_order_and_omissions() {
        let r = Response { protocol: VERSION, ..Response::default() };
        assert_eq!(
            crate::jsjson::to_string(&r).unwrap(),
            r#"{"protocol":1,"finalized":false,"diagnostics":[],"stats":{"files":0,"projectFiles":0,"filesReused":0,"types":0,"instantiations":0,"symbols":0,"cpuMs":0,"wallMs":0,"heapUsedMb":0}}"#
        );
    }

    #[test]
    fn failure_response_has_error_and_no_state() {
        let f = Failure { message: "boom".into(), diagnostics: vec![] };
        let json = crate::jsjson::to_string(&f.into_response()).unwrap();
        assert!(json.starts_with(r#"{"protocol":1,"finalized":false,"diagnostics":[]"#));
        assert!(json.ends_with(r#","error":"boom"}"#));
    }

    #[test]
    fn request_decodes_with_unknown_fields_ignored_like_go() {
        let r: Request = serde_json::from_str(
            r#"{"routeFiles":["/a.ts"],"options":{"rootDir":"/x","setupOnly":true,"future":1}}"#,
        )
        .unwrap();
        assert_eq!(r.route_files, ["/a.ts"]);
        assert!(r.options.setup_only);
        assert_eq!(r.options.root_dir, "/x");
    }
}
