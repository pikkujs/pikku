//! Small helpers Go defines inside individual group files but several groups
//! (and other porters) need: `jsObject` (group_keyed.go), `wiringCall`
//! (group_http.go), `literalNamedProperty` (group_system_role.go),
//! `literalKeyName` (group_scope.go), `definerDeclaration` / `moduleExportedName`
//! / `readEventShape` (group_analytics.go), `nodePosition` / `relToRoot`
//! (check_disabled.go), `assertStringLiteralProperty` (group_keyed.go).
//!
//! They are defined once here so the groups that own those Go files can import
//! them rather than re-port them; if a porter moves one into its own module,
//! delete it here in the same commit.

use serde_json::{Map as JsonMap, Value};
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::Context;
use crate::diag::codes;
use crate::state::{Raw, Record};
use crate::tsutil::{self, collapse_whitespace, node_text, rel_path, source_file_of};

/// Go `jsObject`: builds a JSON object in insertion order, dropping undefined
/// (`None`) values as `JSON.stringify` does.
#[derive(Clone, Debug, Default)]
pub struct JsObject {
    rec: JsonMap<String, Value>,
}

impl JsObject {
    pub fn new() -> JsObject {
        JsObject::default()
    }

    /// `set(k, v)`: a `None` value is skipped (undefined). Re-setting a key keeps
    /// its position.
    pub fn set(&mut self, k: &str, v: Option<Value>) {
        if let Some(v) = v {
            self.rec.insert(k.to_string(), v);
        }
    }

    pub fn set_str(&mut self, k: &str, v: &str) {
        self.set(k, Some(Value::from(v)));
    }

    pub fn raw(&self) -> Raw {
        Raw::of(Value::Object(self.rec.clone()))
    }

    pub fn into_value(self) -> Value {
        Value::Object(self.rec)
    }
}

/// `[]string` as a JSON value.
pub fn strs_value(v: &[String]) -> Value {
    Value::Array(v.iter().map(|s| Value::from(s.as_str())).collect())
}

/// `wiringCall` returns the object-literal first argument of a
/// `<callee>({...})` call, or `None`.
pub fn wiring_call(node: P<Node>, callee: &str) -> Option<P<Node>> {
    if !ast::is_call_expression(node) {
        return None;
    }
    let e = node.expression()?;
    if !ast::is_identifier(e) || e.text() != callee {
        return None;
    }
    let args = node.arguments();
    if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
        return None;
    }
    Some(args[0])
}

/// `definitionCall` returns the object-literal first argument of `fnName({...})`
/// (identical to [`wiring_call`]; Go keeps both names).
pub fn definition_call(node: P<Node>, fn_name: &str) -> Option<P<Node>> {
    wiring_call(node, fn_name)
}

/// `literalKeyName`: an identifier or string-literal key.
pub fn literal_key_name(name: Option<P<Node>>) -> Option<String> {
    let n = name?;
    if ast::is_identifier(n) || ast::is_string_literal(n) { Some(n.text().to_string()) } else { None }
}

/// `literalNamedProperty` finds a property assignment whose identifier or
/// string-literal name is `name`.
pub fn literal_named_property(obj: P<Node>, name: &str) -> Option<P<Node>> {
    for p in obj.properties() {
        if !ast::is_property_assignment(*p) {
            continue;
        }
        if literal_key_name(p.name()).as_deref() == Some(name) {
            return Some(*p);
        }
    }
    None
}

/// `readEventShape` is an event's props as whitespace-collapsed source text;
/// `None` when no shape can be read.
pub fn read_event_shape(init: P<Node>) -> Option<Record<String>> {
    let shape = find_object_shape(init)?;
    let mut props = Record::new();
    for p in shape.properties() {
        if !ast::is_property_assignment(*p) {
            continue;
        }
        let Some(key) = literal_key_name(p.name()) else { continue };
        props.set(key, collapse_whitespace(node_text(p.initializer().unwrap())));
    }
    Some(props)
}

/// `findObjectShape` finds the `z.object({ ... })` shape anywhere in a call chain.
fn find_object_shape(expr: P<Node>) -> Option<P<Node>> {
    let mut cur = Some(expr);
    while let Some(c) = cur {
        if !ast::is_call_expression(c) {
            break;
        }
        let callee = c.expression().unwrap();
        if ast::is_property_access_expression(callee) && callee.name().unwrap().text() == "object" {
            let args = c.arguments();
            if !args.is_empty() && ast::is_object_literal_expression(args[0]) {
                return Some(args[0]);
            }
        }
        cur = if ast::is_property_access_expression(callee) { callee.expression() } else { None };
    }
    None
}

impl Context<'_> {
    /// `relToRoot`.
    pub fn rel_to_root(&self, file: &str) -> String {
        rel_path(&self.root_dir, file).unwrap_or_else(|| file.to_string())
    }

    /// `nodePosition`: `<relative file>:<1-based line>`.
    pub fn node_position(&self, node: P<Node>) -> String {
        let sf = source_file_of(node);
        let line = tsrs_scanner::get_ecma_line_of_position(sf.get(), tsutil::node_start(node) as u32) + 1;
        format!("{}:{}", self.rel_to_root(sf.file_name()), line)
    }

    /// `assertStringLiteralProperty` is get-property-value.ts's helper.
    pub fn assert_string_literal_property(&mut self, obj: P<Node>, name: &str, wiring_type: &str) {
        let Some(p) = tsutil::find_property_assignment(obj, name) else { return };
        let init = p.initializer().unwrap();
        if ast::is_string_literal(init) || ast::is_no_substitution_template_literal(init) || ast::is_numeric_literal(init) {
            return;
        }
        self.log.critical(
            codes::NON_LITERAL_WIRE_NAME,
            format!(
                "{wiring_type} has a non-literal '{name}': `{}`. Wiring identity fields must be inline string literals — the inspector reads them statically from source, so a const or variable reference is keyed by its identifier text and the wiring is silently skipped at runtime. Inline the literal instead, e.g. {name}: 'my-wiring-name'.",
                node_text(init)
            ),
        );
    }

    /// `callsImportedDefiner` (add-analytics.ts; group_feature_flag.go in Go): the
    /// callee resolves to an import of `definer`, whatever the file calls it
    /// locally.
    pub fn calls_imported_definer(&mut self, expr: P<Node>, definer: &str) -> bool {
        if !ast::is_identifier(expr) {
            return false;
        }
        let Some(sym) = self.symbol_at(expr) else { return expr.text() == definer };
        if let Some(decl) = tsutil::first_decl(Some(sym)) {
            if ast::is_import_specifier(decl) {
                let n = decl.property_name().or_else(|| decl.name()).unwrap();
                return n.text() == definer;
            }
        }
        if !sym.flags().intersects(tsrs_ast::SymbolFlags::Alias) {
            return false;
        }
        let resolved = self.resolve_alias(Some(sym)).unwrap();
        tsutil::symbol_name(resolved) == definer
    }

    /// `definerDeclaration` matches `const <name> = <definer>(...)` and returns
    /// the call and the name identifier. (`callsImportedDefiner` belongs to the
    /// analytics group.)
    pub fn definer_declaration(&mut self, node: P<Node>, definer: &str) -> Option<(P<Node>, P<Node>)> {
        if !ast::is_variable_declaration(node) {
            return None;
        }
        let init = node.initializer()?;
        if !ast::is_call_expression(init) || !self.calls_imported_definer(init.expression().unwrap(), definer) {
            return None;
        }
        let name = node.name()?;
        if !ast::is_identifier(name) {
            return None;
        }
        Some((init, name))
    }

    /// `moduleExportedName` is add-analytics.ts exportedName: the name the module
    /// exports the declaration under.
    pub fn module_exported_name(&mut self, decl: P<Node>, name: P<Node>) -> Option<String> {
        let sf = source_file_of(decl);
        let mut mod_sym = self.checker.get_symbol_at_location_exported(sf.as_node());
        if mod_sym.is_none() {
            mod_sym = sf.as_node().symbol();
        }
        let decl_sym = self.checker.get_symbol_at_location_exported(name);
        let (Some(mod_sym), Some(decl_sym)) = (mod_sym, decl_sym) else {
            if self.is_named_export(decl) {
                return Some(name.text().to_string());
            }
            return None;
        };
        for exp in self.checker.get_exports_of_module_exported(mod_sym) {
            if self.resolve_alias(Some(exp)) == Some(decl_sym) {
                return Some(tsutil::symbol_name(exp));
            }
        }
        None
    }
}
