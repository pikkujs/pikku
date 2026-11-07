//! Port of Go `visit/group_virtual_users.go`: add/add-virtual-users.ts.

use serde_json::{Map, Value};
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::util_shared::{literal_key_name, strs_value};
use super::util_wire_meta::num_value;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::{Logger, codes};
use crate::state::Set;
use crate::tsutil::{self, file_name_of};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addVirtualUsers", phase: Phase::Routes, order: order::ADD_VIRTUAL_USERS, visit: |c, n| c.add_virtual_users(n) });
}

/// `Object.keys(DISPOSITIONS)` from @pikku/core/virtual-user
/// (virtual-user-dispositions.ts), in its order.
const VIRTUAL_USER_DISPOSITIONS: [&str; 7] = ["realistic", "careless", "newcomer", "stale", "auditor", "adversarial", "accountable"];

const VIRTUAL_USER_RATES: [(&str, f64, f64); 3] = [("temperature", 0.0, 2.0), ("repeatRate", 0.0, 1.0), ("reReadRate", 0.0, 1.0)];

/// utils/single-declaration.ts `claimSingleDeclaration`.
pub fn claim_single_declaration(files: &mut Set, log: &mut Logger, code: &'static str, helper: &str, source_file: &str) -> bool {
    if source_file.ends_with(".gen.ts") {
        return true;
    }
    if files.is_empty() {
        files.add(source_file);
        return true;
    }
    let first = files.values().next().unwrap().to_string();
    let mut msg = format!(
        "Only one {helper}(...) is allowed per codebase, so there is one place to read the declarations from and one place to add to. "
    );
    if first == source_file {
        msg += &format!("Found a second call in {source_file}. Declare them all in one call.");
    } else {
        msg += &format!("Found a second in {source_file} (first: {first}). Declare them all in one call.");
    }
    log.critical(code, msg);
    false
}

/// `tuningProperty`; `None` when nothing was read.
fn virtual_user_tuning(config: P<Node>, on_error: &mut dyn FnMut(String)) -> Option<Map<String, Value>> {
    let value = tsutil::literal_property(config, "tuning")?;
    if !ast::is_object_literal_expression(value) {
        return None;
    }
    let mut tuning = Map::new();

    if let Some(moves_value) = tsutil::literal_property(value, "moves") {
        if ast::is_object_literal_expression(moves_value) {
            let mut moves = Map::new();
            for mv in ["continue", "suspend", "resume", "abandon"] {
                let Some(weight) = tsutil::literal_number(moves_value, mv) else { continue };
                if weight < 0.0 {
                    on_error(format!("tuning.moves.{mv} must not be negative (got {}).", tsutil::js_number_string(weight)));
                    continue;
                }
                moves.insert(mv.to_string(), num_value(weight));
            }
            if !moves.is_empty() {
                tuning.insert("moves".into(), Value::Object(moves));
            }
        }
    }

    for (name, min, max) in VIRTUAL_USER_RATES {
        let Some(rate) = tsutil::literal_number(value, name) else { continue };
        if rate < min || rate > max {
            on_error(format!(
                "tuning.{name} must be between {} and {} (got {}).",
                tsutil::js_number_string(min),
                tsutil::js_number_string(max),
                tsutil::js_number_string(rate)
            ));
            continue;
        }
        tuning.insert(name.into(), num_value(rate));
    }

    for flag in ["emptyMemory", "readOnly", "invertedOracle"] {
        if let Some(v) = tsutil::literal_bool(value, flag) {
            tuning.insert(flag.into(), Value::Bool(v));
        }
    }
    if let Some(v) = tsutil::literal_string(value, "instructions") {
        tuning.insert("instructions".into(), Value::from(v));
    }
    if tuning.is_empty() { None } else { Some(tuning) }
}

/// `accountProperty`: `None` when `value` is not an object literal, `{}` or
/// `{ provider }` otherwise.
fn virtual_user_account(value: Option<P<Node>>) -> Option<Map<String, Value>> {
    let value = value?;
    if !ast::is_object_literal_expression(value) {
        return None;
    }
    let mut account = Map::new();
    if let Some(provider) = tsutil::literal_string(value, "provider") {
        account.insert("provider".into(), Value::from(provider));
    }
    Some(account)
}

fn literal_strings_or(config: P<Node>, name: &str) -> Vec<String> {
    tsutil::literal_string_array(config, name).unwrap_or_default()
}

impl Context<'_> {
    fn virtual_user_linked_accounts(&mut self, config: P<Node>, id: &str) -> Option<Map<String, Value>> {
        let value = tsutil::literal_property(config, "linkedAccounts")?;
        if !ast::is_object_literal_expression(value) {
            return None;
        }
        let mut accounts = Map::new();
        for prop in value.properties() {
            if !ast::is_property_assignment(*prop) {
                continue;
            }
            let Some(key) = literal_key_name(prop.name()) else {
                self.log.critical(codes::NON_LITERAL_WIRE_NAME, format!("VirtualUser '{id}' has a linked account whose key is not a literal."));
                continue;
            };
            let Some(account) = virtual_user_account(prop.initializer()) else {
                self.log.critical(codes::INVALID_VALUE, format!("VirtualUser '{id}' linked account '{key}' must be an object literal."));
                continue;
            };
            accounts.insert(key, Value::Object(account));
        }
        if accounts.is_empty() { None } else { Some(accounts) }
    }

    pub fn add_virtual_users(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) {
            return;
        }
        let expr = node.expression().unwrap();
        if !ast::is_identifier(expr) || expr.text() != "defineVirtualUsers" {
            return;
        }
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let obj = tsutil::unwrap_as(args[0]);
        if !ast::is_object_literal_expression(obj) {
            self.log.critical(
                codes::INVALID_VALUE,
                "defineVirtualUsers() needs an inline object \u{2014} virtual users are read statically, never evaluated.",
            );
            return;
        }
        let source_file = file_name_of(node).to_string();
        if !claim_single_declaration(
            &mut self.state.virtual_users.files,
            self.log,
            codes::DUPLICATE_VIRTUAL_USERS_DEFINITION,
            "defineVirtualUsers",
            &source_file,
        ) {
            return;
        }

        for prop in obj.properties() {
            let prop = *prop;
            if !ast::is_property_assignment(prop) {
                continue;
            }
            let Some(id) = literal_key_name(prop.name()) else {
                self.log.critical(codes::NON_LITERAL_WIRE_NAME, "A virtual user is declared with a key that is not a literal.");
                continue;
            };
            let config = prop.initializer().unwrap();
            if !ast::is_object_literal_expression(config) {
                self.log.critical(codes::INVALID_VALUE, format!("VirtualUser '{id}' must be an object literal."));
                continue;
            }
            let name = tsutil::literal_string(config, "name").unwrap_or_default();
            if name.is_empty() {
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!("VirtualUser '{id}' needs a literal 'name' \u{2014} a virtual user is a person, and the console has nothing to show without one."),
                );
                continue;
            }
            let disposition = tsutil::literal_string(config, "disposition");
            if let Some(d) = &disposition {
                if !VIRTUAL_USER_DISPOSITIONS.contains(&d.as_str()) {
                    self.log.critical(
                        codes::INVALID_VALUE,
                        format!("VirtualUser '{id}' has an unknown disposition '{d}'. One of: {}", VIRTUAL_USER_DISPOSITIONS.join(", ")),
                    );
                    continue;
                }
            }

            let mut tuning_failed = false;
            let mut tuning_errors: Vec<String> = Vec::new();
            let tuning = virtual_user_tuning(config, &mut |m| {
                tuning_failed = true;
                tuning_errors.push(m);
            });
            for m in tuning_errors {
                self.log.critical(codes::INVALID_VALUE, format!("VirtualUser '{id}': {m}"));
            }
            if tuning_failed {
                continue;
            }

            let account = virtual_user_account(tsutil::literal_property(config, "account"));
            let declared_runnable = tsutil::literal_bool(config, "runnable");
            // isRunnableVirtualUser: an explicit `runnable: false` wins, and a
            // provider login cannot be driven.
            let mut runnable = declared_runnable != Some(false);
            if runnable && account.as_ref().is_some_and(|a| a.contains_key("provider")) {
                runnable = false;
            }

            let mut vu = Map::new();
            vu.insert("id".into(), Value::from(id.as_str()));
            vu.insert("name".into(), Value::from(name));
            vu.insert("roles".into(), strs_value(&literal_strings_or(config, "roles")));
            vu.insert("goals".into(), strs_value(&literal_strings_or(config, "goals")));
            vu.insert("tags".into(), strs_value(&literal_strings_or(config, "tags")));
            vu.insert("runnable".into(), Value::Bool(runnable));
            vu.insert("sourceFile".into(), Value::from(source_file.as_str()));
            for field in ["jobTitle", "description", "avatarUrl", "personality", "app"] {
                if let Some(v) = tsutil::literal_string(config, field) {
                    vu.insert(field.into(), Value::from(v));
                }
            }
            if let Some(d) = disposition {
                vu.insert("disposition".into(), Value::from(d));
            }
            if let Some(t) = tuning {
                vu.insert("tuning".into(), Value::Object(t));
            }
            if let Some(v) = tsutil::literal_string_array(config, "fixtures") {
                vu.insert("fixtures".into(), strs_value(&v));
            }
            if let Some(v) = tsutil::literal_string_array(config, "environments") {
                vu.insert("environments".into(), strs_value(&v));
            }
            if let Some(a) = account {
                vu.insert("account".into(), Value::Object(a));
            }
            if let Some(l) = self.virtual_user_linked_accounts(config, &id) {
                vu.insert("linkedAccounts".into(), Value::Object(l));
            }
            self.state.virtual_users.definitions.push(crate::state::Raw::of(Value::Object(vu)));
        }
    }
}
