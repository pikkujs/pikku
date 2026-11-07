//! Port of `stubscan.go`: the stub scan of `pikku mocks`
//! (`packages/cli/src/functions/mocks/stub-scan.ts` up to `scanFrontend`).

use std::collections::HashMap;

use serde::Serialize;
use tsrs_ast::{
    Node, SourceFile, is_call_expression, is_export_declaration, is_identifier, is_import_declaration,
    is_named_exports, is_namespace_import, is_object_literal_expression, is_property_access_expression,
    is_property_assignment, is_shorthand_property_assignment, is_spread_assignment, is_string_literal,
};
use tsrs_core::tspath;
use tsrs_core::{CompilerOptions, ModuleKind, ModuleResolutionKind, P, ScriptKind, Tristate};
use tsrs_module::{DefaultResolver, ResolverOptions, new_resolver};

use super::NodeLit;
use super::files::{abs, clean, join};
use super::tsconfig::{SysHost, parse_config};
use super::{Lazy, for_each_child, is_string_literal_like, line_of, parse, start};

fn is_stub_hook(h: &str) -> bool {
    h == "usePikkuQueryStub" || h == "usePikkuMutationStub"
}
fn is_plain_hook(h: &str) -> bool {
    h == "usePikkuQuery" || h == "usePikkuMutation"
}

/// stub-scan.ts's HookCall: a StubCall when `stub`, a PlainCall otherwise.
#[derive(Serialize, Clone)]
pub struct HookCall {
    pub file: String,
    pub line: usize,
    pub hook: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rpc: Option<String>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub flag: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub problem: String,
    pub stub: bool,
}

#[derive(Serialize)]
pub struct FrontendCall {
    pub file: String,
    pub line: usize,
    pub hook: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rpc: Option<String>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub flag: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub problem: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendScan {
    pub stub_calls: Vec<FrontendCall>,
    pub plain_calls: Vec<FrontendCall>,
}

/// Says whether `name` imported from `specifier` reaches the client.
pub type ImportCheck<'a> = &'a mut dyn FnMut(&str, &str) -> bool;

fn literal_text(n: Option<P<Node>>) -> Option<String> {
    if is_string_literal_like(n) { Some(n.unwrap().lit().to_string()) } else { None }
}

fn property_name_text(name: P<Node>) -> Option<String> {
    if is_identifier(name) || is_string_literal(name) { Some(name.lit().to_string()) } else { None }
}

fn read_flag(options: Option<P<Node>>) -> (String, String) {
    let Some(options) = options else { return (String::new(), "no-flag".into()) };
    if !is_object_literal_expression(options) {
        return (String::new(), "flag-not-literal".into());
    }
    for prop in options.properties() {
        if is_property_assignment(*prop) {
            if let Some(name) = property_name_text(prop.name().unwrap()) {
                if name == "featureFlag" {
                    if let Some(f) = literal_text(prop.initializer()) {
                        if !f.is_empty() {
                            return (f, String::new());
                        }
                    }
                    return (String::new(), "flag-not-literal".into());
                }
            }
        } else if is_shorthand_property_assignment(*prop) {
            if prop.name().unwrap().text() == "featureFlag" {
                return (String::new(), "flag-not-literal".into());
            }
        } else if is_spread_assignment(*prop) {
            return (String::new(), "flag-not-literal".into());
        }
    }
    (String::new(), "no-flag".into())
}

struct ImportBinding {
    specifier: String,
    name: String,
    has_name: bool,
}

fn import_bindings(sf: P<SourceFile>) -> HashMap<String, ImportBinding> {
    let mut bindings = HashMap::new();
    for node in sf.statements().nodes() {
        if !is_import_declaration(*node) {
            continue;
        }
        let decl = node.as_import_declaration();
        let Some(clause) = decl.import_clause else { continue };
        if !is_string_literal(decl.module_specifier) {
            continue;
        }
        let specifier = decl.module_specifier.lit().to_string();
        if let Some(name) = clause.name() {
            bindings.insert(
                name.text().to_string(),
                ImportBinding { specifier: specifier.clone(), name: "default".into(), has_name: true },
            );
        }
        let Some(named) = clause.as_import_clause().named_bindings else { continue };
        if is_namespace_import(named) {
            bindings.insert(
                named.name().unwrap().text().to_string(),
                ImportBinding { specifier: specifier.clone(), name: String::new(), has_name: false },
            );
            continue;
        }
        for el in named.as_named_imports().elements.nodes() {
            let original = el.property_name().unwrap_or_else(|| el.name().unwrap());
            bindings.insert(
                el.name().unwrap().text().to_string(),
                ImportBinding { specifier: specifier.clone(), name: original.text().to_string(), has_name: true },
            );
        }
    }
    bindings
}

static JSX_FILE: Lazy = Lazy::new(r"\.[jt]sx$");

struct HookRef {
    name: String,
    hook: String,
    specifier: String,
}

/// `scanHooks`; `from_client` may be `None`.
pub fn scan_hooks(file: &str, text: &str, mut from_client: Option<ImportCheck<'_>>) -> Vec<HookCall> {
    let kind = if JSX_FILE.is_match(file) { ScriptKind::TSX } else { ScriptKind::TS };
    let sf = parse(file, text, kind);
    let bindings = import_bindings(sf);
    let hook_of = |callee: P<Node>| -> Option<HookRef> {
        if is_identifier(callee) {
            return match bindings.get(callee.text()) {
                None => Some(HookRef { name: callee.text().into(), hook: callee.text().into(), specifier: String::new() }),
                Some(b) if b.has_name => {
                    Some(HookRef { name: callee.text().into(), hook: b.name.clone(), specifier: b.specifier.clone() })
                }
                Some(_) => None,
            };
        }
        if is_property_access_expression(callee) {
            let name = callee.name().unwrap().text().to_string();
            let obj = callee.expression().unwrap();
            if is_identifier(obj) {
                if let Some(b) = bindings.get(obj.text()) {
                    if !b.has_name {
                        return Some(HookRef { name: name.clone(), hook: name, specifier: b.specifier.clone() });
                    }
                }
            }
            return Some(HookRef { name: name.clone(), hook: name, specifier: String::new() });
        }
        None
    };
    let mut calls = Vec::new();
    fn visit(
        n: P<Node>,
        sf: P<SourceFile>,
        file: &str,
        hook_of: &dyn Fn(P<Node>) -> Option<HookRef>,
        from_client: &mut Option<ImportCheck<'_>>,
        calls: &mut Vec<HookCall>,
    ) {
        if is_call_expression(n) {
            let found = hook_of(n.expression().unwrap());
            let stub = found.as_ref().is_some_and(|f| is_stub_hook(&f.hook));
            if let Some(found) = found {
                let eligible = stub || is_plain_hook(&found.hook);
                let reaches = found.specifier.is_empty()
                    || match from_client {
                        None => true,
                        Some(f) => f(&found.specifier, &found.hook),
                    };
                if eligible && reaches {
                    let args = n.arguments();
                    let rpc_arg = args.first().copied();
                    let options = args.get(1).copied();
                    let mut call = HookCall {
                        file: file.to_string(),
                        line: line_of(sf, start(n, sf)),
                        hook: found.name.clone(),
                        rpc: None,
                        flag: String::new(),
                        problem: String::new(),
                        stub,
                    };
                    call.rpc = literal_text(rpc_arg);
                    if stub {
                        let (f, p) = read_flag(options);
                        call.flag = f;
                        call.problem = p;
                    }
                    calls.push(call);
                }
            }
        }
        for_each_child(n, &mut |c| visit(c, sf, file, hook_of, from_client, calls));
    }
    visit(sf.as_node(), sf, file, &hook_of, &mut from_client, &mut calls);
    calls
}

static EXTENSION: Lazy = Lazy::new(r"(\.d)?\.[cm]?[jt]sx?$");

fn without_extension(file: &str) -> String {
    EXTENSION.get().replace(file, "").into_owned()
}

/// `fs.realpathSync`, falling back to `path.resolve`.
fn real_path(file: &str) -> String {
    let a = abs(file);
    std::fs::canonicalize(&a).map(|p| p.to_string_lossy().into_owned()).unwrap_or(a)
}

/// `clientImports`: whether an import resolves, through any chain of
/// re-exports, to the generated client module.
pub struct ClientImports {
    target: String,
    host: &'static SysHost,
    configs: HashMap<String, P<CompilerOptions>>,
    resolved: HashMap<String, Option<String>>,
    reaches: HashMap<String, bool>,
    resolvers: HashMap<(String, bool), DefaultResolver<'static>>,
}

impl ClientImports {
    pub fn new(client: &str) -> ClientImports {
        ClientImports {
            target: without_extension(&real_path(client)),
            host: SysHost::new(),
            configs: HashMap::new(),
            resolved: HashMap::new(),
            reaches: HashMap::new(),
            resolvers: HashMap::new(),
        }
    }

    fn find_config_file(&self, dir: &str) -> String {
        let mut dir = tspath::normalize_path(dir);
        loop {
            let candidate = tspath::combine_paths(&dir, &["tsconfig.json"]);
            if self.host.fs.file_exists(&candidate) {
                return candidate;
            }
            let parent = tspath::get_directory_path(&dir);
            if parent == dir {
                return String::new();
            }
            dir = parent;
        }
    }

    fn options_for(&mut self, dir: &str) -> (String, P<CompilerOptions>) {
        let config_path = self.find_config_file(dir);
        if let Some(o) = self.configs.get(&config_path) {
            return (config_path, *o);
        }
        let mut options = P::new(CompilerOptions::default());
        if !config_path.is_empty() {
            if let Some(parsed) = parse_config(&config_path, self.host) {
                if let Some(o) = parsed.compiler_options() {
                    options = o;
                }
            }
        }
        self.configs.insert(config_path.clone(), options);
        (config_path, options)
    }

    fn lookup(&mut self, specifier: &str, from: &str, config_path: &str, options: P<CompilerOptions>, bundler: bool) -> String {
        let key = (config_path.to_string(), bundler);
        let host = self.host;
        let resolver = self.resolvers.entry(key).or_insert_with(|| {
            let opts = if bundler {
                let mut b = (*options).clone();
                b.module = ModuleKind::ES_NEXT;
                b.module_resolution = ModuleResolutionKind::BUNDLER;
                b.allow_js = Tristate::True;
                P::new(b)
            } else {
                options
            };
            new_resolver(ResolverOptions::new(host, opts))
        });
        match resolver.resolve_module_name(specifier, &tspath::normalize_path(from), ModuleKind::NONE, None) {
            Ok((m, _)) if m.is_resolved() => m.resolved_file_name.to_string(),
            _ => String::new(),
        }
    }

    fn resolve_from(&mut self, from: &str, specifier: &str) -> Option<String> {
        let dir = std::path::Path::new(from).parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        let dir = if dir.is_empty() { ".".to_string() } else { dir };
        let key = format!("{dir}\0{specifier}");
        if let Some(r) = self.resolved.get(&key) {
            return r.clone();
        }
        let (config_path, options) = self.options_for(&dir);
        let mut found = self.lookup(specifier, from, &config_path, options, false);
        if found.is_empty() {
            found = self.lookup(specifier, from, &config_path, options, true);
        }
        if found.is_empty() {
            self.resolved.insert(key, None);
            return None;
        }
        let real = real_path(&found);
        self.resolved.insert(key, Some(real.clone()));
        Some(real)
    }

    fn reaches_client(&mut self, file: &str, name: &str) -> bool {
        if without_extension(file) == self.target {
            return true;
        }
        let key = format!("{file}\0{name}");
        if let Some(v) = self.reaches.get(&key) {
            return *v;
        }
        self.reaches.insert(key.clone(), false);
        let Ok(text) = std::fs::read(file) else { return false };
        let text = String::from_utf8_lossy(&text).into_owned();
        let sf = parse(file, &text, ScriptKind::Unknown);
        let mut found = false;
        for node in sf.statements().nodes() {
            if !is_export_declaration(*node) {
                continue;
            }
            let decl = node.as_export_declaration();
            let Some(spec) = decl.module_specifier else { continue };
            if !is_string_literal(spec) {
                continue;
            }
            let mut original = String::new();
            match decl.export_clause {
                None => original = name.to_string(),
                Some(clause) if is_named_exports(clause) => {
                    for el in clause.as_named_exports().elements.nodes() {
                        if el.name().unwrap().text() == name {
                            original = match el.property_name() {
                                Some(pn) => pn.text().to_string(),
                                None => el.name().unwrap().text().to_string(),
                            };
                            break;
                        }
                    }
                }
                _ => {}
            }
            if original.is_empty() {
                continue;
            }
            match self.resolve_from(file, &spec.lit()) {
                None => {
                    found = true;
                    break;
                }
                Some(next) => {
                    if self.reaches_client(&next, &original) {
                        found = true;
                        break;
                    }
                }
            }
        }
        self.reaches.insert(key, found);
        found
    }

    /// The import check for imports made by `from`.
    pub fn check(&mut self, from: &str, specifier: &str, name: &str) -> bool {
        match self.resolve_from(from, specifier) {
            None => true,
            Some(file) => self.reaches_client(&file, name),
        }
    }
}

/// Go `filepath.Rel` for absolute, clean paths.
fn rel(base: &str, target: &str) -> Option<String> {
    let b: Vec<&str> = base.split('/').filter(|s| !s.is_empty()).collect();
    let t: Vec<&str> = target.split('/').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < b.len() && i < t.len() && b[i] == t[i] {
        i += 1;
    }
    let mut parts: Vec<&str> = vec![".."; b.len() - i];
    parts.extend_from_slice(&t[i..]);
    if parts.is_empty() { Some(".".into()) } else { Some(parts.join("/")) }
}

/// node's `path.resolve`.
fn resolve_path(segments: &[&str]) -> String {
    let mut out = String::new();
    for s in segments {
        if s.starts_with('/') {
            out = s.to_string();
        } else {
            out = join(&out, s);
        }
    }
    abs(&out)
}

pub fn scan_frontend(root_dir: &str, files: &[String], client: &str) -> FrontendScan {
    let mut scan = FrontendScan { stub_calls: vec![], plain_calls: vec![] };
    let mut imports = if client.is_empty() { None } else { Some(ClientImports::new(&resolve_path(&[root_dir, client]))) };
    let abs_root = resolve_path(&[root_dir]);
    for file in files {
        let Ok(bytes) = std::fs::read(file) else { continue };
        let text = String::from_utf8_lossy(&bytes).into_owned();
        // Go reads the bytes as is; a lossy decode only differs on invalid UTF-8
        if !text.contains("usePikku") {
            continue;
        }
        let rel_path = match rel(&abs_root, &resolve_path(&[file])) {
            Some(r) if r != "." => r,
            _ => String::new(),
        };
        let calls = match imports.as_mut() {
            Some(imp) => {
                let f = file.clone();
                let mut check = move |spec: &str, name: &str| imp.check(&f, spec, name);
                scan_hooks(&rel_path, &text, Some(&mut check))
            }
            None => scan_hooks(&rel_path, &text, None),
        };
        for call in calls {
            let entry = FrontendCall {
                file: call.file,
                line: call.line,
                hook: call.hook,
                rpc: call.rpc,
                flag: call.flag,
                problem: call.problem,
            };
            if call.stub {
                scan.stub_calls.push(entry);
            } else {
                scan.plain_calls.push(entry);
            }
        }
    }
    let _ = clean;
    scan
}
