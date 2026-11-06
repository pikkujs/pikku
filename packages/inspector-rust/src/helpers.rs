//! Port of Go `internal/helpers`: dispatches the compiler-backed helpers that
//! sit outside `inspect()`: collectSurface, readJsxLiteralText,
//! readModuleSpecifiers, readTsconfigOutDir, the `pikku mocks` stub scan, and
//! the source scans and edits `@pikku/code-edit` and `@pikku/n8n-import` run.
//!
//! Status: NOT PORTED. [`has`] knows the method names (so the CLI's usage error
//! matches Go's) and [`dispatch`] answers every one with `not implemented`.

use serde::Serialize;
use serde_json::Value;

/// The helper methods, in Go's `helpers.Methods` order.
pub const METHODS: &[&str] = &[
    "collectSurface",
    "readJsxLiteralText",
    "readJsxLiteralTextBatch",
    "readModuleSpecifiers",
    "readModuleSpecifiersBatch",
    "readTsconfigOutDir",
    "scanFrontend",
    "scanHooks",
    "readSyntaxErrors",
    "scanMessageUsage",
    "readJsxProps",
    "writeJsxProp",
    "writeJsxStyle",
    "findPikkuCall",
    "readImports",
    "findWireRemoteAddonLiterals",
    "scanAsI18nArguments",
    "scanAsI18nStubs",
    "scanSepArguments",
    "scanJsxLiteralText",
    "scanJsxLiteralProps",
    "scanStringLiteralCopy",
];

/// A failure the TypeScript wrapper rethrows; `name` is the JS error class name
/// when it is not a plain Error.
#[derive(Clone, Debug, Serialize)]
pub struct Error {
    #[serde(skip_serializing_if = "String::is_empty")]
    pub name: String,
    pub message: String,
}

pub fn has(method: &str) -> bool {
    METHODS.contains(&method)
}

/// Go `helpers.Dispatch`: params JSON in, `(result, error)` out.
pub fn dispatch(method: &str, _params: &[u8]) -> (Value, Option<Error>) {
    (Value::Null, Some(Error { name: String::new(), message: format!("helper {method}: not implemented in pikku-inspect-rs") }))
}
