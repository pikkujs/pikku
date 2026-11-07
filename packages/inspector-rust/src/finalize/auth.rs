//! Port of Go `finalize/auth.go`: annotateHttpRouteAuth
//! (annotate-http-route-auth.ts), validateExposedFunctionsGated
//! (validate-exposed-functions-gated.ts) and validateTagsResolveToMiddleware
//! (validate-tags-resolve-to-middleware.ts).

use std::collections::HashSet;

use super::addons::addon_decls;
use crate::diag::{codes, Level, Logger};
use crate::state::{FunctionMeta, State};

/// resolve-function-meta.ts: local meta first, then addonFunctions[namespace][name].
fn resolve_function_meta<'a>(st: &'a State, id: &str) -> Option<&'a FunctionMeta> {
    if let Some(m) = st.functions.meta.get(id) {
        return Some(m);
    }
    let sep = id.find(':')?;
    st.addon_functions.get(&id[..sep])?.get(&id[sep + 1..])
}

/// Packages whose wireAddon demands a session.
fn packages_gated_by_their_addon(st: &State) -> HashSet<String> {
    addon_decls(st).iter().filter(|e| !e.pkg().is_empty() && e.gated()).map(|e| e.pkg()).collect()
}

pub fn annotate_http_route_auth(st: &mut State) {
    let gated = packages_gated_by_their_addon(st);
    let mut results: Vec<(String, String, bool)> = Vec::new();
    for (method, routes) in st.http.meta.iter() {
        for (route_key, route) in routes.iter() {
            let meta = resolve_function_meta(st, &route.pikku_func_id);
            let requires = meta.is_some_and(|m| m.sessionless == Some(false) || m.auth == Some(true) || !m.scopes.is_empty())
                || route.auth == Some(true)
                || (!route.package_name.is_empty() && gated.contains(&route.package_name));
            results.push((method.to_string(), route_key.to_string(), requires));
        }
    }
    for (method, route_key, requires) in results {
        if let Some(r) = st.http.meta.get_mut(&method).and_then(|routes| routes.get_mut(&route_key)) {
            r.requires_session = Some(requires);
        }
    }
}

/// validate-exposed-functions-gated.ts gatesItself.
fn gates_itself(m: &FunctionMeta) -> bool {
    m.sessionless == Some(false)
        || m.scenario_step == Some(true)
        || m.permissions_in_body == Some(true)
        || m.auth.is_some()
        || !m.scopes.is_empty()
        || !m.permissions.is_empty()
}

pub fn validate_exposed_functions_gated(log: &mut Logger, st: &State, is_addon: bool) {
    let mut ungated: Vec<String> = Vec::new();
    if !is_addon {
        for (name, meta) in st.functions.meta.iter() {
            if meta.expose != Some(true) || gates_itself(meta) {
                continue;
            }
            ungated.push(name.to_string());
        }
    }
    for e in addon_decls(st) {
        let expose = e.v.get("expose");
        let expose_all = matches!(expose, super::jsval::V::Bool(true));
        if (!expose_all && !expose.is_arr()) || matches!(e.v.get("auth"), super::jsval::V::Bool(true)) || !e.v.get("scopes").items().is_empty() {
            continue;
        }
        let fns = st.addon_functions.get(&e.namespace);
        let selected: Vec<String> = if expose_all {
            fns.map(|f| f.keys().iter().map(|k| k.to_string()).collect()).unwrap_or_default()
        } else {
            expose.items().iter().filter_map(|x| x.as_str().map(String::from)).collect()
        };
        for f in selected {
            let meta = fns.and_then(|m| m.get(&f));
            let Some(meta) = meta else { continue };
            if meta.expose != Some(true) || gates_itself(meta) {
                continue;
            }
            ungated.push(format!("{}:{f}", e.namespace));
        }
    }
    if ungated.is_empty() {
        return;
    }
    let shown = &ungated[..ungated.len().min(10)];
    let rest = ungated.len() - shown.len();
    let one = ungated.len() == 1;
    let pick = |single: &'static str, many: &'static str| if one { single } else { many };
    let more = if rest > 0 { format!(", and {rest} more") } else { String::new() };
    log.diagnostic(
        Level::Warn,
        codes::EXPOSED_FUNCTION_HAS_NO_GATE,
        format!(
            "{} exposed sessionless function{} carr{} no permission and no addon gate, so {} reachable by anyone through POST /rpc/:rpcName: {}{more}. Add permissions to the function, set `auth: true` if a session is required after all, gate the whole addon with wireAddon({{ auth: true }}), drop `expose: true` if {} not meant to be callable from outside, or set `auth: false` to declare {} public on purpose.",
            ungated.len(),
            pick("", "s"),
            pick("ies", "y"),
            pick("it is", "they are"),
            shown.join(", "),
            pick("it was", "they were"),
            pick("it", "them"),
        ),
    );
}

pub fn validate_tags_resolve_to_middleware(log: &mut Logger, st: &State) {
    let mut registered: HashSet<String> = HashSet::new();
    registered.extend(st.middleware.tag_middleware.keys().map(String::from));
    registered.extend(st.channel_middleware.tag_middleware.keys().map(String::from));
    for e in addon_decls(st) {
        for tag in e.tags() {
            if registered.contains(&tag) {
                continue;
            }
            log.diagnostic(
                Level::Warn,
                codes::TAG_RESOLVES_TO_NO_MIDDLEWARE,
                format!(
                    "wireAddon('{}') declares tag '{tag}', but no addTagMiddleware('{tag}', \u{2026}) registers anything for it. The tag resolves to an empty middleware list, so it applies no gate to the addon at all. Register middleware for it, or drop the tag if it is only meant to group and document.",
                    e.namespace
                ),
            );
        }
    }
}
