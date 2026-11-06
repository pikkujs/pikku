//! Port of the `require.resolve` subset in Go `visit/addon_resolve.go`
//! (`ResolveAddonFile`): `<package>/<subpath>` through node_modules and the
//! package's `exports` map, enough for the files an addon publishes.

use serde_json::Value;

use super::addons::addon_resolution_dirs;
use super::utils::{clean, dir_of, file_exists, path_join};

fn split_package_specifier(id: &str) -> (String, String) {
    let parts: Vec<&str> = id.splitn(3, '/').collect();
    if id.starts_with('@') && parts.len() >= 2 {
        let pkg = format!("{}/{}", parts[0], parts[1]);
        let sub = if parts.len() == 3 { parts[2].to_string() } else { String::new() };
        return (pkg, sub);
    }
    match id.find('/') {
        None => (id.to_string(), String::new()),
        Some(i) => (id[..i].to_string(), id[i + 1..].to_string()),
    }
}

fn require_condition(k: &str) -> bool {
    matches!(k, "require" | "node" | "node-addons" | "default" | "module-sync")
}

/// PACKAGE_TARGET_RESOLVE for a string, a conditions object (in key order) or
/// a fallback array; `""` for a target that resolves to nothing.
fn resolve_export_target(target: Option<&Value>, star: &str) -> String {
    match target {
        None => String::new(),
        Some(Value::Array(a)) => {
            for t in a {
                let r = resolve_export_target(Some(t), star);
                if !r.is_empty() {
                    return r;
                }
            }
            String::new()
        }
        Some(Value::Object(o)) => {
            for (k, v) in o {
                if require_condition(k) {
                    let r = resolve_export_target(Some(v), star);
                    if !r.is_empty() {
                        return r;
                    }
                }
            }
            String::new()
        }
        Some(Value::String(s)) if s.starts_with("./") => s.replace('*', star),
        _ => String::new(),
    }
}

/// Maps a "./subpath" through package.json exports: an exact key first, then
/// the pattern with the longest prefix before its "*".
fn resolve_exports(exports: &Value, target: &str) -> String {
    let Value::Object(map) = exports else {
        return if target == "." { resolve_export_target(Some(exports), "") } else { String::new() };
    };
    if map.keys().next().is_some_and(|k| !k.starts_with('.')) {
        return if target == "." { resolve_export_target(Some(exports), "") } else { String::new() };
    }
    if let Some(t) = map.get(target) {
        if !target.contains('*') {
            return resolve_export_target(Some(t), "");
        }
    }
    let mut matches: Vec<(&String, String)> = Vec::new();
    for k in map.keys() {
        let Some(star) = k.find('*') else { continue };
        if k[star + 1..].contains('*') {
            continue;
        }
        let (prefix, suffix) = (&k[..star], &k[star + 1..]);
        if target.len() >= prefix.len() + suffix.len() && target.starts_with(prefix) && target.ends_with(suffix) && target != prefix {
            matches.push((k, target[prefix.len()..target.len() - suffix.len()].to_string()));
        }
    }
    if matches.is_empty() {
        return String::new();
    }
    matches.sort_by(|(a, _), (b, _)| {
        let (ai, bi) = (a.find('*').unwrap(), b.find('*').unwrap());
        if ai != bi { bi.cmp(&ai) } else { b.len().cmp(&a.len()) }
    });
    resolve_export_target(map.get(matches[0].0), &matches[0].1)
}

/// Finds node_modules/<pkg> walking up from dir, maps the subpath through its
/// exports (or uses it as-is when there are none), and returns the realpath of
/// an existing file, or `""`.
fn resolve_package_subpath(dir: &str, pkg: &str, subpath: &str) -> String {
    let mut d = clean(dir);
    loop {
        let pkg_dir = path_join(&[&d, "node_modules", pkg]);
        if let Ok(raw) = std::fs::read(path_join(&[&pkg_dir, "package.json"])) {
            let mut target = if subpath.is_empty() { ".".to_string() } else { format!("./{subpath}") };
            let pj: Option<Value> = serde_json::from_slice(&raw).ok();
            if let Some(exports) = pj.as_ref().and_then(|p| p.get("exports")).filter(|e| !e.is_null()) {
                let mapped = resolve_exports(exports, &target);
                if mapped.is_empty() {
                    return String::new();
                }
                target = mapped;
            }
            let p = path_join(&[&pkg_dir, &target]);
            if file_exists(&p) {
                return std::fs::canonicalize(&p).map(|r| r.to_string_lossy().to_string()).unwrap_or(p);
            }
            return String::new();
        }
        let parent = dir_of(&d);
        if parent == d {
            return String::new();
        }
        d = parent;
    }
}

/// `require.resolve(id)` for an addon declared in `decl_file`: from the
/// declaring package, then the root. `""` when nothing resolves.
pub fn resolve_addon_file(root_dir: &str, decl_file: Option<&str>, id: &str) -> String {
    let (pkg, sub) = split_package_specifier(id);
    for dir in addon_resolution_dirs(root_dir, decl_file) {
        let p = resolve_package_subpath(&dir, &pkg, &sub);
        if !p.is_empty() {
            return p;
        }
    }
    String::new()
}
