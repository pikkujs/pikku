//! Port of Go `finalize/addons.go` and `internal/remotesdk`: the wireAddon
//! validators of utils/post-process.ts.

use std::collections::HashMap;

use super::jsval::{OrderedSet, V};
use super::utils::{abs, base_of, clean, dir_of, file_exists, or_none, path_join};
use super::jv;
use crate::diag::{codes, Logger};
use crate::state::State;

/// One wireAddonDeclarations entry, read for the fields the validators use.
pub struct Decl {
    pub namespace: String,
    pub v: V,
}

impl Decl {
    pub fn package(&self) -> Option<String> {
        self.v.get("package").as_str().map(String::from)
    }

    pub fn pkg(&self) -> String {
        self.package().unwrap_or_default()
    }

    /// `jsString(decl.Package)`.
    pub fn pkg_js(&self) -> String {
        self.package().unwrap_or_else(|| "undefined".to_string())
    }

    pub fn range(&self) -> String {
        self.v.get("range").as_str().unwrap_or("").to_string()
    }

    pub fn file(&self) -> Option<String> {
        self.v.get("file").as_str().map(String::from)
    }

    pub fn remote(&self) -> bool {
        self.v.get("remote").truthy()
    }

    /// `decl.auth === true || (decl.scopes?.length ?? 0) > 0`.
    pub fn gated(&self) -> bool {
        matches!(self.v.get("auth"), V::Bool(true)) || self.v.get("scopes").items().len() > 0
    }

    fn strings(&self, key: &str) -> Vec<String> {
        self.v.get(key).items().iter().filter_map(|x| x.as_str().map(String::from)).collect()
    }

    pub fn tags(&self) -> Vec<String> {
        self.strings("tags")
    }
}

pub fn addon_decls(st: &State) -> Vec<Decl> {
    st.rpc.wire_addon_declarations.iter().map(|(ns, r)| Decl { namespace: ns.to_string(), v: jv(r) }).collect()
}

/// `new Set(definitions.map((d) => d[key] ?? d.name))`, in insertion order.
pub fn definition_ids(defs: &[crate::state::Raw], key: &str) -> OrderedSet {
    let mut ids = OrderedSet::default();
    for r in defs {
        let d = jv(r);
        let v = if key.is_empty() || !d.has(key) || d.get(key).is_null() { d.get("name") } else { d.get(key) };
        ids.add(v.template_string());
    }
    ids
}

fn entries(v: &V) -> Vec<(String, V)> {
    if !v.is_obj() {
        return vec![];
    }
    v.keys().into_iter().map(|k| (k.clone(), v.get(&k))).collect()
}

pub fn validate_secret_overrides(log: &mut Logger, st: &State) {
    let decls = addon_decls(st);
    if decls.is_empty() {
        return;
    }
    let mut secret_ids = definition_ids(&st.secrets.definitions, "secretId");
    if st.auth.definition.is_some() {
        secret_ids.add("BETTER_AUTH_SECRET");
    }
    for e in &decls {
        let overrides = e.v.get("secretOverrides");
        for (logical, resolved) in entries(&overrides) {
            if !secret_ids.has(&resolved.template_string()) {
                log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "Secret override '{logical}' -> '{}' in addon '{}' ({}) targets a secret that does not exist. Available secrets: {}",
                        resolved.template_string(),
                        e.namespace,
                        e.pkg_js(),
                        or_none(&secret_ids.items)
                    ),
                );
            }
        }
        for logical in e.strings("secretGrants") {
            let mut resolved = logical.clone();
            if overrides.is_obj() && overrides.has(&logical) && !overrides.get(&logical).is_null() {
                resolved = overrides.get(&logical).template_string();
            }
            if !secret_ids.has(&resolved) {
                log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "Secret grant '{logical}' in addon '{}' ({}) targets a secret that does not exist. Available secrets: {}",
                        e.namespace,
                        e.pkg_js(),
                        or_none(&secret_ids.items)
                    ),
                );
            }
        }
    }
}

pub fn validate_addon_uses(log: &mut Logger, st: &State) {
    let decls = addon_decls(st);
    for e in &decls {
        let uses = e.v.get("uses");
        for (name, target_v) in entries(&uses) {
            let target = target_v.template_string();
            let declared_uses = e.v.get("declaredUses");
            if declared_uses.is_arr() {
                let declared: Vec<String> = declared_uses.items().iter().filter_map(|x| x.as_str().map(String::from)).collect();
                if !declared.contains(&name) {
                    let declared_s = if declared.is_empty() { "nothing".to_string() } else { declared.join(", ") };
                    log.critical(
                        codes::ADDON_USES_NOT_DECLARED,
                        format!(
                            "Addon '{}' maps '{name}' to '{target}', but {} does not declare '{name}' in the pikku.uses of its package.json. It declares: {declared_s}. Remove '{name}' from uses, or have the addon declare it.",
                            e.namespace,
                            e.pkg_js()
                        ),
                    );
                    continue;
                }
            }
            let mut expected = name.clone();
            for d in e.v.get("dependencies").items() {
                if d.get("alias").as_str() == Some(name.as_str()) {
                    expected = d.get("package").as_str().unwrap_or("").to_string();
                    break;
                }
            }
            let wired_raw = st.rpc.wire_addon_declarations.get(&target).map(jv);
            let Some(wired) = wired_raw.filter(|w| w.truthy()) else {
                log.critical(
                    codes::ADDON_USES_NOT_WIRED,
                    format!(
                        "Addon '{}' uses '{name}' as '{target}', but no addon is wired under the name '{target}'. Wired: {}",
                        e.namespace,
                        st.rpc.wire_addon_declarations.keys().collect::<Vec<_>>().join(", ")
                    ),
                );
                continue;
            };
            let wired_pkg = wired.get("package");
            if wired_pkg.as_str() != Some(expected.as_str()) {
                let wp = wired_pkg.as_str().map(String::from).unwrap_or_else(|| "undefined".into());
                if expected == name {
                    log.critical(
                        codes::ADDON_USES_NOT_WIRED,
                        format!("Addon '{}' uses '{name}' as '{target}', but '{target}' is wired from '{wp}'.", e.namespace),
                    );
                } else {
                    log.critical(
                        codes::ADDON_USES_NOT_WIRED,
                        format!(
                            "Addon '{}' calls {expected} as '{name}', mapped to '{target}', but '{target}' is wired from '{wp}'.",
                            e.namespace
                        ),
                    );
                }
            }
        }
    }
}

pub fn validate_addon_content_grants(log: &mut Logger, st: &State) {
    let decls = addon_decls(st);
    if decls.is_empty() {
        return;
    }
    let mut buckets = OrderedSet::default();
    for e in &decls {
        match e.v.get("contentBucket").as_str() {
            Some(b) => buckets.add(b),
            None => buckets.add(e.namespace.clone()),
        }
    }
    for e in &decls {
        for (prefix, mode_v) in entries(&e.v.get("contentGrants")) {
            let mode = mode_v.as_str();
            if !matches!(mode, Some("read") | Some("write")) {
                log.critical(
                    codes::ADDON_CONTENT_GRANT_INVALID,
                    format!(
                        "Addon '{}' grants '{prefix}' as '{}', but a content grant must be 'read' or 'write'.",
                        e.namespace,
                        mode_v.template_string()
                    ),
                );
            }
            let first = prefix.split('/').find(|s| !s.is_empty()).unwrap_or("");
            if first.is_empty() || !buckets.has(first) {
                log.critical(
                    codes::ADDON_CONTENT_GRANT_INVALID,
                    format!(
                        "Addon '{}' grants content under '{prefix}', but '{first}' is not the content bucket of any wired addon. Buckets: {}",
                        e.namespace,
                        buckets.items.join(", ")
                    ),
                );
            }
        }
    }
}

/// CredentialOverrideMeta: a rename string, or `{ name?, mode? }`.
struct CredentialOverride {
    rename: Option<String>,
    mode: String,
}

fn parse_credential_override(r: &V) -> CredentialOverride {
    if let Some(s) = r.as_str() {
        return CredentialOverride { rename: Some(s.to_string()), mode: String::new() };
    }
    let name = r.get("name");
    let mode = r.get("mode");
    CredentialOverride {
        rename: if name.nullish() { None } else { Some(name.template_string()) },
        mode: if mode.truthy() { mode.template_string() } else { String::new() },
    }
}

pub fn validate_credential_overrides(log: &mut Logger, st: &State) {
    let decls = addon_decls(st);
    if decls.is_empty() {
        return;
    }
    let credential_names = definition_ids(&st.credentials.definitions, "");
    struct Claim {
        mode: String,
        namespace: String,
        logical: String,
    }
    let mut claims: HashMap<String, Claim> = HashMap::new();

    for e in &decls {
        let overrides = e.v.get("credentialOverrides");
        for (logical, r) in entries(&overrides) {
            let o = parse_credential_override(&r);
            let resolved = o.rename.clone().unwrap_or_else(|| logical.clone());
            if !credential_names.has(&resolved) {
                let target = match &o.rename {
                    Some(rn) if !rn.is_empty() => format!("'{logical}' -> '{resolved}'"),
                    _ => format!("'{logical}'"),
                };
                log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "Credential override {target} in addon '{}' ({}) targets a credential that does not exist. Available credentials: {}",
                        e.namespace,
                        e.pkg_js(),
                        or_none(&credential_names.items)
                    ),
                );
            }
            if o.mode.is_empty() {
                continue;
            }
            if let Some(c) = claims.get(&resolved) {
                if c.mode != o.mode {
                    log.critical(
                        codes::INVALID_VALUE,
                        format!(
                            "Credential '{resolved}' is wired '{}' by '{}' in addon '{}' and '{}' by '{logical}' in addon '{}'. One credential holds one mode, so the second wiring would silently take the first's resolution. Give them separate names, or wire both the same way.",
                            c.mode, c.logical, c.namespace, o.mode, e.namespace
                        ),
                    );
                }
            }
            claims.insert(resolved, Claim { mode: o.mode, namespace: e.namespace.clone(), logical });
        }
        for logical in e.strings("credentialGrants") {
            let mut resolved = logical.clone();
            if overrides.is_obj() && overrides.has(&logical) && overrides.get(&logical).truthy() {
                if let Some(rn) = parse_credential_override(&overrides.get(&logical)).rename {
                    resolved = rn;
                }
            }
            if !credential_names.has(&resolved) {
                log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "Credential grant '{logical}' in addon '{}' ({}) targets a credential that does not exist. Available credentials: {}",
                        e.namespace,
                        e.pkg_js(),
                        or_none(&credential_names.items)
                    ),
                );
            }
        }
    }
}

pub fn validate_variable_overrides(log: &mut Logger, st: &State) {
    let decls = addon_decls(st);
    if decls.is_empty() {
        return;
    }
    let variable_ids = definition_ids(&st.variables.definitions, "variableId");
    for e in &decls {
        for (logical, r) in entries(&e.v.get("variableOverrides")) {
            let resolved = r.template_string();
            if !variable_ids.has(&resolved) {
                log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "Variable override '{logical}' -> '{resolved}' in addon '{}' ({}) targets a variable that does not exist. Available variables: {}",
                        e.namespace,
                        e.pkg_js(),
                        or_none(&variable_ids.items)
                    ),
                );
            }
        }
    }
}

/// addon-resolution.ts nearestPackageDir.
pub fn nearest_package_dir(file: &str) -> String {
    let mut dir = dir_of(file);
    while !dir.is_empty() && dir != "/" {
        if file_exists(&path_join(&[&dir, "package.json"])) {
            return dir;
        }
        let parent = dir_of(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
    }
    String::new()
}

/// addon-resolution.ts addonResolutionDirs.
pub fn addon_resolution_dirs(root_dir: &str, decl_file: Option<&str>) -> Vec<String> {
    let root = abs(root_dir);
    let mut decl_dir = String::new();
    if let Some(f) = decl_file.filter(|f| !f.is_empty()) {
        decl_dir = nearest_package_dir(&abs(f));
    }
    if !decl_dir.is_empty() && decl_dir != root {
        vec![decl_dir, root]
    } else {
        vec![root]
    }
}

/// Module._nodeModulePaths(dir).
fn node_modules_paths(dir: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut dir = clean(dir);
    loop {
        if base_of(&dir) != "node_modules" {
            out.push(path_join(&[&dir, "node_modules"]));
        }
        let parent = dir_of(&dir);
        if parent == dir {
            break;
        }
        dir = parent;
    }
    out
}

/// Node's package self-reference: the package scope that contains dir is named
/// pkg and has an "exports" field.
fn self_references(dir: &str, pkg: &str) -> bool {
    let mut d = clean(dir);
    loop {
        if base_of(&d) == "node_modules" {
            return false;
        }
        let manifest = path_join(&[&d, "package.json"]);
        if let Ok(b) = std::fs::read(&manifest) {
            let Ok(m) = serde_json::from_slice::<serde_json::Value>(&b) else { return false };
            let exports = m.get("exports");
            return m.get("name").and_then(|n| n.as_str()) == Some(pkg) && exports.is_some_and(|e| !e.is_null());
        }
        let parent = dir_of(&d);
        if parent == d {
            return false;
        }
        d = parent;
    }
}

/// What post-process.ts asks Node's CommonJS resolver: found unless every
/// attempt is a module-not-found.
pub fn is_package_resolvable(pkg: &str, dirs: &[String]) -> bool {
    for dir in dirs {
        if self_references(dir, pkg) {
            return true;
        }
        for modules in node_modules_paths(dir) {
            let base = path_join(&[&modules, pkg]);
            if file_exists(&path_join(&[&base, "package.json"])) {
                return true;
            }
            for ext in ["", ".js", ".json", ".node"] {
                if file_exists(&format!("{base}{ext}")) {
                    return true;
                }
            }
            for index in ["index.js", "index.json", "index.node"] {
                if file_exists(&path_join(&[&base, index])) {
                    return true;
                }
            }
        }
    }
    false
}

const LOCK_FILE: &str = "pikku-addons.lock";

struct Lock {
    sdks: serde_json::Map<String, serde_json::Value>,
}

fn read_lock(root_dir: &str) -> Result<Lock, String> {
    let path = path_join(&[root_dir, LOCK_FILE]);
    let b = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Lock { sdks: Default::default() }),
        Err(e) => return Err(e.to_string()),
    };
    let raw: serde_json::Value = serde_json::from_slice(&b).map_err(|e| format!("{path} is not valid JSON: {e}"))?;
    match raw.get("sdks").and_then(|s| s.as_object()) {
        Some(m) => Ok(Lock { sdks: m.clone() }),
        None => Err(format!("{path} has no \"sdks\" object")),
    }
}

/// remotesdk.Check: the reason the locked SDK is not the one on disk, or `""`.
fn check_lock(root_dir: &str, name: &str, rng: &str, lock: &Lock) -> String {
    let Some(entry) = lock.sdks.get(name) else { return format!("{LOCK_FILE} has no entry for it") };
    let s = |k: &str| entry.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let (e_range, e_version, e_integrity) = (s("range"), s("version"), s("integrity"));
    if e_range != rng {
        return format!("{LOCK_FILE} was resolved for '{e_range}', not '{rng}'");
    }
    let dir = path_join(&[root_dir, ".pikku", "remote", &format!("{name}@{e_version}")]);
    let Ok(marker) = std::fs::read_to_string(path_join(&[&dir, ".integrity"])) else { return format!("{dir} is missing") };
    if marker.trim() != e_integrity {
        return format!("{dir} was extracted from a different tarball than {LOCK_FILE} pins");
    }
    let manifest_ok = std::fs::read(path_join(&[&dir, "manifest.json"]))
        .ok()
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .is_some_and(|m| m.get("name").and_then(|v| v.as_str()) == Some(name) && m.get("version").and_then(|v| v.as_str()) == Some(e_version.as_str()));
    if !manifest_ok {
        return format!("{dir}/manifest.json does not name {name}@{e_version}");
    }
    String::new()
}

pub fn validate_remote_addon_dependencies(log: &mut Logger, st: &State) {
    let decls = addon_decls(st);
    if decls.is_empty() {
        return;
    }
    for e in &decls {
        if e.remote() {
            continue;
        }
        let dirs = addon_resolution_dirs(&st.root_dir, e.file().as_deref());
        if is_package_resolvable(&e.pkg(), &dirs) {
            continue;
        }
        log.critical(
            codes::ADDON_NOT_INSTALLED,
            format!(
                "Addon '{ns}' ('{pkg}') is wired with wireAddon but cannot be resolved from {} \u{2014} every ref('{ns}:\u{2026}') will resolve to nothing and the surface will be dead at runtime. Add it to the dependencies of {} and install, or remove the wireAddon call.",
                dirs.join(" or "),
                path_join(&[&dirs[0], "package.json"]),
                ns = e.namespace,
                pkg = e.pkg_js()
            ),
        );
    }

    let mut manifests: HashMap<String, Option<serde_json::Value>> = HashMap::new();
    let mut lock: Option<Result<Lock, String>> = None;
    for e in &decls {
        if !e.remote() || e.range().is_empty() {
            continue;
        }
        let lock = lock.get_or_insert_with(|| read_lock(&st.root_dir));
        let reason = match lock {
            Err(m) => m.clone(),
            Ok(l) => check_lock(&st.root_dir, &e.pkg(), &e.range(), l),
        };
        if reason.is_empty() {
            continue;
        }
        log.critical(
            codes::REMOTE_ADDON_NOT_DEV_DEPENDENCY,
            format!(
                "Remote addon '{}' ('{}@{}') has no SDK matching {LOCK_FILE}: {reason}. Run 'pikku all' to download it.",
                e.namespace,
                e.pkg(),
                e.range()
            ),
        );
    }

    for e in &decls {
        if !e.remote() || !e.range().is_empty() {
            continue;
        }
        let pkg_json_path = path_join(&[&addon_resolution_dirs(&st.root_dir, e.file().as_deref())[0], "package.json"]);
        if !manifests.contains_key(&pkg_json_path) {
            let mut m = None;
            if let Ok(b) = std::fs::read(&pkg_json_path) {
                match serde_json::from_slice::<serde_json::Value>(&b) {
                    Ok(v) => m = Some(v),
                    Err(err) => log.warn(format!("Could not read {pkg_json_path} to verify remote addon dependencies: {err}")),
                }
            }
            manifests.insert(pkg_json_path.clone(), m);
        }
        let Some(m) = manifests[&pkg_json_path].as_ref() else { continue };
        let pkg = e.pkg_js();
        let has = |section: &str| m.get(section).and_then(|d| d.as_object()).is_some_and(|d| d.contains_key(&pkg));
        if has("devDependencies") {
            continue;
        }
        if has("dependencies") {
            log.critical(
                codes::REMOTE_ADDON_NOT_DEV_DEPENDENCY,
                format!(
                    "Remote addon '{}' ('{pkg}') is a production dependency in {pkg_json_path}, but wireRemoteAddon consumes it for types only \u{2014} its handlers run on the host. Move '{pkg}' from \"dependencies\" to \"devDependencies\".",
                    e.namespace
                ),
            );
        } else {
            log.critical(
                codes::REMOTE_ADDON_NOT_DEV_DEPENDENCY,
                format!(
                    "Remote addon '{}' ('{pkg}') is wired with wireRemoteAddon but is not in the \"devDependencies\" of {pkg_json_path}. Add '{pkg}' to \"devDependencies\" (types only).",
                    e.namespace
                ),
            );
        }
    }
}

pub fn validate_remote_addon_auth(log: &mut Logger, st: &State) {
    let decls = addon_decls(st);
    if decls.is_empty() {
        return;
    }
    let credential_names = definition_ids(&st.credentials.definitions, "");
    let secret_names = definition_ids(&st.secrets.definitions, "");
    for e in &decls {
        if !e.remote() {
            continue;
        }
        if let Some(id) = e.v.get("authCredentialId").as_str().filter(|i| !i.is_empty()) {
            if !credential_names.has(id) {
                log.critical(
                    codes::REMOTE_ADDON_AUTH_UNRESOLVED,
                    format!(
                        "Remote addon '{}' binds auth.credentialId '{id}', but no such credential is wired. Available credentials: {}",
                        e.namespace,
                        or_none(&credential_names.items)
                    ),
                );
            }
        }
        if let Some(id) = e.v.get("authSecretId").as_str().filter(|i| !i.is_empty()) {
            if !secret_names.has(id) {
                log.critical(
                    codes::REMOTE_ADDON_AUTH_UNRESOLVED,
                    format!(
                        "Remote addon '{}' binds auth.secretId '{id}', but no such secret is wired. Available secrets: {}",
                        e.namespace,
                        or_none(&secret_names.items)
                    ),
                );
            }
        }
    }
}
