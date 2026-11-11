//! Port of `pikkucall.go`: `CodeEditService.findPikkuCall` and `ensureImports`.

use serde::Serialize;
use tsrs_ast::{
    Node, is_call_expression, is_identifier, is_import_declaration, is_named_imports, is_object_literal_expression,
    is_property_assignment, is_string_literal, is_variable_declaration, is_variable_statement,
};
use tsrs_core::{P, ScriptKind};

use super::NodeLit;
use super::{end, for_each_child, parse, start};
use crate::tsutil::utf16_offset;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PropertyLocation {
    pub name: String,
    pub value_start: usize,
    pub value_end: usize,
    pub prop_start: usize,
    pub prop_end: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ValueRange {
    pub value_start: usize,
    pub value_end: usize,
}

/// `Found` is false when the name is not declared with a pikku call.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PikkuCall {
    pub found: bool,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub wrapper_name: String,
    #[serde(skip_serializing_if = "is_zero")]
    pub object_end: usize,
    pub properties: Vec<PropertyLocation>,
    pub func_property: Option<ValueRange>,
}

fn is_zero(n: &usize) -> bool {
    *n == 0
}

pub fn find_pikku_call(content: &str, exported_name: &str) -> PikkuCall {
    let sf = parse("temp.ts", content, ScriptKind::TS);
    let u16 = |b: usize| utf16_offset(content, b);
    let mut result = PikkuCall { found: false, wrapper_name: String::new(), object_end: 0, properties: vec![], func_property: None };
    let mut done = false;

    let mut extract = |n: P<Node>, result: &mut PikkuCall, done: &mut bool| {
        if !is_call_expression(n) {
            return;
        }
        let Some(callee) = n.expression() else { return };
        if !is_identifier(callee) {
            return;
        }
        let wrapper = callee.text();
        if !wrapper.starts_with("pikku") {
            return;
        }
        let args = n.arguments();
        if args.is_empty() || !is_object_literal_expression(args[0]) {
            return;
        }
        let object = args[0];
        let mut call = PikkuCall {
            found: true,
            wrapper_name: wrapper.to_string(),
            object_end: u16(end(object)),
            properties: vec![],
            func_property: None,
        };
        for prop in object.properties() {
            if !is_property_assignment(*prop) {
                continue;
            }
            let name = prop.name().unwrap();
            if !is_identifier(name) {
                continue;
            }
            let init = prop.initializer().unwrap();
            let loc = PropertyLocation {
                name: name.text().to_string(),
                value_start: u16(start(init, sf)),
                value_end: u16(end(init)),
                prop_start: u16(start(*prop, sf)),
                prop_end: u16(end(*prop)),
            };
            if loc.name == "func" {
                call.func_property = Some(ValueRange { value_start: loc.value_start, value_end: loc.value_end });
            }
            call.properties.push(loc);
        }
        *result = call;
        *done = true;
    };

    fn visit(
        n: P<Node>,
        exported: &str,
        done: &mut bool,
        result: &mut PikkuCall,
        extract: &mut dyn FnMut(P<Node>, &mut PikkuCall, &mut bool),
    ) {
        if *done {
            return;
        }
        if is_variable_statement(n) {
            for decl in n.as_variable_statement().declaration_list.as_variable_declaration_list().declarations.nodes() {
                let name = decl.name().unwrap();
                if is_identifier(name) && name.text() == exported {
                    if let Some(init) = decl.initializer() {
                        extract(init, result, done);
                        return;
                    }
                }
            }
        } else if is_variable_declaration(n) {
            let name = n.name().unwrap();
            if is_identifier(name) && name.text() == exported {
                if let Some(init) = n.initializer() {
                    extract(init, result, done);
                    return;
                }
            }
        }
        for_each_child(n, &mut |c| visit(c, exported, done, result, extract));
    }
    // visit over the source file's children, like Go's forEachChild(sf, visit)
    let root = sf.as_node();
    for_each_child(root, &mut |c| visit(c, exported_name, &mut done, &mut result, &mut extract));
    result
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportClauseInfo {
    pub module: String,
    pub names: Vec<String>,
    pub insert_at: Option<usize>,
    pub end: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportsInfo {
    pub last_import_end: usize,
    pub imports: Vec<ImportClauseInfo>,
}

pub fn read_imports(content: &str) -> ImportsInfo {
    let sf = parse("temp.ts", content, ScriptKind::TS);
    let u16 = |b: usize| utf16_offset(content, b);
    let mut info = ImportsInfo { last_import_end: 0, imports: vec![] };
    for statement in sf.statements().nodes() {
        if !is_import_declaration(*statement) {
            continue;
        }
        let e = u16(end(*statement));
        if e > info.last_import_end {
            info.last_import_end = e;
        }
        let decl = statement.as_import_declaration();
        if !is_string_literal(decl.module_specifier) {
            continue;
        }
        let mut entry = ImportClauseInfo {
            module: decl.module_specifier.lit().to_string(),
            names: vec![],
            insert_at: None,
            end: e,
        };
        if let Some(clause) = decl.import_clause {
            if let Some(bindings) = clause.as_import_clause().named_bindings {
                if is_named_imports(bindings) {
                    let elements = bindings.as_named_imports().elements.nodes();
                    for el in elements {
                        entry.names.push(el.name().unwrap().text().to_string());
                    }
                    let at = if let Some(last) = elements.last() {
                        u16(end(*last))
                    } else {
                        u16(end(bindings)) - 1
                    };
                    entry.insert_at = Some(at);
                }
            }
        }
        info.imports.push(entry);
    }
    info
}
