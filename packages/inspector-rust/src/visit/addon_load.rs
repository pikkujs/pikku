//! Port of Go `visit/addon_load.go` (utils/load-addon-functions-meta.ts): after
//! the setup sweep, read each wired addon's generated metadata so the routes
//! sweep can resolve addon functions.
//!
//! Go keeps the wired addons in `Context.addons` / `addonOrder`; Rust rebuilds
//! them from `state.rpc.wireAddonDeclarations`, which holds the same values
//! (written by `declareAddon` from the same parse) in the same first-set order.

use serde::Deserialize;

use super::Context;
use super::addon_json::{OJson, ojson_of_raw, parse_ojson};
use super::addon_resolve::{
    AddonResolver, addon_resolution_dirs, dir as path_dir, find_installed_package_dir, join, rel,
    resolve_package_subpath,
};
use crate::diag::{Logger, codes};
use crate::remotesdk;
use crate::state::meta::{FunctionMeta, FunctionMetaFields, MCPToolMeta};
use crate::state::{Raw, Record, State};

pub(crate) const WEBHOOK_SOURCE_STEPS: [&str; 4] = ["receive", "check", "setup", "teardown"];

/// `mcp` and `expose`: unset, a bool, or a list of function names.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) enum Flex {
    #[default]
    Unset,
    Bool(bool),
    List(Vec<String>),
}

/// `mcpEndpoint`: unset, a bool or a string.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) enum Endpoint {
    #[default]
    Unset,
    Bool(bool),
    Str(String),
}

#[derive(Clone, Debug, Default)]
pub(crate) struct AddonLocal {
    pub pkg: String,
    pub ui: bool,
    pub contributors: Vec<String>,
}

/// A `state.rpc.wireAddonDeclarations` entry, typed for the readers in the
/// analysis (the addon loader, resolveAddonName).
#[derive(Clone, Debug, Default)]
pub struct AddonDecl {
    pub pkg: String,
    /// A versioned wireRemoteAddon's range; empty when unversioned.
    pub rng: String,
    pub file: String,
    pub remote: bool,
    pub ui: bool,
    pub(crate) mcp: Flex,
    pub(crate) expose: Flex,
    pub(crate) mcp_endpoint: Endpoint,
    pub auth: Option<bool>,
    pub scopes: Vec<String>,
    pub uses: Option<Record<String>>,
    /// The addon contributor names the project opted in to.
    pub contributors: Vec<String>,
    /// A wireRemoteAddon's local package: the screens and contributors shown
    /// under the remote name are read from it.
    pub(crate) local: Option<AddonLocal>,
    pub(crate) secret_overrides: Option<Record<OJson>>,
    pub(crate) variable_overrides: Option<Record<OJson>>,
    pub(crate) credential_overrides: Option<Record<OJson>>,
}

fn flex_of(v: Option<&OJson>) -> Flex {
    match v {
        Some(OJson::Bool(b)) => Flex::Bool(*b),
        Some(a @ OJson::Arr(_)) => Flex::List(a.string_members()),
        _ => Flex::Unset,
    }
}

fn string_record_of(v: Option<&OJson>) -> Option<Record<String>> {
    let OJson::Obj(r) = v? else { return None };
    let mut out = Record::new();
    for (k, x) in r.iter() {
        if let Some(s) = x.str() {
            out.set(k, s.to_string());
        }
    }
    Some(out)
}

fn object_record_of(v: Option<&OJson>) -> Option<Record<OJson>> {
    match v? {
        OJson::Obj(r) => Some(r.clone()),
        _ => None,
    }
}

impl AddonDecl {
    /// The typed view of a declaration `declareAddon` wrote.
    pub(crate) fn from_declaration(raw: &Raw) -> Option<AddonDecl> {
        let o = ojson_of_raw(raw)?;
        if !o.is_object() {
            return None;
        }
        let s = |k: &str| o.get(k).and_then(OJson::str).unwrap_or("").to_string();
        let remote = o.get("remote").is_some_and(|v| *v == OJson::Bool(true));
        let local = o.get("local").filter(|l| l.is_object()).map(|l| AddonLocal {
            pkg: l.get("package").and_then(OJson::str).unwrap_or("").to_string(),
            ui: l.get("ui").is_some_and(|v| *v == OJson::Bool(true)),
            contributors: l.get("contributors").map(OJson::string_members).unwrap_or_default(),
        });
        Some(AddonDecl {
            pkg: s("package"),
            rng: s("range"),
            file: s("file"),
            remote,
            ui: o.get("ui").is_some_and(|v| *v == OJson::Bool(true)),
            mcp: flex_of(o.get("mcp")),
            expose: flex_of(o.get("expose")),
            mcp_endpoint: match o.get("mcpEndpoint") {
                Some(OJson::Str(x)) => Endpoint::Str(x.clone()),
                Some(OJson::Bool(b)) => Endpoint::Bool(*b),
                _ => Endpoint::Unset,
            },
            auth: match o.get("auth") {
                Some(OJson::Bool(b)) => Some(*b),
                _ => None,
            },
            scopes: o.get("scopes").map(OJson::string_members).unwrap_or_default(),
            uses: string_record_of(o.get("uses")),
            contributors: o.get("contributors").map(OJson::string_members).unwrap_or_default(),
            local,
            secret_overrides: object_record_of(o.get("secretOverrides")),
            variable_overrides: object_record_of(o.get("variableOverrides")),
            credential_overrides: object_record_of(o.get("credentialOverrides")),
        })
    }
}

/// The wired addons in declaration order (Go `Context.addonOrder` + `addons`).
pub fn declared_addons(state: &State) -> Vec<(String, AddonDecl)> {
    state
        .rpc
        .wire_addon_declarations
        .iter()
        .filter_map(|(ns, raw)| AddonDecl::from_declaration(raw).map(|d| (ns.to_string(), d)))
        .collect()
}

/// What the loaders touch: no checker, so they run (and are tested) without a
/// program.
pub(crate) struct Loader<'a> {
    pub state: &'a mut State,
    pub log: &'a mut Logger,
    pub root_dir: &'a str,
}

impl Context<'_> {
    /// `LoadAddonFunctionsMeta`: after the setup sweep, read each wired addon's
    /// generated metadata so the routes sweep can resolve addon functions.
    pub fn load_addon_functions_meta(&mut self) {
        let mut l = Loader { state: self.state, log: self.log, root_dir: &self.root_dir };
        l.load_addon_functions_meta();
    }
}

/// Resolves an addon's generated metadata, preferring the verbose copy.
fn resolve_addon_meta(req: &AddonResolver, pkg: &str, base_name: &str) -> Option<String> {
    for suffix in ["-verbose.gen.json", ".gen.json"] {
        if let Some(p) = req.resolve(&format!("{pkg}/.pikku/{base_name}{suffix}")) {
            return Some(p);
        }
    }
    None
}

fn describe_missing_addon_meta(namespace: &str, pkg: &str, dirs: &[String], decl_file: &str) -> String {
    let mut declared_in = String::new();
    if !decl_file.is_empty() {
        let caller = match rel(&dirs[dirs.len() - 1], decl_file) {
            Some(c) if !c.is_empty() && c != "." => c,
            _ => decl_file.to_string(),
        };
        declared_in = format!(" (declared in {caller})");
    }
    let package_dir = find_installed_package_dir(dirs, pkg);
    if package_dir.is_empty() {
        return format!(
            "wireAddon('{namespace}'){declared_in} names {pkg}, which is not installed where it can be resolved — tried {}. Add \"{pkg}\": \"workspace:*\" (or a version) to the dependencies of {} and run install.",
            dirs.join(", "),
            join(&[&dirs[0], "package.json"])
        );
    }
    format!(
        "wireAddon('{namespace}'){declared_in}: {pkg} is installed at {package_dir} but has not been built — its dist/.pikku/addon/function/pikku-functions-meta.gen.json does not exist. Run the addon's build (pikku all && tsc && pikku dist) in {package_dir}."
    )
}

fn read_json_file(path: &str) -> Result<OJson, String> {
    let raw = std::fs::read(path).map_err(|e| e.to_string())?;
    parse_ojson(&raw).map_err(|e| e.to_string())
}

/// `JSON.parse(await readFile(require.resolve(id)))`.
fn read_resolved_json(req: &AddonResolver, id: &str) -> Option<OJson> {
    read_json_file(&req.resolve(id)?).ok()
}

/// A package.json still carrying `pikku.contributors`, the removed
/// string-emitting route.
fn has_legacy_contributors(dirs: &[String], pkg: &str) -> bool {
    let d = find_installed_package_dir(dirs, pkg);
    if d.is_empty() {
        return false;
    }
    read_json_file(&join(&[&d, "package.json"])).is_ok_and(|pj| pj.get("pikku").is_some_and(|p| p.has("contributors")))
}

/// `namespaceAddonWebhookSources`: names an addon's webhook sources after the
/// namespace it is wired under.
fn namespace_addon_webhook_sources(sources: &OJson, namespace: &str) -> Record<OJson> {
    let declared = sources.values();
    let mut out = Record::new();
    for source in &declared {
        if !source.is_object() {
            continue;
        }
        let name = if declared.len() != 1 {
            format!("{namespace}-{}", source.get("name").and_then(OJson::str).unwrap_or(""))
        } else {
            namespace.to_string()
        };
        let mut meta = (*source).clone();
        meta.set("name", OJson::string(&name));
        meta.set("route", OJson::string(format!("/webhooks/{name}")));
        for step in WEBHOOK_SOURCE_STEPS {
            if let Some(id) = source.get(step).and_then(OJson::str)
                && !id.is_empty()
                && !id.contains(':')
            {
                meta.set(step, OJson::string(format!("{namespace}:{id}")));
            }
        }
        out.set(name, meta);
    }
    out
}

struct ContractShape;

fn is_http_route_config(v: &OJson) -> bool {
    v.is_js_object() && v.has("method") && v.has("func") && v.has("route")
}

fn is_http_route_group(v: &OJson) -> bool {
    v.is_js_object() && v.has("routes") && !v.has("method")
}

fn apply_package_to_http_route_map(routes: &mut OJson, pkg: &str, namespace: &str) -> Result<(), ContractShape> {
    routes.try_for_each_value_mut(|value| {
        if !value.is_js_object() {
            return Ok(());
        }
        if is_http_route_config(value) {
            let f = value.get_mut("func").unwrap();
            if !f.is_js_object() {
                return Err(ContractShape);
            }
            if !f.get("packageName").is_some_and(OJson::truthy) {
                f.set("packageName", OJson::string(pkg));
            }
            if !namespace.is_empty() {
                let Some(id) = f.get("pikkuFuncId").and_then(OJson::str).map(String::from) else {
                    return Err(ContractShape);
                };
                if !id.contains(':') {
                    f.set("pikkuFuncId", OJson::string(format!("{namespace}:{id}")));
                }
            }
            Ok(())
        } else if is_http_route_group(value) {
            match value.get_mut("routes") {
                Some(r) => apply_package_to_http_route_map(r, pkg, namespace),
                None => Ok(()),
            }
        } else {
            apply_package_to_http_route_map(value, pkg, namespace)
        }
    })
}

fn apply_package_to_http_contracts(contracts: &mut OJson, pkg: &str, namespace: &str) -> Result<(), ContractShape> {
    contracts.try_for_each_value_mut(|contract| {
        if !contract.is_js_object() && matches!(contract, OJson::Null) {
            return Err(ContractShape);
        }
        match contract.get_mut("routes") {
            Some(r) => apply_package_to_http_route_map(r, pkg, namespace),
            None => Ok(()),
        }
    })
}

fn apply_package_to_cli_commands(commands: &mut OJson, pkg: &str, namespace: &str) {
    let _ = commands.try_for_each_value_mut(|command| -> Result<(), ()> {
        if !command.is_js_object() {
            return Ok(());
        }
        if !command.get("packageName").is_some_and(OJson::truthy) && command.get("pikkuFuncId").is_some_and(OJson::truthy)
        {
            command.set("packageName", OJson::string(pkg));
        }
        if let Some(id) = command.get("pikkuFuncId").and_then(OJson::str).map(String::from)
            && !namespace.is_empty()
            && !id.is_empty()
            && !id.contains(':')
        {
            command.set("pikkuFuncId", OJson::string(format!("{namespace}:{id}")));
        }
        if let Some(sub) = command.get_mut("subcommands")
            && sub.truthy()
        {
            apply_package_to_cli_commands(sub, pkg, namespace);
        }
        Ok(())
    });
}

fn apply_package_to_cli_contracts(contracts: &mut OJson, pkg: &str, namespace: &str) -> Result<(), ContractShape> {
    contracts.try_for_each_value_mut(|commands| {
        if matches!(commands, OJson::Null) {
            return Err(ContractShape);
        }
        apply_package_to_cli_commands(commands, pkg, namespace);
        Ok(())
    })
}

fn apply_package_to_channel_contracts(contracts: &mut OJson, pkg: &str, namespace: &str) -> Result<(), ContractShape> {
    contracts.try_for_each_value_mut(|routes| {
        if matches!(routes, OJson::Null) {
            return Err(ContractShape);
        }
        routes.try_for_each_value_mut(|route| {
            if !route.is_js_object() {
                return Err(ContractShape);
            }
            if !route.get("packageName").is_some_and(OJson::truthy) {
                route.set("packageName", OJson::string(pkg));
            }
            let Some(id) = route.get("pikkuFuncId").and_then(OJson::str).map(String::from) else {
                return Err(ContractShape);
            };
            if !id.contains(':') {
                route.set("pikkuFuncId", OJson::string(format!("{namespace}:{id}")));
            }
            Ok(())
        })
    })
}

/// `export const requiredParentServices = [...]` from an addon's generated
/// pikku-services.gen.js, which the TS imports. Go's
/// `(?m)^export const requiredParentServices\s*=\s*(\[[^\]]*\])`.
fn read_required_parent_services(path: &str) -> Option<Vec<String>> {
    let text = std::fs::read_to_string(path).ok()?;
    const HEAD: &str = "export const requiredParentServices";
    let is_ws = |c: char| matches!(c, ' ' | '\t' | '\n' | '\x0c' | '\r');
    let mut start = 0;
    loop {
        let at_line_start = start == 0 || text.as_bytes()[start - 1] == b'\n';
        if at_line_start && text[start..].starts_with(HEAD) {
            let rest = text[start + HEAD.len()..].trim_start_matches(is_ws);
            if let Some(rest) = rest.strip_prefix('=') {
                let rest = rest.trim_start_matches(is_ws);
                if rest.starts_with('[')
                    && let Some(end) = rest.find(']')
                {
                    return serde_json::from_str::<Vec<String>>(&rest[..=end]).ok();
                }
            }
        }
        match text[start..].find('\n') {
            Some(i) => start += i + 1,
            None => return None,
        }
    }
}

fn function_meta_from(entry: &OJson) -> FunctionMeta {
    let raw = entry.raw();
    let fields = raw
        .value()
        .and_then(|v| FunctionMetaFields::deserialize(v).ok())
        .unwrap_or_default();
    let mut m = FunctionMeta::new(fields);
    m.verbatim = raw;
    m
}

fn functions_of(meta: &OJson) -> Record<FunctionMeta> {
    let mut fns = Record::new();
    if let OJson::Obj(r) = meta {
        for (name, entry) in r.iter() {
            fns.set(name, function_meta_from(entry));
        }
    }
    fns
}

fn is_definition_match(have: Option<&OJson>, resolved: &OJson) -> bool {
    matches!((have.and_then(OJson::str), resolved.str()), (Some(a), Some(b)) if a == b)
}

impl Loader<'_> {
    pub(crate) fn load_addon_functions_meta(&mut self) {
        for (ns, decl) in declared_addons(self.state) {
            if decl.remote {
                if !decl.rng.is_empty() {
                    self.load_remote_addon_sdk_meta(&ns, &decl);
                }
                if decl.local.is_some() {
                    self.load_remote_addon_local(&ns, &decl);
                }
                continue;
            }
            if let Err(e) = self.load_addon(&ns, &decl) {
                self.log.warn(format!(
                    "Failed to load addon function metadata for '{ns}' ({}): {e}",
                    decl.pkg
                ));
            }
        }
    }

    /// The screens and contributors a wireRemoteAddon takes from its local
    /// package, under the remote addon's name.
    fn load_remote_addon_local(&mut self, ns: &str, decl: &AddonDecl) {
        let l = decl.local.as_ref().unwrap();
        let local = AddonDecl {
            pkg: l.pkg.clone(),
            file: decl.file.clone(),
            ui: l.ui,
            contributors: l.contributors.clone(),
            ..Default::default()
        };
        let req = AddonResolver(addon_resolution_dirs(self.root_dir, &decl.file));
        if !local.contributors.is_empty() {
            self.record_opted_in_contributors(ns, &local, &req);
        }
        if local.ui
            && let Err(e) = self.load_addon_studio(ns, &local, &req)
        {
            self.log.warn(format!("Failed to load addon function metadata for '{ns}' ({}): {e}", local.pkg));
        }
    }

    /// A versioned remote addon's function metadata, read from its SDK only when
    /// it matches the lock.
    fn load_remote_addon_sdk_meta(&mut self, ns: &str, decl: &AddonDecl) {
        let Ok(lock) = remotesdk::read_lock(self.root_dir) else { return };
        let Ok(dir) = remotesdk::check(self.root_dir, &decl.pkg, &decl.rng, &lock) else { return };
        let Ok(meta) = read_json_file(&join(&[&dir, "function", "pikku-functions-meta.gen.json"])) else { return };
        self.state
            .remote_addon_functions
            .get_or_insert_with(Record::new)
            .set(ns, functions_of(&meta));
    }

    fn load_addon(&mut self, ns: &str, decl: &AddonDecl) -> Result<(), String> {
        let dirs = addon_resolution_dirs(self.root_dir, &decl.file);
        let req = AddonResolver(dirs.clone());

        self.record_declared_uses(ns, decl, &dirs);
        if !decl.contributors.is_empty() {
            self.record_opted_in_contributors(ns, decl, &req);
        }

        if has_legacy_contributors(&dirs, &decl.pkg) {
            self.log.critical(
                codes::ADDON_LEGACY_CONTRIBUTORS,
                format!(
                    "{} still declares \"pikku.contributors\" in its package.json, which is no longer read. Remove it, register the contributors with defineContributors in the addon's source, and opt in with wireAddon('{ns}', {{ contributors: [...] }}). See docs/contributors.md.",
                    decl.pkg
                ),
            );
        }

        if decl.ui {
            self.load_addon_studio(ns, decl, &req)?;
        }

        let Some(meta_path) = resolve_addon_meta(&req, &decl.pkg, "function/pikku-functions-meta") else {
            self.log.warn(describe_missing_addon_meta(ns, &decl.pkg, &dirs, &decl.file));
            return Ok(());
        };
        let meta = read_json_file(&meta_path)?;
        let fns = functions_of(&meta);
        let count = fns.len();
        self.state.addon_functions.set(ns, fns);
        self.log.debug(format!("Loaded {count} addon functions for '{ns}' from {}", decl.pkg));
        self.register_addon_types(&meta_path, ns);

        self.load_addon_mcp_tools(ns, decl, &meta);
        if let Flex::List(names) = &decl.expose {
            for f in names {
                if !meta.has(f) {
                    self.log.critical(
                        codes::ADDON_EXPOSE_FUNCTION_NOT_FOUND,
                        format!("wireAddon('{ns}') lists '{f}' under expose, but {} publishes no such function.", decl.pkg),
                    );
                } else if !self
                    .state
                    .addon_functions
                    .get(ns)
                    .and_then(|fns| fns.get(f))
                    .is_some_and(|m| m.expose == Some(true))
                {
                    self.log.critical(
                        codes::ADDON_EXPOSE_FUNCTION_NOT_FOUND,
                        format!("wireAddon('{ns}') lists '{f}' under expose, but {} does not declare it expose: true, so it stays unexposed.", decl.pkg),
                    );
                }
            }
        }

        self.load_addon_secrets(decl, &req);
        // Scopes: scope_addon.rs, given the directory the scopes meta resolves from.
        for d in &req.0 {
            if resolve_package_subpath(d, &decl.pkg, ".pikku/scopes/pikku-scopes-meta.gen.json").is_some() {
                self.load_addon_scopes(decl, d);
                break;
            }
        }
        self.load_addon_variables(decl, &req);
        self.load_addon_credentials(decl, &req);
        self.load_addon_services(ns, decl, &req);
        self.load_addon_webhook_sources(ns, decl, &req);
        self.load_addon_contracts(ns, decl, &req);
        Ok(())
    }

    /// `wireAddon({ contributors })` against what the addon registered. A name
    /// it does not register is an error rather than a skip: the project asked
    /// for a service and would otherwise build without it.
    fn record_opted_in_contributors(&mut self, ns: &str, decl: &AddonDecl, req: &AddonResolver) {
        let mut registered = OJson::new_object();
        if let Some(path) = resolve_addon_meta(req, &decl.pkg, "contributors/pikku-contributors-meta") {
            match read_json_file(&path) {
                Err(e) => {
                    self.log.critical(
                        codes::ADDON_CONTRIBUTOR_UNKNOWN,
                        format!("wireAddon('{ns}') opts in to contributors, but the contributors manifest of {} could not be read: {e}", decl.pkg),
                    );
                    return;
                }
                Ok(meta) => {
                    if let Some(c) = meta.get("contributors").filter(|c| c.is_object()) {
                        registered = c.clone();
                    }
                }
            }
        }
        let mut selected = OJson::new_object();
        for name in &decl.contributors {
            match registered.get(name) {
                None => {
                    let known: Vec<String> = match &registered {
                        OJson::Obj(r) => r.keys().into_iter().map(String::from).collect(),
                        _ => vec![],
                    };
                    let hint = if known.is_empty() {
                        "It registers none; add a defineContributors call to the package and run pikku all in it.".to_string()
                    } else {
                        format!("It registers: {}.", known.join(", "))
                    };
                    self.log.critical(
                        codes::ADDON_CONTRIBUTOR_UNKNOWN,
                        format!("wireAddon('{ns}') opts in to contributor '{name}', but {} registers no such contributor. {hint}", decl.pkg),
                    );
                }
                Some(v) => selected.set(name, v.clone()),
            }
        }
        if matches!(&selected, OJson::Obj(r) if r.is_empty()) {
            return;
        }
        let mut entry = OJson::new_object();
        entry.set("packageName", OJson::string(&decl.pkg));
        entry.set("contributors", selected);

        let mut all = OJson::new_object();
        if let Some(existing) = ojson_of_raw(&self.state.opted_in_contributors)
            && existing.is_object()
        {
            all = existing;
        }
        all.set(ns, entry);
        self.state.opted_in_contributors = all.raw();
    }

    fn load_addon_studio(&mut self, ns: &str, decl: &AddonDecl, req: &AddonResolver) -> Result<(), String> {
        let mut manifest: Option<OJson> = None;
        if let Some(path) = resolve_addon_meta(req, &decl.pkg, "screens/pikku-screens-meta") {
            match read_json_file(&path) {
                Err(e) => {
                    self.log.critical(
                        codes::ADDON_UI_HAS_NO_SCREENS,
                        format!("wireAddon('{ns}') sets ui: true, but the screens manifest of {} could not be read: {e}", decl.pkg),
                    );
                    return Ok(());
                }
                Ok(m) => manifest = Some(m),
            }
        }
        if matches!(manifest, Some(OJson::Null)) {
            manifest = None;
        }
        if let Some(m) = &manifest {
            match m.get("screens") {
                Some(OJson::Null) | None => {
                    return Err("Cannot read properties of undefined (reading 'length')".into());
                }
                Some(_) => {}
            }
        }
        let has_screens = manifest
            .as_ref()
            .and_then(|m| m.get("screens"))
            .is_some_and(|s| matches!(s, OJson::Arr(a) if !a.is_empty()));
        if !has_screens {
            self.log.critical(
                codes::ADDON_UI_HAS_NO_SCREENS,
                format!("wireAddon('{ns}') sets ui: true, but {} declares no screens. Add a definePlugin call to the package, or drop ui.", decl.pkg),
            );
            return Ok(());
        }
        let manifest = manifest.unwrap();
        let mut scopes: Vec<String> = Vec::new();
        let declared = manifest.get("scopes").map(OJson::string_members).unwrap_or_default();
        for sc in declared.into_iter().chain(decl.scopes.iter().cloned()) {
            if !scopes.contains(&sc) {
                scopes.push(sc);
            }
        }
        scopes.sort();
        let mut entry = manifest.clone();
        entry.set("scopes", OJson::strings(scopes));

        let mut all = OJson::new_object();
        if let Some(existing) = ojson_of_raw(&self.state.addon_studio)
            && existing.is_object()
        {
            all = existing;
        }
        all.set(ns, entry);
        self.state.addon_studio = all.raw();
        Ok(())
    }

    /// Gives the addon's input/output type names the addon's published
    /// declaration file to be imported from.
    fn register_addon_types(&mut self, meta_path: &str, ns: &str) {
        let types_path = join(&[&path_dir(meta_path), "..", "rpc", "pikku-rpc-wirings-map.internal.gen.d.ts"]);
        if std::fs::metadata(&types_path).is_err() {
            return;
        }
        let names: Vec<String> = self.state.addon_functions.get(ns).map_or_else(Vec::new, |fns| {
            fns.iter()
                .flat_map(|(_, m)| [m.input_schema_name.clone(), m.output_schema_name.clone()])
                .flatten()
                .collect()
        });
        for n in names {
            if !n.is_empty() && self.state.functions.types_map.exists(&n, &types_path).is_none() {
                self.state.functions.types_map.add_type(&n, &types_path);
            }
        }
    }

    fn load_addon_mcp_tools(&mut self, ns: &str, decl: &AddonDecl, meta: &OJson) {
        if matches!(decl.mcp, Flex::Unset | Flex::Bool(false)) {
            return;
        }
        let (selected, is_list): (&[String], bool) = match &decl.mcp {
            Flex::List(l) => (l, true),
            _ => (&[], false),
        };
        let mut surface = String::new();
        match &decl.mcp_endpoint {
            Endpoint::Str(ep) if !ep.is_empty() => {
                surface = ns.to_string();
                self.state.mcp_endpoints.surfaces.get_or_insert_with(Record::new).set(ns, ep.clone());
            }
            Endpoint::Bool(true) => {
                surface = ns.to_string();
                self.state.mcp_endpoints.surfaces.get_or_insert_with(Record::new).set(ns, format!("/mcp/{ns}"));
            }
            _ => {}
        }
        if let OJson::Obj(fns) = meta {
            for (f, fm) in fns.iter() {
                let wanted = if is_list { selected.iter().any(|s| s == f) } else { fm.get("mcp").is_some_and(OJson::truthy) };
                if !wanted {
                    continue;
                }
                let tool_name = format!("{ns}:{f}");
                let description = match (fm.get("description"), fm.get("title")) {
                    (Some(d), _) if d.truthy() => d.clone(),
                    (_, Some(t)) if t.truthy() => t.clone(),
                    _ => OJson::string(f),
                };
                let nullish = |v: Option<&OJson>| v.cloned().unwrap_or(OJson::Null);
                let mut o = OJson::new_object();
                o.set("pikkuFuncId", OJson::string(&tool_name));
                o.set("name", OJson::string(&tool_name));
                o.set("description", description);
                o.set("inputSchema", nullish(fm.get("inputSchemaName")));
                o.set("outputSchema", nullish(fm.get("outputSchemaName")));
                if let Some(tags) = fm.get("tags") {
                    o.set("tags", tags.clone());
                }
                if !surface.is_empty() {
                    o.set("surface", OJson::string(&surface));
                }
                // The addon's meta is JSON; a field of the wrong type would be a
                // broken package, so the tool is decoded rather than built field
                // by field.
                let decoded = o.raw().value().and_then(|v| MCPToolMeta::deserialize(v).ok());
                let Some(mut tool) = decoded else {
                    self.log.debug(format!("Skipping MCP tool {tool_name}: invalid tool metadata"));
                    continue;
                };
                tool.from_addon = true;
                self.state.mcp_endpoints.tools_meta.set(tool_name, tool);
            }
        }
        for f in selected {
            if !meta.has(f) {
                self.log.critical(
                    codes::ADDON_MCP_FUNCTION_NOT_FOUND,
                    format!("wireAddon('{ns}') lists '{f}' under mcp, but {} publishes no such function.", decl.pkg),
                );
            }
        }
    }

    /// The shared shape of the secrets / variables / credentials merges:
    /// resolve each entry's id through the instance's overrides, and add it
    /// unless the project already defines that id.
    fn merge_addon_definitions(
        &mut self,
        req: &AddonResolver,
        id: &str,
        which: Definitions,
        overrides: Option<&Record<OJson>>,
        id_field: &str,
        kind: &str,
        pkg: &str,
    ) {
        let Some(meta) = read_resolved_json(req, id) else { return };
        let OJson::Obj(entries) = &meta else { return };
        for (key, def) in entries.iter() {
            let key_value = OJson::string(key);
            let mut logical = key_value.clone();
            if id_field != "name" {
                logical = OJson::nullish_or(def.get(id_field), &key_value).clone();
            }
            let mut resolved = logical.clone();
            if let Some(ov) = overrides
                && let Some(ls) = logical.str()
                && let Some(o) = ov.get(ls)
            {
                resolved = OJson::nullish_or(Some(o), &logical).clone();
            }
            let defs = match which {
                Definitions::Secrets => &mut self.state.secrets.definitions,
                Definitions::Variables => &mut self.state.variables.definitions,
                Definitions::Credentials => &mut self.state.credentials.definitions,
            };
            let taken = defs.iter().any(|d| {
                let d = ojson_of_raw(d);
                let mut have = d.as_ref().and_then(|d| d.get("name"));
                if id_field != "name" {
                    have = d.as_ref().and_then(|d| d.get(id_field)).filter(|v| !matches!(v, OJson::Null)).or(have);
                }
                is_definition_match(have, &resolved)
            });
            if taken {
                continue;
            }
            let mut entry = def.clone();
            if !entry.is_object() {
                entry = OJson::new_object();
            }
            entry.set(id_field, resolved.clone());
            defs.push(entry.raw());
            self.log.debug(format!("Loaded addon {kind} '{}' from {pkg}", resolved.str().unwrap_or("")));
        }
    }

    fn load_addon_secrets(&mut self, decl: &AddonDecl, req: &AddonResolver) {
        self.merge_addon_definitions(
            req,
            &format!("{}/.pikku/secrets/pikku-secrets-meta.gen.json", decl.pkg),
            Definitions::Secrets,
            decl.secret_overrides.as_ref(),
            "secretId",
            "secret",
            &decl.pkg,
        );
    }

    fn load_addon_variables(&mut self, decl: &AddonDecl, req: &AddonResolver) {
        self.merge_addon_definitions(
            req,
            &format!("{}/.pikku/variables/pikku-variables-meta.gen.json", decl.pkg),
            Definitions::Variables,
            decl.variable_overrides.as_ref(),
            "variableId",
            "variable",
            &decl.pkg,
        );
    }

    fn load_addon_credentials(&mut self, decl: &AddonDecl, req: &AddonResolver) {
        self.merge_addon_definitions(
            req,
            &format!("{}/.pikku/credentials/pikku-credentials-meta.gen.json", decl.pkg),
            Definitions::Credentials,
            decl.credential_overrides.as_ref(),
            "name",
            "credential",
            &decl.pkg,
        );
    }

    /// Reads serverlessIncompatible and requiredParentServices from the addon
    /// meta, falling back to the generated services module.
    fn load_addon_services(&mut self, ns: &str, decl: &AddonDecl, req: &AddonResolver) {
        let mut loaded_parent = false;
        if let Some(meta) = read_resolved_json(req, &format!("{}/.pikku/console/pikku-addon-meta.gen.json", decl.pkg)) {
            if let Some(si @ OJson::Arr(a)) = meta.get("serverlessIncompatible")
                && !a.is_empty()
            {
                self.state.addon_serverless_incompatible.set(ns, si.string_members());
            }
            if let Some(rp @ OJson::Arr(a)) = meta.get("requiredParentServices")
                && !a.is_empty()
            {
                self.state.addon_required_parent_services.extend(rp.string_members());
                loaded_parent = true;
            }
        }
        if loaded_parent {
            return;
        }
        let Some(path) = req.resolve(&format!("{}/.pikku/pikku-services.gen.js", decl.pkg)) else { return };
        if let Some(services) = read_required_parent_services(&path) {
            self.state.addon_required_parent_services.extend(services);
        }
    }

    fn load_addon_webhook_sources(&mut self, ns: &str, decl: &AddonDecl, req: &AddonResolver) {
        let Some(raw) = read_resolved_json(req, &format!("{}/.pikku/webhooks/pikku-webhook-sources-meta.gen.json", decl.pkg))
        else {
            return;
        };
        let sources = namespace_addon_webhook_sources(&raw, ns);
        for (name, source) in sources.iter() {
            let wsm = self.state.triggers.webhook_source_meta.get_or_insert_with(Record::new);
            if wsm
                .get(name)
                .is_some_and(|e| !e.is_empty() && e.value() != Some(&serde_json::Value::Null))
            {
                continue;
            }
            wsm.set(name, source.raw());
            for step in WEBHOOK_SOURCE_STEPS {
                if let Some(id) = source.get(step).and_then(OJson::str).filter(|i| !i.is_empty()) {
                    self.state.service_aggregation.used_functions.add(id);
                }
            }
        }
    }

    fn load_addon_contracts(&mut self, ns: &str, decl: &AddonDecl, req: &AddonResolver) {
        if let Some(mut c) = read_resolved_json(req, &format!("{}/.pikku/http/pikku-http-contracts-meta.gen.json", decl.pkg))
            && apply_package_to_http_contracts(&mut c, &decl.pkg, ns).is_ok()
        {
            self.state.exported_contracts.addon_http.set(ns, c.raw());
        }
        if let Some(mut c) = read_resolved_json(req, &format!("{}/.pikku/cli/pikku-cli-contracts-meta.gen.json", decl.pkg))
            && apply_package_to_cli_contracts(&mut c, &decl.pkg, ns).is_ok()
        {
            self.state.exported_contracts.addon_cli.set(ns, c.raw());
        }
        if let Some(mut c) = read_resolved_json(req, &format!("{}/.pikku/channel/pikku-channel-contracts-meta.gen.json", decl.pkg))
            && apply_package_to_channel_contracts(&mut c, &decl.pkg, ns).is_ok()
        {
            self.state.exported_contracts.addon_channel.set(ns, c.raw());
        }
    }
}

#[derive(Clone, Copy)]
enum Definitions {
    Secrets,
    Variables,
    Credentials,
}

#[cfg(test)]
pub(crate) mod tests {
    use super::super::addon_dependencies::{AddonDependency, DependencyForm, read_addon_dependencies};
    use super::super::addon_resolve::{resolve_exports_for_test, split_package_specifier};
    use super::*;
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};

    pub(crate) fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("pikku-rs-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    pub(crate) fn write_files(root: &Path, files: &[(&str, &str)]) {
        for (p, content) in files {
            let full = root.join(p);
            std::fs::create_dir_all(full.parent().unwrap()).unwrap();
            std::fs::write(full, content).unwrap();
        }
    }

    fn oj(s: &str) -> OJson {
        parse_ojson(s.as_bytes()).unwrap()
    }

    fn real(root: &Path, p: &str) -> String {
        std::fs::canonicalize(root.join(p)).unwrap().to_string_lossy().into_owned()
    }

    #[test]
    fn ojson_round_trip_keeps_key_order() {
        let input = r#"{"z":1,"a":{"y":[1,"two",null,true],"b":{}},"m":[],"s":"<&>"}"#;
        let v = oj(input);
        assert_eq!(v.stringify(), input);
        let mut c = v.clone();
        c.get_mut("a").unwrap().set("y", OJson::string("changed"));
        c.set("new", OJson::string("x"));
        assert_eq!(v.stringify(), input, "clone shares state with the original");
        assert_eq!(c.stringify(), r#"{"z":1,"a":{"y":"changed","b":{}},"m":[],"s":"<&>","new":"x"}"#);
    }

    #[test]
    fn ojson_truthy_matches_js() {
        for (input, want) in [
            (r#""""#, false), (r#""x""#, true), ("0", false), ("1", true), ("null", false),
            ("false", false), ("true", true), ("[]", true), ("{}", true),
        ] {
            assert_eq!(oj(input).truthy(), want, "truthy({input})");
        }
        assert_eq!(oj(r#"["a",1,"b"]"#).string_members(), ["a", "b"]);
    }

    #[test]
    fn splits_package_specifiers_like_go() {
        for (input, want) in [
            ("pkg", ("pkg", "")),
            ("pkg/a/b.json", ("pkg", "a/b.json")),
            ("@scope/pkg", ("@scope/pkg", "")),
            ("@scope/pkg/.pikku/x.js", ("@scope/pkg", ".pikku/x.js")),
        ] {
            assert_eq!(split_package_specifier(input), (want.0.to_string(), want.1.to_string()), "{input}");
        }
    }

    #[test]
    fn resolve_exports_picks_exact_then_longest_pattern() {
        let exports = oj(r#"{
            ".": {"import": "./esm/index.js", "require": "./cjs/index.js"},
            "./package.json": "./package.json",
            "./.pikku/*": "./dist/.pikku/*",
            "./.pikku/function/*": {"types": "./x.d.ts", "default": "./fn/*"},
            "./private/*": null,
            "./fallback": ["./nope", {"node": "./fb.js"}]
        }"#);
        for (target, want) in [
            (".", "./cjs/index.js"),
            ("./package.json", "./package.json"),
            ("./.pikku/http/meta.gen.json", "./dist/.pikku/http/meta.gen.json"),
            ("./.pikku/function/a.gen.json", "./fn/a.gen.json"), // longest prefix wins
            ("./private/x", ""),
            ("./fallback", "./nope"),
            ("./unlisted", ""),
        ] {
            assert_eq!(resolve_exports_for_test(&exports, target), want, "resolveExports({target})");
        }
        let sugar = oj(r#"{"require": "./main.js"}"#);
        assert_eq!(resolve_exports_for_test(&sugar, "."), "./main.js");
        assert_eq!(resolve_exports_for_test(&sugar, "./sub"), "", "conditions sugar exposes only '.'");
        assert_eq!(resolve_exports_for_test(&oj(r#""./only.js""#), "."), "./only.js");
    }

    #[test]
    fn resolve_package_subpath_walks_node_modules() {
        let root = temp_dir("resolve-subpath");
        write_files(&root, &[
            ("node_modules/@s/with-exports/package.json", r#"{"exports": {"./.pikku/*": "./dist/.pikku/*"}}"#),
            ("node_modules/@s/with-exports/dist/.pikku/a.json", "{}"),
            ("node_modules/@s/with-exports/.pikku/a.json", "{}"),
            ("node_modules/plain/package.json", r#"{"name": "plain"}"#),
            ("node_modules/plain/.pikku/b.json", "{}"),
            ("app/src/x.ts", ""),
            ("app/node_modules/plain/package.json", r#"{"name": "plain"}"#),
        ]);
        let app = root.join("app").to_string_lossy().into_owned();
        let r = root.to_string_lossy().into_owned();
        use super::super::addon_resolve::resolve_package_subpath as rps;
        assert_eq!(rps(&app, "@s/with-exports", ".pikku/a.json"), Some(real(&root, "node_modules/@s/with-exports/dist/.pikku/a.json")));
        assert_eq!(rps(&r, "@s/with-exports", "dist/.pikku/a.json"), None, "a subpath outside exports must not resolve");
        // The nearest node_modules/plain wins, even though the file is in a
        // farther one: node stops at the first package it finds.
        assert_eq!(rps(&app, "plain", ".pikku/b.json"), None);
        assert_eq!(rps(&r, "plain", ".pikku/b.json"), Some(real(&root, "node_modules/plain/.pikku/b.json")));
        assert_eq!(rps(&r, "missing", "x"), None);
        let resolver = AddonResolver(vec![root.join("nowhere").to_string_lossy().into_owned(), r]);
        assert_eq!(resolver.resolve("plain/.pikku/b.json"), Some(real(&root, "node_modules/plain/.pikku/b.json")));
        assert_eq!(resolver.resolve("plain/none.json"), None);
    }

    #[test]
    fn namespaces_addon_webhook_sources() {
        let one = namespace_addon_webhook_sources(
            &oj(r#"{"stripe": {"name": "stripe", "receive": "recv", "check": "other:fn", "events": ["a"]}}"#),
            "shop",
        );
        assert_eq!(
            crate::jsjson::to_string(&one).unwrap(),
            r#"{"shop":{"name":"shop","receive":"shop:recv","check":"other:fn","events":["a"],"route":"/webhooks/shop"}}"#
        );
        let many = namespace_addon_webhook_sources(
            &oj(r#"{"a": {"name": "stripe", "setup": "s"}, "b": {"name": "connect", "teardown": ""}, "c": 5}"#),
            "shop",
        );
        assert_eq!(
            crate::jsjson::to_string(&many).unwrap(),
            r#"{"shop-stripe":{"name":"shop-stripe","setup":"shop:s","route":"/webhooks/shop-stripe"},"shop-connect":{"name":"shop-connect","teardown":"","route":"/webhooks/shop-connect"}}"#
        );
    }

    #[test]
    fn applies_package_to_http_contracts() {
        let mut c = oj(r#"{"routes": {"basePath": "/x", "routes": {
            "a": {"method": "get", "route": "/a", "func": {"pikkuFuncId": "a"}},
            "b": {"method": "get", "route": "/b", "func": {"pikkuFuncId": "other:b", "packageName": "@kept"}},
            "group": {"routes": {"c": {"method": "post", "route": "/c", "func": {"pikkuFuncId": "c"}}}},
            "nested": {"d": {"method": "post", "route": "/d", "func": {"pikkuFuncId": "d"}}},
            "skip": "not an object"
        }}}"#);
        assert!(apply_package_to_http_contracts(&mut c, "@pkg", "ns").is_ok());
        let r = c.get("routes").unwrap().get("routes").unwrap();
        let check = |f: &OJson, id: &str, pkg: &str| {
            assert_eq!(f.get("pikkuFuncId").and_then(OJson::str), Some(id));
            assert_eq!(f.get("packageName").and_then(OJson::str), Some(pkg));
        };
        check(r.get("a").unwrap().get("func").unwrap(), "ns:a", "@pkg");
        check(r.get("b").unwrap().get("func").unwrap(), "other:b", "@kept");
        check(r.get("group").unwrap().get("routes").unwrap().get("c").unwrap().get("func").unwrap(), "ns:c", "@pkg");
        check(r.get("nested").unwrap().get("d").unwrap().get("func").unwrap(), "ns:d", "@pkg");

        let mut no_ns = oj(r#"{"r": {"routes": {"a": {"method": "get", "route": "/a", "func": {"pikkuFuncId": "a"}}}}}"#);
        assert!(apply_package_to_http_contracts(&mut no_ns, "@pkg", "").is_ok());
        check(no_ns.get("r").unwrap().get("routes").unwrap().get("a").unwrap().get("func").unwrap(), "a", "@pkg");

        for bad in [
            r#"{"r": null}"#,
            r#"{"r": {"routes": {"a": {"method": "get", "route": "/a", "func": "x"}}}}"#,
            r#"{"r": {"routes": {"a": {"method": "get", "route": "/a", "func": {"pikkuFuncId": 1}}}}}"#,
        ] {
            assert!(apply_package_to_http_contracts(&mut oj(bad), "@pkg", "ns").is_err(), "{bad}");
        }
    }

    #[test]
    fn applies_package_to_cli_contracts() {
        let mut c = oj(r#"{"tool": {
            "run": {"pikkuFuncId": "run", "subcommands": {"deep": {"pikkuFuncId": "deep"}}},
            "ext": {"pikkuFuncId": "x:ext"},
            "group": {"subcommands": {"leaf": {"pikkuFuncId": "leaf", "packageName": "@kept"}}}
        }}"#);
        assert!(apply_package_to_cli_contracts(&mut c, "@pkg", "ns").is_ok());
        assert_eq!(
            c.stringify(),
            r#"{"tool":{"run":{"pikkuFuncId":"ns:run","subcommands":{"deep":{"pikkuFuncId":"ns:deep","packageName":"@pkg"}},"packageName":"@pkg"},"ext":{"pikkuFuncId":"x:ext","packageName":"@pkg"},"group":{"subcommands":{"leaf":{"pikkuFuncId":"ns:leaf","packageName":"@kept"}}}}}"#
        );
        assert!(apply_package_to_cli_contracts(&mut oj(r#"{"tool": null}"#), "@pkg", "ns").is_err());
    }

    #[test]
    fn applies_package_to_channel_contracts() {
        let mut c = oj(r#"{"chat": {"send": {"pikkuFuncId": "send"}, "ext": {"pikkuFuncId": "x:ext", "packageName": "@kept"}}}"#);
        assert!(apply_package_to_channel_contracts(&mut c, "@pkg", "ns").is_ok());
        assert_eq!(
            c.stringify(),
            r#"{"chat":{"send":{"pikkuFuncId":"ns:send","packageName":"@pkg"},"ext":{"pikkuFuncId":"x:ext","packageName":"@kept"}}}"#
        );
        for bad in [r#"{"chat": null}"#, r#"{"chat": {"send": "x"}}"#, r#"{"chat": {"send": {}}}"#] {
            assert!(apply_package_to_channel_contracts(&mut oj(bad), "@pkg", "ns").is_err(), "{bad}");
        }
    }

    #[test]
    fn reads_required_parent_services() {
        let dir = temp_dir("required-parent");
        let write = |name: &str, content: &str| {
            let p = dir.join(name);
            std::fs::write(&p, content).unwrap();
            p.to_string_lossy().into_owned()
        };
        let cases: [(&str, Option<Vec<&str>>); 6] = [
            ("export const other = 1\nexport const requiredParentServices = [\"a\", \"b\"]\n", Some(vec!["a", "b"])),
            ("export const requiredParentServices = [\n  \"a\",\n  \"b\"\n]\n", Some(vec!["a", "b"])),
            ("export const requiredParentServices = []\n", Some(vec![])),
            // The TS imports the module; Go reads it with a regex, so it only
            // understands the shape codegen writes (JSON at the start of a line).
            ("export const requiredParentServices = ['single']\n", None),
            ("  export const requiredParentServices = [\"indented\"]\n", None),
            ("export const somethingElse = [\"a\"]\n", None),
        ];
        for (i, (content, want)) in cases.iter().enumerate() {
            let got = read_required_parent_services(&write("s.js", content));
            assert_eq!(got, want.as_ref().map(|w| w.iter().map(|s| s.to_string()).collect()), "case {i}");
        }
        assert_eq!(read_required_parent_services(&dir.join("missing.js").to_string_lossy()), None);
    }

    #[test]
    fn reads_addon_dependencies() {
        let root = temp_dir("addon-deps");
        write_files(&root, &[
            ("node_modules/@s/addon/package.json", r#"{"pikku": {"uses": ["email", 3, "db"]}}"#),
            ("node_modules/@s/deps/package.json", r#"{"pikku": {"uses": {"stripe": "@acme/addon-stripe@^0.12.0", "crm": "@acme/crm", "bad:x": "@a/b@^1.0.0", "n": 12}}}"#),
            ("node_modules/none/package.json", "{}"),
        ]);
        let dir = |pkg: &str| root.join("node_modules").join(pkg).to_string_lossy().into_owned();
        let list = read_addon_dependencies(&dir("@s/addon"));
        assert_eq!((list.declared_names(), list.form), ( vec!["email".to_string(), "db".into()], DependencyForm::List));
        assert_eq!(read_addon_dependencies(&dir("none")).form, DependencyForm::None);
        assert_eq!(read_addon_dependencies(&dir("absent")).form, DependencyForm::None);
        let got = read_addon_dependencies(&dir("@s/deps"));
        assert_eq!(got.form, DependencyForm::Map);
        assert_eq!(got.dependencies, vec![AddonDependency { alias: "stripe".into(), pkg: "@acme/addon-stripe".into(), rng: "^0.12.0".into() }]);
        assert_eq!(got.invalid, [
            "pikku.uses.crm is '@acme/crm', which has no version range. Write '@acme/crm@^1.0.0': the app that wires this addon is checked against it.",
            "pikku.uses names 'bad:x', which is not a valid alias. An alias starts with a letter and holds only letters, digits, '-' and '_'.",
            "pikku.uses.n must be a string '<package>@<range>', got 12.",
        ]);
    }

    #[test]
    fn detects_legacy_contributors() {
        let root = temp_dir("legacy-contrib");
        write_files(&root, &[
            ("node_modules/legacy/package.json", r#"{"pikku": {"contributors": ["./x.js"]}}"#),
            ("node_modules/clean/package.json", r#"{"pikku": {"uses": ["db"]}}"#),
            ("app/package.json", "{}"),
        ]);
        let dirs = vec![root.join("app").to_string_lossy().into_owned()];
        assert!(has_legacy_contributors(&dirs, "legacy"));
        assert!(!has_legacy_contributors(&dirs, "clean"));
        assert!(!has_legacy_contributors(&dirs, "absent"));
    }

    #[test]
    fn loads_addon_scopes() {
        let dir = temp_dir("addon-scopes");
        write_files(&dir, &[
            ("node_modules/@acme/addon/package.json", r#"{"name":"@acme/addon"}"#),
            ("node_modules/@acme/addon/.pikku/scopes/pikku-scopes-meta.gen.json", r#"{
                "acme": {"name":"acme","origin":{"kind":"addon","package":"@acme/raw","displayName":"Acme"},"scopes":{"read":{}}},
                "plain": {"name":"plain","origin":{"kind":"app"}},
                "taken": {"name":"taken"}
            }"#),
        ]);
        let mut state = State::default();
        let mut log = Logger::new();
        state.scopes.definitions = vec![Raw::of(serde_json::json!({"name": "taken"}))];
        let mut l = Loader { state: &mut state, log: &mut log, root_dir: "/" };
        l.load_addon_scopes(&AddonDecl { pkg: "@acme/addon".into(), ..Default::default() }, &dir.to_string_lossy());
        let got: Vec<String> = state.scopes.definitions.iter().map(|d| crate::jsjson::to_string(d).unwrap()).collect();
        assert_eq!(got, [
            r#"{"name":"taken"}"#,
            r#"{"name":"acme","origin":{"kind":"addon","package":"@acme/addon","displayName":"Acme"},"scopes":{"read":{}}}"#,
            r#"{"name":"plain","origin":{"kind":"addon","package":"@acme/addon"}}"#,
        ]);
    }

    #[test]
    fn wire_declarations_round_trip_to_typed_decls() {
        let mut state = State::default();
        let raw = |s: &str| Raw::of(serde_json::from_str(s).unwrap());
        state.rpc.wire_addon_declarations.set("a", raw(r#"{"package":"@s/a","file":"/x/a.ts","mcp":["f"],"mcpEndpoint":true,"expose":true,"uses":{"db":"main"},"scopes":["s1"],"contributors":["c"],"ui":true}"#));
        state.rpc.wire_addon_declarations.set("r", raw(r#"{"package":"@s/r","range":"^1.0.0","file":"/x/r.ts","remote":true,"hasAuth":false,"local":{"package":"@s/l","ui":true,"contributors":["c2"]}}"#));
        let decls: HashMap<String, AddonDecl> = declared_addons(&state).into_iter().collect();
        let a = &decls["a"];
        assert_eq!((a.pkg.as_str(), a.ui, a.mcp.clone(), a.mcp_endpoint.clone(), a.expose.clone()), ("@s/a", true, Flex::List(vec!["f".into()]), Endpoint::Bool(true), Flex::Bool(true)));
        assert_eq!(a.uses.as_ref().unwrap().get("db").map(String::as_str), Some("main"));
        assert_eq!((a.scopes.clone(), a.contributors.clone()), (vec!["s1".to_string()], vec!["c".to_string()]));
        let r = &decls["r"];
        assert!(r.remote && r.rng == "^1.0.0");
        let l = r.local.as_ref().unwrap();
        assert_eq!((l.pkg.as_str(), l.ui, l.contributors.clone()), ("@s/l", true, vec!["c2".to_string()]));
        assert_eq!(declared_addons(&state).iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(), ["a", "r"]);
    }
}
