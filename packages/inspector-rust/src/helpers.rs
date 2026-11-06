//! Port of Go `internal/helpers`: dispatches the compiler-backed helpers that
//! sit outside `inspect()`: collectSurface, readJsxLiteralText,
//! readModuleSpecifiers, readTsconfigOutDir, the `pikku mocks` stub scan, and
//! the source scans and edits `@pikku/code-edit` and `@pikku/n8n-import` run.
//!
//! Every method is dispatched here with the same params and result shapes as Go.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_json::value::RawValue;

use crate::sourcescan::jsxprops::{PropValue, StyleEntry};
use crate::sourcescan::{
    jsxprops, jsxtext, messageusage, modspec, pikkucall, remoteaddon, sourcechecks, stubscan, syntax, tsconfig,
};

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


#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct SourceFileParams {
    file_name: String,
    content: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Batch {
    files: Vec<SourceFileParams>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct ScanFrontendParams {
    root_dir: String,
    files: Vec<String>,
    client: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct JsxPosition {
    source: String,
    line: i64,
    col: i64,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct WriteJsxPropParams {
    #[serde(flatten)]
    pos: JsxPosition,
    name: String,
    value: Value,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct StyleEntryParams {
    prop: String,
    value: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct WriteJsxStyleParams {
    #[serde(flatten)]
    pos: JsxPosition,
    styles: Vec<StyleEntryParams>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct FindPikkuCallParams {
    content: String,
    exported_name: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RootParams {
    root: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ContentParams {
    content: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct DirParams {
    dir: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct TsconfigParams {
    tsconfig: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct JsxLiteralTextParams {
    dir: String,
    allowed: Vec<String>,
    gated: bool,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct JsxLiteralPropsParams {
    dir: String,
    allowed: Vec<String>,
    gated: bool,
    props: Vec<String>,
    helpers: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct StringLiteralCopyParams {
    dir: String,
    copy_helpers: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ScanHooksParams {
    file: String,
    text: String,
}

fn plain(message: impl Into<String>) -> Error {
    Error { name: String::new(), message: message.into() }
}

fn decode<T: for<'de> Deserialize<'de> + Default>(params: &[u8]) -> Result<T, Error> {
    if params.iter().all(|b| b.is_ascii_whitespace()) {
        return Ok(T::default());
    }
    serde_json::from_slice(params).map_err(|e| plain(format!("bad params: {e}")))
}

/// Encodes a result the way Go's `jsjson.Marshal` does, so a value that
/// `serde_json::Value` cannot hold (a lone surrogate from a UTF-16 cut) survives.
fn json<T: Serialize>(v: T) -> Result<Box<RawValue>, Error> {
    let b = crate::jsjson::marshal(&v, "").map_err(|e| plain(e.to_string()))?;
    RawValue::from_string(crate::sourcescan::unmark_surrogates(&String::from_utf8(b).map_err(|e| plain(e.to_string()))?).into_owned()).map_err(|e| plain(e.to_string()))
}

fn null() -> Box<RawValue> {
    RawValue::from_string("null".into()).unwrap()
}

fn prop_value(v: &Value) -> Option<PropValue> {
    match v {
        Value::Null => None,
        Value::String(s) => Some(PropValue::Str(s.clone())),
        Value::Bool(b) => Some(PropValue::Bool(*b)),
        Value::Number(n) => Some(PropValue::Num(n.as_f64().unwrap_or(0.0))),
        _ => Some(PropValue::Other),
    }
}

/// Go `helpers.Dispatch`: params JSON in, `(result, error)` out.
pub fn dispatch(method: &str, params: &[u8]) -> (Box<RawValue>, Option<Error>) {
    match run(method, params) {
        Ok(v) => (v, None),
        Err(e) => (null(), Some(e)),
    }
}

fn run(method: &str, params: &[u8]) -> Result<Box<RawValue>, Error> {
    match method {
        "collectSurface" => crate::surface::collect_surface_params(params),
        "readJsxLiteralText" => {
            let p: SourceFileParams = decode(params)?;
            json(jsxtext::read_jsx_literal_text(&p.file_name, &p.content))
        }
        "readJsxLiteralTextBatch" => {
            let p: Batch = decode(params)?;
            json(p.files.iter().map(|f| jsxtext::read_jsx_literal_text(&f.file_name, &f.content)).collect::<Vec<_>>())
        }
        "readModuleSpecifiers" => {
            let p: SourceFileParams = decode(params)?;
            json(modspec::read_module_specifiers(&p.file_name, &p.content))
        }
        "readModuleSpecifiersBatch" => {
            let p: Batch = decode(params)?;
            json(p.files.iter().map(|f| modspec::read_module_specifiers(&f.file_name, &f.content)).collect::<Vec<_>>())
        }
        "readTsconfigOutDir" => {
            let p: TsconfigParams = decode(params)?;
            json(tsconfig::read_tsconfig_out_dir(&p.tsconfig))
        }
        "scanFrontend" => {
            let p: ScanFrontendParams = decode(params)?;
            json(stubscan::scan_frontend(&p.root_dir, &p.files, &p.client))
        }
        "scanHooks" => {
            let p: ScanHooksParams = decode(params)?;
            json(stubscan::scan_hooks(&p.file, &p.text, None))
        }
        "readJsxProps" => {
            let p: JsxPosition = decode(params)?;
            match jsxprops::read_jsx_props(&p.source, p.line, p.col) {
                None => Ok(null()),
                Some(props) => json(
                    props
                        .into_iter()
                        .map(|(name, value)| {
                            let mut m = serde_json::Map::new();
                            m.insert("name".into(), Value::String(name));
                            m.insert("value".into(), value);
                            Value::Object(m)
                        })
                        .collect::<Vec<_>>(),
                ),
            }
        }
        "writeJsxProp" => {
            let p: WriteJsxPropParams = decode(params)?;
            let v = prop_value(&p.value);
            json(jsxprops::write_jsx_prop(&p.pos.source, p.pos.line, p.pos.col, &p.name, v.as_ref()))
        }
        "writeJsxStyle" => {
            let p: WriteJsxStyleParams = decode(params)?;
            let styles: Vec<StyleEntry> =
                p.styles.into_iter().map(|s| StyleEntry { prop: s.prop, value: s.value }).collect();
            match jsxprops::write_jsx_style(&p.pos.source, p.pos.line, p.pos.col, &styles) {
                Ok(s) => json(s),
                Err(e) => Err(Error { name: "JsxStyleError".into(), message: e.message }),
            }
        }
        "findWireRemoteAddonLiterals" => {
            let p: SourceFileParams = decode(params)?;
            json(remoteaddon::find_wire_remote_addon_literals(&p.file_name, &p.content))
        }
        "findPikkuCall" => {
            let p: FindPikkuCallParams = decode(params)?;
            json(pikkucall::find_pikku_call(&p.content, &p.exported_name))
        }
        "readImports" => {
            let p: ContentParams = decode(params)?;
            json(pikkucall::read_imports(&p.content))
        }
        "scanMessageUsage" => {
            let p: RootParams = decode(params)?;
            json(messageusage::scan_message_usage(&p.root))
        }
        "scanAsI18nArguments" => {
            let p: DirParams = decode(params)?;
            json(sourcechecks::find_as_i18n_arguments(&p.dir))
        }
        "scanAsI18nStubs" => {
            let p: DirParams = decode(params)?;
            json(sourcechecks::find_as_i18n_stubs(&p.dir))
        }
        "scanSepArguments" => {
            let p: DirParams = decode(params)?;
            json(sourcechecks::find_sep_arguments(&p.dir))
        }
        "scanJsxLiteralText" => {
            let p: JsxLiteralTextParams = decode(params)?;
            json(sourcechecks::find_jsx_literal_text(&p.dir, &p.allowed, p.gated))
        }
        "scanJsxLiteralProps" => {
            let p: JsxLiteralPropsParams = decode(params)?;
            json(sourcechecks::find_jsx_literal_props(&p.dir, &p.allowed, &p.props, &p.helpers, p.gated))
        }
        "scanStringLiteralCopy" => {
            let p: StringLiteralCopyParams = decode(params)?;
            json(sourcechecks::find_string_literal_copy(&p.dir, &p.copy_helpers))
        }
        "readSyntaxErrors" => {
            let p: SourceFileParams = decode(params)?;
            json(syntax::read_syntax_errors(&p.file_name, &p.content))
        }
        _ => Err(plain(format!("unknown method {method}"))),
    }
}
