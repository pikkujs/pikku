//! Port of Go `visit/group_keyed.go`: add-keyed-wiring.ts (defineSecret,
//! defineVariable) and add-credential.ts.

use regex::Regex;
use serde_json::Value;
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::group_scope::or_undefined;
use super::util_schema::symbol_decl;
use super::util_shared::{JsObject, definition_call, strs_value};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::{Record, SchemaRef};
use crate::tsutil::{self, file_name_of, source_file_of};

/// add-keyed-wiring.ts `KeyedWiringConfig`; the target is where it records.
#[derive(Clone, Copy)]
struct KeyedWiring {
    function_name: &'static str,
    id_field: &'static str,
    label: &'static str,
    schema_prefix: &'static str,
    flag_field: &'static str,
    secrets: bool,
}

const SECRET_WIRING: KeyedWiring = KeyedWiring {
    function_name: "defineSecret",
    id_field: "secretId",
    label: "Secret",
    schema_prefix: "SecretSchema",
    flag_field: "optional",
    secrets: true,
};
const VARIABLE_WIRING: KeyedWiring = KeyedWiring {
    function_name: "defineVariable",
    id_field: "variableId",
    label: "Variable",
    schema_prefix: "VariableSchema",
    flag_field: "optional",
    secrets: false,
};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addSecret",
        phase: Phase::Routes,
        order: order::ADD_SECRET,
        visit: |c, n| c.visit_keyed_wiring(n, SECRET_WIRING),
    });
    r.register(Visitor {
        name: "addCredential",
        phase: Phase::Routes,
        order: order::ADD_CREDENTIAL,
        visit: |c, n| c.visit_credential(n),
    });
    r.register(Visitor {
        name: "addVariable",
        phase: Phase::Routes,
        order: order::ADD_VARIABLE,
        visit: |c, n| c.visit_keyed_wiring(n, VARIABLE_WIRING),
    });
}

fn duration_re() -> Regex {
    Regex::new(r"^([0-9]+)(ms|milliseconds?|s|sec|seconds?|m|min|minutes?|h|hour|hours?|d|day|days?|w|week|weeks?|y|year|years?)$")
        .unwrap()
}

impl Context<'_> {
    /// `schemaProperty` finds `schema: <identifier>` and the file declaring it
    /// (through an import); the file is "" when it cannot be resolved.
    fn schema_property(&mut self, obj: P<Node>) -> (Option<P<Node>>, String) {
        for p in obj.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == "schema") {
                continue;
            }
            let init = p.initializer().unwrap();
            if !ast::is_identifier(init) {
                return (None, String::new());
            }
            let Some(sym) = self.symbol_at(init) else { return (Some(init), String::new()) };
            let mut decl = symbol_decl(sym);
            if decl.is_some_and(ast::is_import_specifier) {
                let aliased = self.checker.get_aliased_symbol(sym);
                decl = symbol_decl(aliased);
            }
            let Some(decl) = decl else { return (Some(init), String::new()) };
            return (Some(init), source_file_of(decl).file_name().to_string());
        }
        (None, String::new())
    }

    /// `visitKeyedWiring` ports createAddKeyedWiring.
    fn visit_keyed_wiring(&mut self, node: P<Node>, cfg: KeyedWiring) {
        let Some(obj) = definition_call(node, cfg.function_name) else { return };
        self.assert_string_literal_property(obj, "name", cfg.label);
        self.assert_string_literal_property(obj, cfg.id_field, cfg.label);

        let name = tsutil::get_property_value(obj, "name");
        let display_name = tsutil::get_property_value(obj, "displayName");
        let description = tsutil::get_property_value(obj, "description");
        let rotation = tsutil::get_property_value(obj, "rotationPeriod");
        let docs_url = tsutil::get_property_value(obj, "docsUrl");
        let allowed_hosts = tsutil::get_array_property_value(obj, "allowedHosts");
        let id = tsutil::get_property_value(obj, cfg.id_field);
        let flag = tsutil::get_property_value(obj, cfg.flag_field);
        let (schema_ident, schema_file) = self.schema_property(obj);

        let name_value = name.as_string();
        let label = cfg.label;
        if !name.truthy() {
            self.log.critical(codes::MISSING_NAME, format!("{label} is missing the required 'name' property."));
            return;
        }
        if !display_name.truthy() {
            self.log.critical(codes::MISSING_NAME, format!("{label} '{name_value}' is missing the required 'displayName' property."));
            return;
        }
        if !id.truthy() {
            self.log.critical(codes::MISSING_NAME, format!("{label} '{name_value}' is missing the required '{}' property.", cfg.id_field));
            return;
        }
        let Some(schema_ident) = schema_ident.filter(|_| !schema_file.is_empty()) else {
            self.log.critical(codes::MISSING_NAME, format!("{label} '{name_value}' is missing the required 'schema' property or schema is not a variable reference."));
            return;
        };
        if rotation.truthy() && !duration_re().is_match(&rotation.as_string()) {
            self.log.critical(codes::INVALID_VALUE, format!("{label} '{name_value}' has an invalid 'rotationPeriod': '{}'. Use a duration like '1d', '30day', or '1w'.", rotation.as_string()));
            return;
        }

        let source_file = file_name_of(node).to_string();
        if cfg.secrets {
            self.state.secrets.files.add(source_file.clone());
        } else {
            self.state.variables.files.add(source_file.clone());
        }

        let vendor = self.detect_schema_vendor_or_error(schema_ident, &format!("{label} '{name_value}'"), &schema_file);
        if vendor.is_empty() {
            return;
        }
        let lookup_name = format!("{}_{}", cfg.schema_prefix, name_value);
        self.state.schema_lookup.set(
            lookup_name.clone(),
            SchemaRef { variable_name: schema_ident.text().to_string(), source_file: schema_file, vendor },
        );

        let mut o = JsObject::new();
        o.set("name", or_undefined(&name));
        o.set("displayName", or_undefined(&display_name));
        o.set("description", or_undefined(&description));
        o.set("rotationPeriod", or_undefined(&rotation));
        o.set("docsUrl", or_undefined(&docs_url));
        if let Some(h) = &allowed_hosts {
            o.set("allowedHosts", Some(strs_value(h)));
        }
        o.set(cfg.id_field, or_undefined(&id));
        if flag.bool == Some(true) {
            o.set(cfg.flag_field, Some(Value::Bool(true)));
        }
        o.set_str("schema", &lookup_name);
        o.set_str("sourceFile", &source_file);
        let defs = if cfg.secrets { &mut self.state.secrets.definitions } else { &mut self.state.variables.definitions };
        defs.push(o.raw());
    }

    /// `visitCredential` ports add-credential.ts.
    fn visit_credential(&mut self, node: P<Node>) {
        let Some(obj) = definition_call(node, "defineCredential") else { return };
        self.assert_string_literal_property(obj, "name", "Credential");
        let name = tsutil::get_property_value(obj, "name");
        let display_name = tsutil::get_property_value(obj, "displayName");
        let description = tsutil::get_property_value(obj, "description");
        let typ = tsutil::get_property_value(obj, "type");
        let docs_url = tsutil::get_property_value(obj, "docsUrl");

        let name_value = name.as_string();
        if !name.truthy() {
            self.log.critical(codes::MISSING_NAME, "Credential is missing the required 'name' property.");
            return;
        }
        if !display_name.truthy() {
            self.log.critical(codes::MISSING_NAME, format!("Credential '{name_value}' is missing the required 'displayName' property."));
            return;
        }
        let t = typ.as_string();
        if t != "singleton" && t != "wire" {
            self.log.critical(codes::MISSING_NAME, format!("Credential '{name_value}' is missing or has invalid 'type' property. Must be 'singleton' or 'wire'."));
            return;
        }
        let (schema_ident, schema_file) = self.schema_property(obj);

        let mut oauth2: Option<Value> = None;
        if let Some(p) = tsutil::find_property_assignment(obj, "oauth2") {
            let o2 = p.initializer().unwrap();
            if ast::is_object_literal_expression(o2) {
                let app_secret = tsutil::get_property_value(o2, "appCredentialSecretId");
                let auth_url = tsutil::get_property_value(o2, "authorizationUrl");
                let token_url = tsutil::get_property_value(o2, "tokenUrl");
                let scopes = tsutil::get_array_property_value(o2, "scopes");
                if app_secret.truthy() && auth_url.truthy() && token_url.truthy() && scopes.is_some() {
                    let mut o = JsObject::new();
                    o.set("appCredentialSecretId", or_undefined(&app_secret));
                    o.set("tokenSecretId", or_undefined(&tsutil::get_property_value(o2, "tokenSecretId")));
                    o.set("authorizationUrl", or_undefined(&auth_url));
                    o.set("tokenUrl", or_undefined(&token_url));
                    o.set("scopes", Some(strs_value(&scopes.unwrap())));
                    o.set("scopeSeparator", or_undefined(&tsutil::get_property_value(o2, "scopeSeparator")));
                    o.set("pkce", or_undefined(&tsutil::get_property_value(o2, "pkce")));
                    if let Some(rec) = record_property_value(o2, "additionalParams") {
                        o.set("additionalParams", Some(serde_json::to_value(&rec).expect("record serialises")));
                    }
                    oauth2 = Some(o.into_value());
                }
            }
        }

        let source_file = file_name_of(node).to_string();
        self.state.credentials.files.add(source_file.clone());

        let mut lookup_name: Option<String> = None;
        if let Some(ident) = schema_ident.filter(|_| !schema_file.is_empty()) {
            let vendor = self.detect_schema_vendor_or_error(ident, &format!("Credential '{name_value}'"), &schema_file);
            if !vendor.is_empty() {
                let n = format!("CredentialSchema_{name_value}");
                self.state.schema_lookup.set(
                    n.clone(),
                    SchemaRef { variable_name: ident.text().to_string(), source_file: schema_file, vendor },
                );
                lookup_name = Some(n);
            }
        }

        let mut o = JsObject::new();
        o.set("name", or_undefined(&name));
        o.set("displayName", or_undefined(&display_name));
        o.set("description", or_undefined(&description));
        o.set_str("type", &t);
        o.set("docsUrl", or_undefined(&docs_url));
        o.set("schema", lookup_name.map(Value::from));
        o.set("oauth2", oauth2);
        o.set_str("sourceFile", &source_file);
        self.state.credentials.definitions.push(o.raw());
    }
}

/// `recordPropertyValue` is getRecordPropertyValue: the string-valued entries
/// of an object-literal property, or `None` when there are none.
fn record_property_value(obj: P<Node>, name: &str) -> Option<Record<String>> {
    let p = tsutil::find_property_assignment(obj, name)?;
    let init = p.initializer().unwrap();
    if !ast::is_object_literal_expression(init) {
        return None;
    }
    let mut rec = Record::new();
    for prop in init.properties() {
        if !ast::is_property_assignment(*prop) {
            continue;
        }
        let key = prop.name().unwrap();
        if !ast::is_identifier(key) && !ast::is_string_literal(key) {
            continue;
        }
        let v = prop.initializer().unwrap();
        if ast::is_string_literal(v) || ast::is_no_substitution_template_literal(v) {
            rec.set(key.text().to_string(), v.text().to_string());
        }
    }
    if rec.is_empty() { None } else { Some(rec) }
}
