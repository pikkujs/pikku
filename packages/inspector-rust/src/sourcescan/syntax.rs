use serde::Serialize;
use tsrs_core::ScriptKind;

use super::parse;
use crate::tsutil::utf16_offset;

/// One parse diagnostic: the TypeScript error code and where it starts (a
/// UTF-16 offset, as `ts.Diagnostic.start` is).
#[derive(Serialize)]
pub struct SyntaxError {
    pub code: i64,
    pub start: usize,
}

/// The syntactic half of `ts.transpileModule(content, {fileName,
/// reportDiagnostics: true}).diagnostics`.
pub fn read_syntax_errors(file_name: &str, content: &str) -> Vec<SyntaxError> {
    let file_name = if file_name.is_empty() { "module.ts" } else { file_name };
    let sf = parse(file_name, content, ScriptKind::Unknown);
    sf.diagnostics()
        .iter()
        .map(|d| SyntaxError { code: d.code() as i64, start: utf16_offset(content, d.pos().unwrap_or(0) as usize) })
        .collect()
}
