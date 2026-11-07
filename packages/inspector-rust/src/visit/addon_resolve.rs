//! Port of Go `visit/addon_resolve.go`: utils/addon-resolution.ts and the
//! package lookups in utils/resolve-addon-package.ts and
//! load-addon-functions-meta.ts: Node's `require.resolve` for
//! `<package>/<subpath>`, enough of it for the files an addon publishes.

use std::path::Path;

use super::addon_json::{OJson, parse_ojson};
use crate::state::State;
use crate::state::meta::FunctionMeta;

// ---- filepath helpers (Go's path/filepath on a POSIX host) ----

/// `filepath.Clean`.
pub(crate) fn clean(path: &str) -> String {
    if path.is_empty() {
        return ".".into();
    }
    let rooted = path.starts_with('/');
    let mut out: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if out.last().is_some_and(|l| *l != "..") {
                    out.pop();
                } else if !rooted {
                    out.push("..");
                }
            }
            p => out.push(p),
        }
    }
    let joined = out.join("/");
    match (rooted, joined.is_empty()) {
        (true, _) => format!("/{joined}"),
        (false, true) => ".".into(),
        (false, false) => joined,
    }
}

/// `filepath.Join`.
pub(crate) fn join(parts: &[&str]) -> String {
    let non_empty: Vec<&str> = parts.iter().copied().filter(|p| !p.is_empty()).collect();
    if non_empty.is_empty() {
        return String::new();
    }
    clean(&non_empty.join("/"))
}

/// `filepath.Dir`.
pub(crate) fn dir(path: &str) -> String {
    let i = path.rfind('/').map_or(0, |i| i + 1);
    let d = &path[..i];
    let d = clean(d);
    if d.is_empty() { ".".into() } else { d }
}

/// `filepath.Abs`.
pub(crate) fn abs(path: &str) -> String {
    if path.starts_with('/') {
        return clean(path);
    }
    let cwd = std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    join(&[&cwd, path])
}

/// `filepath.Rel(base, target)`; `None` where Go errors.
pub(crate) fn rel(base: &str, target: &str) -> Option<String> {
    let (base, target) = (clean(base), clean(target));
    if base.starts_with('/') != target.starts_with('/') {
        return None;
    }
    let b: Vec<&str> = base.split('/').filter(|s| !s.is_empty() && *s != ".").collect();
    let t: Vec<&str> = target.split('/').filter(|s| !s.is_empty() && *s != ".").collect();
    let common = b.iter().zip(&t).take_while(|(x, y)| x == y).count();
    if b[common..].contains(&"..") {
        return None;
    }
    let mut parts: Vec<&str> = vec![".."; b.len() - common];
    parts.extend(&t[common..]);
    Some(if parts.is_empty() { ".".into() } else { parts.join("/") })
}

fn is_file(p: &str) -> bool {
    std::fs::metadata(p).is_ok_and(|m| m.is_file())
}

fn exists(p: &str) -> bool {
    std::fs::metadata(p).is_ok()
}

pub(crate) fn nearest_package_dir(file: &str) -> String {
    let mut d = dir(file);
    while d != "/" && d != "." {
        if exists(&join(&[&d, "package.json"])) {
            return d;
        }
        let parent = dir(&d);
        if parent == d {
            break;
        }
        d = parent;
    }
    String::new()
}

/// The declaring package first, then the root.
pub(crate) fn addon_resolution_dirs(root_dir: &str, decl_file: &str) -> Vec<String> {
    let root = abs(root_dir);
    if !decl_file.is_empty() {
        let d = nearest_package_dir(&abs(decl_file));
        if !d.is_empty() && d != root {
            return vec![d, root];
        }
    }
    vec![root]
}

/// `createAddonResolver`: try each directory in turn. `None` stands for
/// require.resolve's MODULE_NOT_FOUND / ERR_PACKAGE_PATH_NOT_EXPORTED.
#[derive(Clone, Debug)]
pub(crate) struct AddonResolver(pub Vec<String>);

impl AddonResolver {
    pub(crate) fn resolve(&self, id: &str) -> Option<String> {
        let (pkg, sub) = split_package_specifier(id);
        self.0.iter().find_map(|d| resolve_package_subpath(d, &pkg, &sub))
    }
}

pub(crate) fn split_package_specifier(id: &str) -> (String, String) {
    let parts: Vec<&str> = id.splitn(3, '/').collect();
    if id.starts_with('@') && parts.len() >= 2 {
        let pkg = format!("{}/{}", parts[0], parts[1]);
        return (pkg, parts.get(2).copied().unwrap_or("").to_string());
    }
    match id.find('/') {
        None => (id.to_string(), String::new()),
        Some(i) => (id[..i].to_string(), id[i + 1..].to_string()),
    }
}

/// Walks node_modules up from each dir.
pub(crate) fn find_installed_package_dir(dirs: &[String], pkg: &str) -> String {
    for start in dirs {
        let mut d = start.clone();
        loop {
            let candidate = join(&[&d, "node_modules", pkg]);
            if exists(&join(&[&candidate, "package.json"])) {
                return candidate;
            }
            let parent = dir(&d);
            if parent == d {
                break;
            }
            d = parent;
        }
    }
    String::new()
}

/// The conditions createRequire's resolve matches.
const REQUIRE_CONDITIONS: [&str; 5] = ["require", "node", "node-addons", "default", "module-sync"];

/// PACKAGE_TARGET_RESOLVE for a string, a conditions object (in key order) or
/// a fallback array. Empty for a target that resolves to nothing.
fn resolve_export_target(target: Option<&OJson>, star: &str) -> String {
    match target {
        None => String::new(),
        Some(OJson::Arr(a)) => a
            .iter()
            .map(|t| resolve_export_target(Some(t), star))
            .find(|r| !r.is_empty())
            .unwrap_or_default(),
        Some(OJson::Obj(r)) => {
            for k in r.keys() {
                if REQUIRE_CONDITIONS.contains(&k) {
                    let res = resolve_export_target(r.get(k), star);
                    if !res.is_empty() {
                        return res;
                    }
                }
            }
            String::new()
        }
        Some(t) => match t.str() {
            Some(s) if s.starts_with("./") => s.replace('*', star),
            _ => String::new(),
        },
    }
}

/// Maps a "./subpath" through package.json exports: an exact key first, then
/// the pattern with the longest prefix before its "*".
fn resolve_exports(exports: &OJson, target: &str) -> String {
    let OJson::Obj(rec) = exports else {
        return if target == "." { resolve_export_target(Some(exports), "") } else { String::new() };
    };
    let keys = rec.keys();
    if !keys.is_empty() && !keys[0].starts_with('.') {
        return if target == "." { resolve_export_target(Some(exports), "") } else { String::new() };
    }
    if let Some(t) = rec.get(target)
        && !target.contains('*')
    {
        return resolve_export_target(Some(t), "");
    }
    let mut matches: Vec<(&str, String)> = Vec::new();
    for k in &keys {
        let Some(star) = k.find('*') else { continue };
        if k[star + 1..].contains('*') {
            continue;
        }
        let (prefix, suffix) = (&k[..star], &k[star + 1..]);
        if target.len() >= prefix.len() + suffix.len()
            && target.starts_with(prefix)
            && target.ends_with(suffix)
            && target != prefix
        {
            matches.push((k, target[prefix.len()..target.len() - suffix.len()].to_string()));
        }
    }
    if matches.is_empty() {
        return String::new();
    }
    matches.sort_by(|(a, _), (b, _)| {
        let (ai, bi) = (a.find('*'), b.find('*'));
        bi.cmp(&ai).then_with(|| b.len().cmp(&a.len()))
    });
    resolve_export_target(rec.get(matches[0].0), &matches[0].1)
}

#[cfg(test)]
pub(crate) fn resolve_exports_for_test(exports: &OJson, target: &str) -> String {
    resolve_exports(exports, target)
}

/// Finds node_modules/<pkg> walking up from dir, maps the subpath through its
/// exports (or uses it as-is when there are none), and returns the realpath of
/// an existing file.
pub(crate) fn resolve_package_subpath(from: &str, pkg: &str, subpath: &str) -> Option<String> {
    let mut d = from.to_string();
    loop {
        let pkg_dir = join(&[&d, "node_modules", pkg]);
        if let Ok(raw) = std::fs::read(join(&[&pkg_dir, "package.json"])) {
            let mut target = if subpath.is_empty() { ".".to_string() } else { format!("./{subpath}") };
            let pj = parse_ojson(&raw).ok();
            if let Some(exports) = pj.as_ref().and_then(|p| p.get("exports"))
                && (exports.is_js_object() || !matches!(exports, OJson::Null))
            {
                let mapped = resolve_exports(exports, &target);
                if mapped.is_empty() {
                    return None;
                }
                target = mapped;
            }
            let p = join(&[&pkg_dir, &target]);
            if is_file(&p) {
                return Some(std::fs::canonicalize(&p).map_or(p, |r| r.to_string_lossy().into_owned()));
            }
            return None;
        }
        let parent = dir(&d);
        if parent == d {
            return None;
        }
        d = parent;
    }
}

pub(crate) fn find_package_name_for_file(file: &str) -> String {
    let d = nearest_package_dir(file);
    if d.is_empty() {
        return String::new();
    }
    let Ok(raw) = std::fs::read(Path::new(&d).join("package.json")) else { return String::new() };
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(&raw) else { return String::new() };
    v.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string()
}

/// utils/resolve-function-meta.ts.
pub fn resolve_function_meta<'a>(state: &'a State, id: &str) -> Option<&'a FunctionMeta> {
    if let Some(m) = state.functions.meta.get(id) {
        return Some(m);
    }
    let i = id.find(':')?;
    state.addon_functions.get(&id[..i])?.get(&id[i + 1..])
}

/// `ResolveAddonFile`: require.resolve(id) the way loadAddonSchemas does it for
/// an addon declared in `decl_file`: from the declaring package, then the root.
/// Empty when nothing resolves.
pub fn resolve_addon_file(root_dir: &str, decl_file: &str, id: &str) -> String {
    AddonResolver(addon_resolution_dirs(root_dir, decl_file)).resolve(id).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_helpers_follow_go() {
        assert_eq!(clean("/a/b/../c/./d/"), "/a/c/d");
        assert_eq!(clean(""), ".");
        assert_eq!(join(&["/a", "node_modules", "@x/y"]), "/a/node_modules/@x/y");
        assert_eq!(dir("/a/b.ts"), "/a");
        assert_eq!(dir("/a"), "/");
        assert_eq!(dir("a"), ".");
        assert_eq!(rel("/a/b", "/a/b/c/d").as_deref(), Some("c/d"));
        assert_eq!(rel("/a/b", "/a/c").as_deref(), Some("../c"));
        assert_eq!(rel("/a", "/a").as_deref(), Some("."));
    }

    #[test]
    fn splits_package_specifiers() {
        assert_eq!(split_package_specifier("@s/p/.pikku/x.json"), ("@s/p".into(), ".pikku/x.json".into()));
        assert_eq!(split_package_specifier("p/.pikku/x.json"), ("p".into(), ".pikku/x.json".into()));
        assert_eq!(split_package_specifier("p"), ("p".into(), String::new()));
        assert_eq!(split_package_specifier("@s/p"), ("@s/p".into(), String::new()));
    }
}

use super::Context;
use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

impl Context<'_> {
    /// `resolveFunctionMeta` is utils/resolve-function-meta.ts.
    pub fn resolve_function_meta(&self, id: &str) -> Option<FunctionMeta> {
        resolve_function_meta(self.state, id).cloned()
    }

    /// The package name an addon namespace was wired to (`s.addons[ns].pkg` in
    /// Go; filled by `wireAddon`).
    pub fn addon_package(&self, namespace: &str) -> Option<String> {
        let raw = self.state.rpc.wire_addon_declarations.get(namespace)?;
        super::addon_load::AddonDecl::from_declaration(raw).map(|d| d.pkg)
    }

    /// `resolveAddonName` is utils/resolve-addon-package.ts: the package a
    /// function identifier was imported from, when it is a wired addon's.
    pub fn resolve_addon_name(&mut self, ident: P<Node>) -> String {
        let addons = super::addon_load::declared_addons(self.state);
        if addons.is_empty() {
            return String::new();
        }
        let Some(decl) = self.symbol_at(ident).and_then(|s| s.declarations().first().copied()) else {
            return String::new();
        };
        if decl.kind() == Kind::ImportSpecifier
            && let Some(imp) = decl.parent().and_then(|p| p.parent()).and_then(|p| p.parent())
            && imp.kind() == Kind::ImportDeclaration
            && let Some(spec) = imp.module_specifier()
            && ast::is_string_literal(spec)
            && !spec.text().starts_with('.')
        {
            let c = spec.text();
            for (_, a) in &addons {
                let p = &a.pkg;
                if p == c || c.starts_with(&format!("{p}/")) {
                    return p.clone();
                }
            }
        }
        let name = find_package_name_for_file(crate::tsutil::file_name_of(decl));
        if !name.is_empty() {
            for (_, a) in &addons {
                if a.pkg == name {
                    return name;
                }
            }
        }
        String::new()
    }
}
