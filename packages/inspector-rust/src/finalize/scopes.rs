//! Port of Go `finalize/scopes.go`: applyDeclaredScopes
//! (apply-declared-scopes.ts) and the scope / role validators of
//! utils/post-process.ts.

use super::addons::definition_ids;
use super::jsval::{OrderedSet, V};
use super::utils::or_none;
use super::jv;
use crate::diag::{codes, Logger};
use crate::state::{Raw, State};

/// Folds `declareScopes` ids into scopes.definitions.
pub fn apply_declared_scopes(st: &mut State) {
    let Some(declared) = st.scopes.declared.clone() else { return };
    for (id, source_file) in declared.iter() {
        let segments: Vec<&str> = id.split(':').collect();
        let (root_name, rest) = (segments[0], &segments[1..]);
        let idx = st.scopes.definitions.iter().position(|r| jv(r).get("name").as_str() == Some(root_name));
        let idx = match idx {
            Some(i) => i,
            None => {
                let root = V::of(vec![("name", V::str(root_name)), ("sourceFile", V::str(source_file))]);
                st.scopes.definitions.push(Raw::of(root.to_json()));
                st.scopes.definitions.len() - 1
            }
        };
        let def = jv(&st.scopes.definitions[idx]);
        let updated = ensure_scope_path(&def, rest);
        st.scopes.definitions[idx] = Raw::of(updated.to_json());
    }
}

/// `level.scopes ??= {}; level = level.scopes[segment] ??= {}` down the
/// segments, on a Raw node.
fn ensure_scope_path(node: &V, segments: &[&str]) -> V {
    if segments.is_empty() {
        return node.clone();
    }
    let o = if node.is_obj() { node.clone() } else { V::obj() };
    let mut scopes_raw = o.get("scopes");
    if !scopes_raw.truthy() {
        scopes_raw = V::obj();
    }
    let scopes = if scopes_raw.is_obj() { scopes_raw } else { V::obj() };
    let mut child = scopes.get(segments[0]);
    if !child.truthy() {
        child = V::obj();
    }
    scopes.set(segments[0], ensure_scope_path(&child, &segments[1..]));
    o.set("scopes", scopes);
    o
}

/// `flattenScopeDefinitions(definitions).map((s) => s.id)`: every node,
/// depth-first, deduplicated.
fn flatten_scope_ids(definitions: &[Raw]) -> OrderedSet {
    fn walk(ids: &mut OrderedSet, nodes: &V, prefix: &str) {
        if !nodes.is_obj() {
            return;
        }
        for segment in nodes.keys() {
            let node = nodes.get(&segment);
            let id = format!("{prefix}:{segment}");
            ids.add(id.clone());
            walk(ids, &node.get("scopes"), &id);
        }
    }
    let mut ids = OrderedSet::default();
    for def in definitions {
        let d = jv(def);
        let name = d.get("name").template_string();
        ids.add(name.clone());
        walk(&mut ids, &d.get("scopes"), &name);
    }
    ids
}

fn declared_form(scope: &str) -> &str {
    scope.strip_suffix(":*").unwrap_or(scope)
}

pub fn validate_scope_references(log: &mut Logger, st: &State) {
    let declared = flatten_scope_ids(&st.scopes.definitions);
    for (func_name, meta) in st.functions.meta.iter() {
        for scope in &meta.scopes {
            if scope == "*" {
                log.critical(
                    codes::INVALID_VALUE,
                    format!("Function '{func_name}' requires the bare wildcard scope '*'. A function must require a specific scope \u{2014} '*' is only meaningful as a grant."),
                );
                continue;
            }
            if !declared.has(declared_form(scope)) {
                log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "Function '{func_name}' requires scope '{scope}' which is not declared. Declare it with defineScope. Available scopes: {}",
                        or_none(&declared.items)
                    ),
                );
            }
        }
    }
}

pub fn validate_system_role_scopes(log: &mut Logger, st: &State) {
    if st.system_roles.definitions.is_empty() {
        return;
    }
    let declared = flatten_scope_ids(&st.scopes.definitions);
    for r in &st.system_roles.definitions {
        let role = jv(r);
        let name = role.get("name").template_string();
        for scope in role.get("scopes").items().iter().filter_map(|x| x.as_str().map(String::from)) {
            if scope == "*" {
                log.critical(
                    codes::INVALID_VALUE,
                    format!("System role '{name}' grants the bare wildcard scope '*'. Grant the roots it should cover instead \u{2014} '*' hides what the role actually confers."),
                );
                continue;
            }
            if !declared.has(declared_form(&scope)) {
                log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "System role '{name}' grants scope '{scope}' which is not declared. Declare it with defineScope. Available scopes: {}",
                        or_none(&declared.items)
                    ),
                );
            }
        }
    }
}

pub fn validate_virtual_user_roles(log: &mut Logger, st: &State) {
    if st.virtual_users.definitions.is_empty() {
        return;
    }
    let declared = definition_ids(&st.system_roles.definitions, "");
    for r in &st.virtual_users.definitions {
        let vu = jv(r);
        for role in vu.get("roles").items().iter().filter_map(|x| x.as_str().map(String::from)) {
            if declared.has(&role) {
                continue;
            }
            let mut available = declared.items.clone();
            available.sort();
            log.critical(
                codes::INVALID_VALUE,
                format!(
                    "VirtualUser '{}' holds role '{role}', which is not declared with defineSystemRole. A virtual user may only name a system role \u{2014} a role composed in the console can be deleted, and the virtual user would go on claiming to test it. Declared roles: {}",
                    vu.get("id").template_string(),
                    or_none(&available)
                ),
            );
        }
    }
}
