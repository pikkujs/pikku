//! Port of Go `visit/util_channel_cli.go`: helpers shared by the channel and
//! CLI groups (add-channel.ts, add-cli.ts).

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::Context;
use crate::diag::codes;
use crate::state::{Raw, Record};
use crate::tsutil::{self, has_export_modifier, node_start, source_file_of};

/// `makeContextBasedId` (extract-function-name.ts): `wiringType:seg:seg`.
pub fn make_context_based_id(wiring_type: &str, segments: &[&str]) -> String {
    let mut parts = vec![wiring_type];
    parts.extend_from_slice(segments);
    parts.join(":")
}

/// `isTempId`.
pub fn is_temp_id(id: &str) -> bool {
    id.starts_with("__temp_")
}

/// Go `workflowHelpers`.
pub fn is_workflow_helper(name: &str) -> bool {
    matches!(name, "workflow" | "workflowStart" | "workflowStatus" | "graphStart")
}

impl Context<'_> {
    /// `exportedVariableNameOf` is utils/get-exported-variable-name.ts for a
    /// call expression: the name of the exported `const x = <node>` in the
    /// swept file.
    pub fn exported_variable_name_of(&self, node: P<Node>) -> String {
        let Some(sf) = self.source_file else { return String::new() };
        if !ast::is_call_expression(node) {
            return String::new();
        }
        for stmt in sf.statements().nodes() {
            if !ast::is_variable_statement(*stmt) || !has_export_modifier(*stmt) {
                continue;
            }
            let list = stmt.as_variable_statement().declaration_list();
            for d in list.as_variable_declaration_list().declarations().nodes() {
                if d.name().is_some_and(ast::is_identifier) && d.initializer() == Some(node) {
                    return d.name().unwrap().text().to_string();
                }
            }
        }
        String::new()
    }

    /// `wireMetaDiagnostics` emits what getCommonWireMetaData logs before and
    /// while reading the metadata.
    pub fn wire_meta_diagnostics(&mut self, obj: P<Node>, wiring_type: &str, wiring_name: &str) {
        self.assert_string_literal_property(obj, "name", wiring_type);
        for p in obj.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            let not_array = !ast::is_array_literal_expression(p.initializer().unwrap());
            match p.name().unwrap().text() {
                "tags" if not_array => self.log.critical(
                    codes::INVALID_TAGS_TYPE,
                    format!("{wiring_type} '{wiring_name}' has invalid 'tags' property - must be an array of strings."),
                ),
                "errors" if not_array => self.log.critical(
                    codes::INVALID_TAGS_TYPE,
                    format!("{wiring_type} '{wiring_name}' has invalid 'errors' property - must be an array of error identifiers."),
                ),
                _ => {}
            }
        }
    }

    /// `commonWireMeta` is getCommonWireMetaData(obj, wiringType, wiringName, logger, checker).
    pub fn common_wire_meta(&mut self, obj: P<Node>, wiring_type: &str, wiring_name: &str) -> super::util_props::CommonMeta {
        self.wire_meta_diagnostics(obj, wiring_type, wiring_name);
        self.get_common_wire_meta_data(obj)
    }

    /// post-process.ts extractWireNames: records the `wire` middleware used.
    pub fn add_used_middleware(&mut self, list: &[crate::state::WireRef]) {
        for w in list {
            if w.ty == "wire" {
                self.state.service_aggregation.used_middleware.add(w.name.clone());
            }
        }
    }
}

/// `resolveRefContract` is utils/resolve-ref-contract.ts against an addon
/// contract section (`exportedContracts.addonChannel` / `addonCli`), whose
/// values are `{ [contractName]: contract }` objects.
pub fn resolve_ref_contract(node: P<Node>, helper_name: &str, addon_contracts: &Record<Raw>) -> Option<Raw> {
    if !ast::is_call_expression(node) {
        return None;
    }
    let callee = node.expression()?;
    if !ast::is_identifier(callee) || callee.text() != helper_name {
        return None;
    }
    let args = node.arguments();
    if args.is_empty() || !ast::is_string_literal(args[0]) {
        return None;
    }
    let text = args[0].text();
    let sep = text.find(':')?;
    let ns_raw = addon_contracts.get(&text[..sep])?;
    let ns = ns_raw.value()?;
    let contracts = ns.as_object()?;
    let c = contracts.get(&text[sep + 1..])?;
    if c.is_null() {
        return None;
    }
    Some(Raw::of(c.clone()))
}

/// `lineAndCharacter` is `sourceFile.getLineAndCharacterOfPosition(node.getStart())`,
/// both zero-based and in UTF-16 code units like TS.
pub fn line_and_character(n: P<Node>) -> (usize, usize) {
    let sf = source_file_of(n);
    let text = sf.text();
    let mut pos = node_start(n);
    if pos > text.len() {
        pos = text.len();
    }
    let mut line = 0usize;
    let mut line_start = 0usize;
    let bytes = text.as_bytes();
    let mut i = 0usize;
    while i < pos {
        let ch = text[i..].chars().next().unwrap();
        let mut size = ch.len_utf8();
        match ch {
            '\r' => {
                if i + 1 < text.len() && bytes[i + 1] == b'\n' {
                    size = 2;
                }
                line += 1;
                line_start = i + size;
            }
            '\n' | '\u{2028}' | '\u{2029}' => {
                line += 1;
                line_start = i + size;
            }
            _ => {}
        }
        i += size;
    }
    (line, tsutil::utf16_offset(&text[line_start..], pos - line_start))
}

/// `rawObject` decodes a Raw JSON object into an ordered record.
pub fn raw_object(r: &Raw) -> Option<Record<Raw>> {
    let v = r.value()?;
    let obj = v.as_object()?;
    let mut rec = Record::new();
    for (k, x) in obj {
        rec.set(k.clone(), Raw::of(x.clone()));
    }
    Some(rec)
}

/// `rewriteFuncIdRaw` replaces the object's pikkuFuncId when it is `old_id`.
pub fn rewrite_func_id_raw(r: Raw, old_id: &str, new_id: &str) -> Raw {
    let Some(mut obj) = r.value().and_then(|v| v.as_object().cloned()) else { return r };
    if obj.get("pikkuFuncId").and_then(|v| v.as_str()) == Some(old_id) {
        obj.insert("pikkuFuncId".to_string(), serde_json::Value::String(new_id.to_string()));
        return Raw::of(serde_json::Value::Object(obj));
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_ids() {
        assert_eq!(make_context_based_id("channel", &["chat", "onMessage"]), "channel:chat:onMessage");
        assert!(is_temp_id("__temp_1234"));
        assert!(!is_temp_id("temp"));
        assert!(is_workflow_helper("graphStart"));
        assert!(!is_workflow_helper("workflowRun"));
    }

    #[test]
    fn rewrites_func_id() {
        let r = Raw::of(serde_json::json!({"a": 1, "pikkuFuncId": "x", "b": 2}));
        let out = rewrite_func_id_raw(r, "x", "y");
        assert_eq!(out.value().unwrap().to_string(), r#"{"a":1,"pikkuFuncId":"y","b":2}"#);
        let same = rewrite_func_id_raw(Raw::of(serde_json::json!({"pikkuFuncId": "z"})), "x", "y");
        assert_eq!(same.value().unwrap()["pikkuFuncId"], "z");
    }
}
