//! Port of Go `visit/group_feature.go`: add/add-feature.ts.

use serde_json::Value;
use tsrs_ast::{self as ast, Kind, Node, SymbolFlags};
use tsrs_core::P;

use super::util_shared::{JsObject, strs_value};
use super::util_wire_meta::num_value;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::tsutil::{self, file_name_of, symbol_name};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addFeature", phase: Phase::Routes, order: order::ADD_FEATURE, visit: |c, n| c.add_feature(n) });
}

/// `literalValue` reads a fully literal expression into a JSON value; `None`
/// for anything computed.
fn literal_value(n: P<Node>) -> Option<Value> {
    if ast::is_string_literal_like(n) {
        return Some(Value::from(n.text()));
    }
    match n.kind() {
        Kind::TrueKeyword => return Some(Value::Bool(true)),
        Kind::FalseKeyword => return Some(Value::Bool(false)),
        Kind::NullKeyword => return Some(Value::Null),
        _ => {}
    }
    if ast::is_numeric_literal(n) || ast::is_prefix_unary_expression(n) {
        // JSON.stringify(-0) is "0"; num_value truncates it.
        return tsutil::numeric_value(n).map(num_value);
    }
    if ast::is_array_literal_expression(n) {
        let mut values = Vec::new();
        for el in n.elements() {
            values.push(literal_value(*el)?);
        }
        return Some(Value::Array(values));
    }
    if ast::is_object_literal_expression(n) {
        let mut rec = serde_json::Map::new();
        for p in n.properties() {
            if !ast::is_property_assignment(*p) {
                return None;
            }
            let k = p.name().unwrap();
            if !ast::is_identifier(k) && !ast::is_string_literal_like(k) {
                return None;
            }
            let v = literal_value(p.initializer().unwrap())?;
            rec.insert(k.text().to_string(), v);
        }
        return Some(Value::Object(rec));
    }
    None
}

/// `featureProperty` is add-feature.ts getProperty (identifier names only).
fn feature_property(obj: P<Node>, name: &str) -> Option<P<Node>> {
    tsutil::find_property_assignment(obj, name).map(|p| p.initializer().unwrap())
}

fn feature_has_property(obj: P<Node>, name: &str) -> bool {
    obj.properties().iter().any(|p| {
        (ast::is_property_assignment(*p) || ast::is_method_declaration(*p) || ast::is_shorthand_property_assignment(*p))
            && p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == name)
    })
}

fn feature_string(obj: P<Node>, name: &str) -> Option<String> {
    let v = feature_property(obj, name)?;
    if ast::is_string_literal_like(v) { Some(v.text().to_string()) } else { None }
}

impl Context<'_> {
    /// `scenarioName` resolves a scenario reference to its declared name,
    /// following an import alias back to the original export.
    fn scenario_name(&mut self, n: P<Node>) -> Option<String> {
        if !ast::is_identifier(n) {
            return None;
        }
        let Some(mut sym) = self.symbol_at(n) else { return Some(n.text().to_string()) };
        if sym.flags().intersects(SymbolFlags::Alias) {
            sym = self.checker.get_aliased_symbol(sym);
        }
        let name = symbol_name(sym);
        if !name.is_empty() {
            return Some(name);
        }
        let t = n.text();
        if t.is_empty() { None } else { Some(t.to_string()) }
    }

    fn mentioned_scenario(&mut self, el: P<Node>) -> Option<String> {
        if ast::is_identifier(el) {
            return self.scenario_name(el);
        }
        if ast::is_object_literal_expression(el) {
            if let Some(r) = feature_property(el, "scenario") {
                return self.scenario_name(r);
            }
        }
        None
    }

    fn read_feature_entry(&mut self, el: P<Node>) -> Option<Value> {
        if ast::is_identifier(el) {
            let scenario = self.scenario_name(el)?;
            if scenario.is_empty() {
                return None;
            }
            let mut o = JsObject::new();
            o.set_str("scenario", &scenario);
            return Some(o.into_value());
        }
        if !ast::is_object_literal_expression(el) {
            return None;
        }
        let r = feature_property(el, "scenario")?;
        let scenario = self.scenario_name(r)?;
        if scenario.is_empty() {
            return None;
        }
        let mut o = JsObject::new();
        o.set_str("scenario", &scenario);
        if let Some(data_node) = feature_property(el, "data") {
            o.set("data", Some(literal_value(data_node)?));
        }
        Some(o.into_value())
    }

    pub fn add_feature(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) {
            return;
        }
        let expr = node.expression().unwrap();
        if !ast::is_identifier(expr) || expr.text() != "pikkuFeature" {
            return;
        }
        let exported_name = self.extract_function_name(node).exported_name;
        if exported_name.is_empty() {
            self.log.critical(
                codes::MISSING_NAME,
                "A pikkuFeature() must be assigned to an export \u{2014} the export identifier is the feature's id.",
            );
            return;
        }

        let mut entries: Vec<Value> = Vec::new();
        let mut mentions: Vec<String> = Vec::new();
        let (mut unresolved, mut unnamed) = (0i64, 0i64);
        let (mut has_before, mut has_after) = (false, false);
        let (mut document, mut name, mut description, mut tags): (Option<Value>, Option<Value>, Option<Value>, Option<Value>) =
            (None, None, None, None);

        let args = node.arguments();
        if !args.is_empty() && ast::is_object_literal_expression(args[0]) {
            let config = args[0];
            name = feature_string(config, "name").map(Value::from);
            description = feature_string(config, "description").map(Value::from);
            if let Some(v) = feature_property(config, "tags") {
                if ast::is_array_literal_expression(v) {
                    let out: Vec<String> =
                        v.elements().iter().filter(|e| ast::is_string_literal_like(**e)).map(|e| e.text().to_string()).collect();
                    if out.len() == v.elements().len() {
                        tags = Some(strs_value(&out));
                    }
                }
            }
            if let Some(v) = feature_property(config, "document") {
                match v.kind() {
                    Kind::TrueKeyword => document = Some(Value::Bool(true)),
                    Kind::FalseKeyword => document = Some(Value::Bool(false)),
                    _ => {}
                }
            }
            has_before = feature_has_property(config, "before");
            has_after = feature_has_property(config, "after");

            if let Some(scenarios) = feature_property(config, "scenarios") {
                if ast::is_array_literal_expression(scenarios) {
                    for el in scenarios.elements() {
                        match self.mentioned_scenario(*el) {
                            Some(m) if !m.is_empty() => mentions.push(m),
                            _ => unnamed += 1,
                        }
                        match self.read_feature_entry(*el) {
                            Some(e) => entries.push(e),
                            None => unresolved += 1,
                        }
                    }
                }
            }
        }

        let mut f = JsObject::new();
        f.set_str("path", file_name_of(node));
        f.set_str("exportedName", &exported_name);
        f.set("entries", Some(Value::Array(entries)));
        f.set("unresolvedEntries", Some(Value::from(unresolved)));
        f.set("mentions", Some(strs_value(&mentions)));
        f.set("unnamedEntries", Some(Value::from(unnamed)));
        f.set("hasBefore", Some(Value::Bool(has_before)));
        f.set("hasAfter", Some(Value::Bool(has_after)));
        f.set("document", document);
        f.set("name", name);
        f.set("description", description);
        f.set("tags", tags);
        self.state.workflows.feature_files.set(exported_name, f.raw());
    }
}
