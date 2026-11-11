//! Port of Go `visit/group_define_contributors.go`: add/add-define-contributors.ts.

use serde_json::{Map, Value};
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::util_shared::literal_key_name;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::Raw;
use crate::tsutil::{self, file_name_of, node_text};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addDefineContributors",
        phase: Phase::Setup,
        order: order::ADD_DEFINE_CONTRIBUTORS,
        visit: |c, n| c.add_define_contributors(n),
    });
}

const CONTRIBUTOR_VARIANTS: [&str; 2] = ["dev", "deploy"];

impl Context<'_> {
    /// The module and export a host imports a contributor variant by, or the
    /// reason it has none.
    fn resolve_contributor_variant(&mut self, value: P<Node>) -> Result<(String, String), String> {
        if !ast::is_identifier(value) {
            return Err(format!("must be a reference to an exported const so a host can import just that variant, got: {}", node_text(value)));
        }
        let s = self.symbol_at(value);
        let sym = self.resolve_alias(s);
        let decl = sym.and_then(|s| s.value_declaration().or_else(|| tsutil::first_decl(Some(s))));
        let Some(decl) = decl.filter(|d| ast::is_variable_declaration(*d) && ast::is_identifier(d.name().unwrap())) else {
            return Err(format!("'{}' does not resolve to a const declaration", value.text()));
        };
        let file = file_name_of(decl);
        let Some(exported) = self.module_exported_name(decl, decl.name().unwrap()) else {
            return Err(format!("'{}' is not exported by {file}", value.text()));
        };
        Ok((file.to_string(), exported))
    }

    pub fn add_define_contributors(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !self.calls_imported_definer(node.expression().unwrap(), "defineContributors") {
            return;
        }
        let args = node.arguments();
        if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
            let mut msg = "defineContributors must be called with an object literal keyed by contributor name".to_string();
            if !args.is_empty() {
                msg += &format!(", got: {}", node_text(args[0]));
            }
            self.log.critical(codes::CONTRIBUTORS_NOT_STATIC, msg);
            return;
        }

        for p in args[0].properties() {
            let p = *p;
            let name = if ast::is_property_assignment(p) { literal_key_name(p.name()) } else { None };
            let name = match name {
                Some(n) if !n.is_empty() => n,
                _ => {
                    self.log.critical(
                        codes::CONTRIBUTORS_NOT_STATIC,
                        format!("defineContributors takes {{ name: {{ dev?, deploy? }} }} entries, got: {}", node_text(p)),
                    );
                    continue;
                }
            };
            let init = p.initializer().unwrap();
            if !ast::is_object_literal_expression(init) {
                self.log.critical(
                    codes::CONTRIBUTORS_NOT_STATIC,
                    format!("Contributor '{name}' must be an object literal with dev and/or deploy, got: {}", node_text(init)),
                );
                continue;
            }

            let mut variants = Map::new();
            let mut valid = true;
            for v in init.properties() {
                let v = *v;
                let key = if ast::is_property_assignment(v) { literal_key_name(v.name()) } else { None };
                let key = match key {
                    Some(k) if CONTRIBUTOR_VARIANTS.contains(&k.as_str()) => k,
                    _ => {
                        self.log.critical(
                            codes::CONTRIBUTORS_NOT_STATIC,
                            format!("Contributor '{name}' takes only dev and deploy, got: {}", node_text(v)),
                        );
                        valid = false;
                        continue;
                    }
                };
                match self.resolve_contributor_variant(v.initializer().unwrap()) {
                    Err(problem) => {
                        self.log.critical(codes::CONTRIBUTORS_NOT_STATIC, format!("Contributor '{name}' {key} {problem}"));
                        valid = false;
                    }
                    Ok((module, export)) => {
                        let mut r = Map::new();
                        r.insert("module".into(), Value::from(module));
                        r.insert("export".into(), Value::from(export));
                        variants.insert(key, Value::Object(r));
                    }
                }
            }
            if !valid {
                continue;
            }
            if !variants.contains_key("dev") && !variants.contains_key("deploy") {
                self.log.critical(codes::CONTRIBUTORS_NOT_STATIC, format!("Contributor '{name}' declares neither dev nor deploy"));
                continue;
            }

            let mut manifest = match self.state.contributors_manifest.value() {
                Some(Value::Object(m)) => m.clone(),
                _ => Map::new(),
            };
            if manifest.contains_key(&name) {
                self.log.critical(
                    codes::CONTRIBUTOR_NAME_DUPLICATED,
                    format!("Contributor '{name}' is defined twice. A contributor name belongs to one defineContributors entry."),
                );
                continue;
            }
            self.log.debug(format!("\u{2022} Found defineContributors: {name}"));
            manifest.insert(name, Value::Object(variants));
            self.state.contributors_manifest = Raw::of(Value::Object(manifest));
        }
    }
}
