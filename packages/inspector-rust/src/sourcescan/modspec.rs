use tsrs_ast::{is_export_declaration, is_import_declaration, is_string_literal};
use tsrs_core::ScriptKind;

use super::parse;

/// `utils/read-module-specifiers.ts`: the module specifiers a file imports from
/// or re-exports from, in statement order.
pub fn read_module_specifiers(file_name: &str, content: &str) -> Vec<String> {
    let sf = parse(file_name, content, ScriptKind::Unknown);
    let mut found = Vec::new();
    for statement in sf.statements().nodes() {
        if !is_import_declaration(*statement) && !is_export_declaration(*statement) {
            continue;
        }
        let Some(spec) = statement.module_specifier() else { continue };
        if !is_string_literal(spec) {
            continue;
        }
        found.push(spec.text().to_string());
    }
    found
}
