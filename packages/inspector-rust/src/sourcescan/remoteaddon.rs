use serde::Serialize;
use tsrs_ast::{
    is_call_expression, is_identifier, is_object_literal_expression, is_property_assignment,
};
use tsrs_core::ScriptKind;

use super::{is_string_literal_like, line_of, parse, start, walk};

/// One `wireRemoteAddon({ package: '<literal>' })` call.
#[derive(Serialize)]
pub struct RemoteAddonLiteral {
    pub namespace: Option<String>,
    pub spec: String,
    pub line: usize,
}

pub fn find_wire_remote_addon_literals(file_name: &str, content: &str) -> Vec<RemoteAddonLiteral> {
    let mut found = Vec::new();
    if !content.contains("wireRemoteAddon") {
        return found;
    }
    let sf = parse(file_name, content, ScriptKind::Unknown);
    walk(sf.as_node(), &mut |n| {
        if !(is_call_expression(n) && n.expression().is_some_and(|e| is_identifier(e) && e.text() == "wireRemoteAddon"))
        {
            return;
        }
        let args = n.arguments();
        if args.is_empty() || !is_object_literal_expression(args[0]) {
            return;
        }
        let mut namespace: Option<String> = None;
        let mut literal = None;
        for prop in args[0].properties() {
            if !is_property_assignment(*prop) {
                continue;
            }
            let Some(name) = prop.name() else { continue };
            if !is_identifier(name) {
                continue;
            }
            let init = prop.initializer();
            if name.text() == "name" && is_string_literal_like(init) {
                namespace = Some(init.unwrap().text().to_string());
            } else if name.text() == "package" && is_string_literal_like(init) {
                literal = init;
            }
        }
        if let Some(lit) = literal {
            found.push(RemoteAddonLiteral {
                namespace,
                spec: lit.text().to_string(),
                line: line_of(sf, start(lit, sf)),
            });
        }
    });
    found
}
