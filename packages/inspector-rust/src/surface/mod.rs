//! Port of Go `internal/surface`: `@pikku/inspector`'s
//! `surface/collect-surface.ts`: the public symbols a package (or an
//! application's `#pikku/*` leaves) exports, with their kind, documentation,
//! signature and option keys.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use serde_json::{Map, Value};
use tsrs_ast::{Kind, Node, SourceFile, Symbol, SymbolFlags, get_source_file_of_node};
use tsrs_checker::{Checker, SignatureKind, Type};
use tsrs_compiler::{CheckerHandle, CompilerHost, Program, ProgramOptions, new_compiler_host, new_program};
use tsrs_core::tspath::{self, ComparePathsOptions};
use tsrs_core::{
    CompilerOptions, Context, ModuleKind, ModuleResolutionKind, P, ScriptKind, ScriptTarget, Tristate,
};
use tsrs_tsoptions as tsoptions;
use tsrs_vfs::{FS, bundled, osvfs};

use crate::helpers::Error;
use crate::sourcescan::files::{abs, clean, exists, join};
use crate::sourcescan::tsconfig::{SysHost, parse_config};
use crate::sourcescan::{JS_WHITESPACE, Lazy, js_trim, parse, start};

mod jsdoc;
mod pkgjson;
mod print;
mod quotes;

use jsdoc::{TagInfo, documentation_comment, jsdoc_comments_and_tags, jsdoc_tags_of_symbol, text_of_jsdoc_comment};
use print::symbol_name;

#[derive(Serialize, Clone)]
pub struct Member {
    pub line: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub doc: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolOut {
    pub name: String,
    pub kind: String,
    pub declared_at: String,
    pub declared_in: Option<String>,
    pub deprecated: bool,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub deprecated_reason: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub summary: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub docs: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub signature: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub members: Vec<Member>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub examples: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entrypoint {
    pub subpath: String,
    pub specifier: String,
    pub entry_file: String,
    pub symbols: Vec<SymbolOut>,
}

/// One entry of the snippets Map, in its insertion order.
pub struct Snippet {
    pub name: String,
    pub code: String,
}

#[derive(Default)]
pub struct Options {
    pub imports_subpath: String,
    /// Restricts collection when `Some`.
    pub subpaths: Option<Vec<String>>,
    /// `None` when no map was given.
    pub snippets: Option<Vec<Snippet>>,
}

/// collect-surface.ts's UnknownSnippetError.
pub struct UnknownSnippetError {
    pub message: String,
}

pub enum CollectError {
    UnknownSnippet(UnknownSnippetError),
    Other(String),
}

const SOURCE_EXTENSIONS: &[&str] = &[".ts", ".tsx", ".mts", ".cts"];
const MODULE_EXTENSIONS: &[&str] = &[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

static DECLARATION_EXT: Lazy = Lazy::new(r"\.d\.(ts|mts|cts)$");
static NON_CODE_TARGET: Lazy = Lazy::new(r"\.(css|scss|json|svg|png|woff2?|txt|md)$");
static DOT_SLASH: Lazy = Lazy::new(r"^\./");
static COMPILED_EXT: Lazy = Lazy::new(r"\.(js|jsx|mjs|cjs)$");
static EMITTED_DECL_TS: Lazy = Lazy::new(r"\.d\.([cm]?ts)$");

fn wildcard_stem(file_name: &str) -> Option<String> {
    if file_name.ends_with(".map") || DECLARATION_EXT.is_match(file_name) {
        return None;
    }
    MODULE_EXTENSIONS.iter().find(|e| file_name.ends_with(*e)).map(|e| file_name[..file_name.len() - e.len()].to_string())
}

/// path.join for the relative, '/'-separated paths it is given here.
fn pjoin(parts: &[&str]) -> String {
    let mut out = String::new();
    for p in parts {
        out = if out.is_empty() { clean(p) } else { join(&out, p) };
    }
    out
}

fn source_for_target(package_dir: &str, target: &str, out_dir: &str) -> Option<String> {
    let without_prefix = DOT_SLASH.get().replace(target, "").into_owned();
    let is_declaration = DECLARATION_EXT.is_match(&without_prefix);
    if !is_declaration {
        for ext in SOURCE_EXTENSIONS {
            if without_prefix.ends_with(ext) {
                return if exists(&pjoin(&[package_dir, &without_prefix])) { Some(without_prefix) } else { None };
            }
        }
    }
    let mut stripped = without_prefix.clone();
    let prefix = format!("{out_dir}/");
    if without_prefix.starts_with(&prefix) {
        stripped = without_prefix[out_dir.len() + 1..].to_string();
    }
    let base = COMPILED_EXT.get().replace(&DECLARATION_EXT.get().replace(&stripped, ""), "").into_owned();
    let without_src = base.strip_prefix("src/").unwrap_or(&base).to_string();
    for ext in SOURCE_EXTENSIONS {
        let candidates = [
            pjoin(&["src", &format!("{base}{ext}")]),
            format!("{base}{ext}"),
            pjoin(&["src", &format!("{without_src}{ext}")]),
            pjoin(&["src", &base, &format!("index{ext}")]),
            pjoin(&[&base, &format!("index{ext}")]),
        ];
        for candidate in candidates {
            if exists(&pjoin(&[package_dir, &candidate])) {
                return Some(candidate);
            }
        }
    }
    None
}

struct DeclaredSubpath {
    subpath: String,
    target: String,
}

fn expand_wildcard(package_dir: &str, subpath: &str, target: &str, out_dir: &str) -> Vec<DeclaredSubpath> {
    let no_prefix = DOT_SLASH.get().replace(target, "").into_owned();
    let target_dir = no_prefix.splitn(2, '*').next().unwrap_or("").to_string();
    let suffix = &target[target.find('*').unwrap() + 1..];
    let suffix_stem = wildcard_stem(suffix).unwrap_or_else(|| suffix.to_string());
    let mut scan_dir = target_dir.clone();
    let prefix = format!("{out_dir}/");
    if !exists(&pjoin(&[package_dir, &target_dir])) && target_dir.starts_with(&prefix) {
        scan_dir = target_dir[out_dir.len() + 1..].to_string();
    }
    let absolute = pjoin(&[package_dir, &scan_dir]);
    if !exists(&absolute) {
        return vec![];
    }
    let mut expanded = Vec::new();
    fn walk(dir: &str, prefix: &str, scan_dir: &str, subpath: &str, suffix_stem: &str, out: &mut Vec<DeclaredSubpath>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        // os.ReadDir sorts by file name
        let mut entries: Vec<_> = rd.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                walk(&join(dir, &name), &format!("{prefix}{name}/"), scan_dir, subpath, suffix_stem, out);
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            let Some(stem) = wildcard_stem(&name) else { continue };
            let relative_path = format!("{prefix}{name}");
            let path_stem = format!("{prefix}{stem}");
            if !suffix_stem.is_empty() && !path_stem.ends_with(suffix_stem) {
                continue;
            }
            let captured = if suffix_stem.is_empty() { path_stem.clone() } else { path_stem[..path_stem.len() - suffix_stem.len()].to_string() };
            if captured.is_empty() {
                continue;
            }
            out.push(DeclaredSubpath { subpath: subpath.replacen('*', &captured, 1), target: format!("{scan_dir}{relative_path}") });
        }
    }
    walk(&absolute, "", &scan_dir, subpath, &suffix_stem, &mut expanded);
    expanded
}

fn target_of(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => (!s.is_empty()).then(|| s.clone()),
        Value::Array(a) => a.iter().find_map(target_of),
        Value::Object(o) => {
            for key in ["types", "import", "default", "require"] {
                if let Some(c) = o.get(key) {
                    if let Some(t) = target_of(c) {
                        return Some(t);
                    }
                }
            }
            None
        }
        _ => None,
    }
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::String(s) => !s.is_empty(),
        Value::Bool(b) => *b,
        _ => true,
    }
}

fn subpath_map(exports: &Value) -> Vec<(String, Value)> {
    if let Value::String(_) = exports {
        return vec![(".".into(), exports.clone())];
    }
    if let Value::Object(o) = exports {
        if o.keys().any(|k| k.starts_with('.')) {
            return o.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        }
    }
    vec![(".".into(), exports.clone())]
}

fn read_compiler_options(package_dir: &str) -> (String, Option<P<CompilerOptions>>) {
    let config_path = pjoin(&[package_dir, "tsconfig.json"]);
    if !exists(&config_path) {
        return ("dist".into(), None);
    }
    let host = SysHost::new();
    let Some(parsed) = parse_config(&tspath::normalize_path(&config_path), host) else { return ("dist".into(), None) };
    let Some(opts) = parsed.compiler_options() else { return ("dist".into(), None) };
    let mut out_dir = "dist".to_string();
    if !opts.out_dir.is_empty() {
        if let Some(rel) = rel_path(package_dir, &opts.out_dir) {
            out_dir = rel;
        }
    }
    (out_dir, Some(opts))
}

/// Go `filepath.Rel` for absolute paths.
fn rel_path(base: &str, target: &str) -> Option<String> {
    let b = clean(base);
    let t = clean(target);
    let bp: Vec<&str> = b.split('/').filter(|s| !s.is_empty()).collect();
    let tp: Vec<&str> = t.split('/').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < bp.len() && i < tp.len() && bp[i] == tp[i] {
        i += 1;
    }
    let mut parts: Vec<&str> = vec![".."; bp.len() - i];
    parts.extend_from_slice(&tp[i..]);
    Some(if parts.is_empty() { ".".into() } else { parts.join("/") })
}

pub struct Session<'a> {
    pub c: CheckerHandle,
    pub prog: &'a Program,
    pub root: String,
    pub snippets: Option<Vec<Snippet>>,
}

pub fn first_decl(sym: Option<P<Symbol>>) -> Option<P<Node>> {
    sym.and_then(|s| s.declarations().first().copied())
}

static WHITESPACE_RUN: Lazy = Lazy::new(&WS_RUN_PATTERN);
const WS_RUN_PATTERN: &str = concat!("[", r"\t\n\x0b\x0c\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}", "]+");

pub fn collapse_whitespace(s: &str) -> String {
    WHITESPACE_RUN.get().replace_all(s, " ").into_owned()
}

static PARAGRAPH_BREAK: Lazy = Lazy::new(concat!(r"\n[", r"\t\n\x0b\x0c\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}", r"]*\n"));
static SNIPPET_REFERENCE: Lazy = Lazy::new(concat!(
    r"^snippet:[", r"\t\n\x0b\x0c\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}", r"]*([^",
    r"\t\n\x0b\x0c\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}", r"]+)$"
));

fn summary_of(doc: &str) -> String {
    if doc.is_empty() {
        return String::new();
    }
    let first = PARAGRAPH_BREAK.get().splitn(doc, 2).next().unwrap_or("");
    js_trim(&collapse_whitespace(first)).to_string()
}

fn is_reserved(name: &str) -> bool {
    let mut chars = name.chars();
    chars.next() == Some('\u{7f}') && !matches!(chars.next(), Some('@') | Some('#') | None)
}

const KIND_BY_FLAG: &[(SymbolFlags, &str)] = &[
    (SymbolFlags::Class, "class"),
    (SymbolFlags::Interface, "interface"),
    (SymbolFlags::RegularEnum.union(SymbolFlags::ConstEnum), "enum"),
    (SymbolFlags::Function, "function"),
    (SymbolFlags::TypeAlias, "type"),
    (SymbolFlags::Namespace, "namespace"),
];

impl Session<'_> {
    fn alias_target(&mut self, sym: P<Symbol>) -> P<Symbol> {
        if sym.flags().intersects(SymbolFlags::Alias) { self.c.get_aliased_symbol(sym) } else { sym }
    }

    fn kind_of(&mut self, sym: P<Symbol>) -> &'static str {
        let target = self.alias_target(sym);
        for (flag, kind) in KIND_BY_FLAG {
            if target.flags().intersects(*flag) {
                return kind;
            }
        }
        if target.flags().intersects(SymbolFlags::Variable) && !target.declarations().is_empty() {
            let t = self.c.get_type_of_symbol_at_location(target, Some(target.declarations()[0])).unwrap();
            if !self.c.get_signatures_of_type_exported(t, SignatureKind::Call).is_empty() {
                return "function";
            }
        }
        "const"
    }

    fn jsdoc_tags_of(&mut self, sym: P<Symbol>) -> Vec<TagInfo> {
        let own = jsdoc_tags_of_symbol(Some(sym), Some(&mut self.c));
        if !own.is_empty() {
            return own;
        }
        let target = self.alias_target(sym);
        jsdoc_tags_of_symbol(Some(target), Some(&mut self.c))
    }

    fn examples_of(&self, tags: &[TagInfo], symbol_name: &str) -> Result<Vec<String>, UnknownSnippetError> {
        let mut out = Vec::new();
        for tag in tags {
            if tag.name != "example" {
                continue;
            }
            let text = js_trim(&tag.text);
            if text.is_empty() {
                continue;
            }
            let m = SNIPPET_REFERENCE.get().captures(text);
            let (Some(m), Some(snippets)) = (m, self.snippets.as_ref()) else {
                out.push(text.to_string());
                continue;
            };
            let name = &m[1];
            match snippets.iter().find(|s| s.name == name) {
                Some(s) => out.push(s.code.clone()),
                None => {
                    let known: Vec<&str> = snippets.iter().map(|s| s.name.as_str()).collect();
                    return Err(UnknownSnippetError {
                        message: format!(
                            "The example on {symbol_name} names the snippet \"{name}\", which no template declares. Wrap the code you want shown in \"// @snippet start {name}\" / \"// @snippet end {name}\". Declared: {}.",
                            known.join(", ")
                        ),
                    });
                }
            }
        }
        Ok(out)
    }

    fn documentation_of(&mut self, sym: P<Symbol>) -> String {
        let mut targets = vec![sym];
        if sym.flags().intersects(SymbolFlags::Alias) {
            targets.push(self.c.get_aliased_symbol(sym));
        }
        for target in targets {
            let d = documentation_comment(Some(target), Some(&mut self.c), &mut HashSet::new());
            let doc = js_trim(&d);
            if !doc.is_empty() {
                return doc.to_string();
            }
        }
        export_declaration_documentation_of(sym)
    }

    fn declaration_file_of(&mut self, sym: P<Symbol>) -> Option<String> {
        let target = self.alias_target(sym);
        let decl = first_decl(Some(target)).or_else(|| first_decl(Some(sym)))?;
        let sf = get_source_file_of_node(decl)?;
        Some(sf.file_name().to_string())
    }

    fn type_of_symbol(&mut self, sym: P<Symbol>, kind: &str) -> Option<P<Type>> {
        if kind == "interface" || kind == "type" {
            return Some(self.c.get_declared_type_of_symbol_exported(sym));
        }
        let decl = first_decl(Some(sym))?;
        self.c.get_type_of_symbol_at_location(sym, Some(decl))
    }

    fn symbol(&mut self, sym: P<Symbol>, entry_file: &str) -> Result<SymbolOut, UnknownSnippetError> {
        let file = self.declaration_file_of(sym);
        let kind = self.kind_of(sym);
        let docs = self.documentation_of(sym);
        let tags = self.jsdoc_tags_of(sym);
        let name = symbol_name(sym);
        let target = self.alias_target(sym);
        let t = self.type_of_symbol(target, kind);
        let location = first_decl(Some(target));
        let examples = self.examples_of(&tags, &name)?;
        let members = match t {
            Some(t) => self.members_of(t, kind),
            None => vec![],
        };
        let mut declared_at = entry_file.to_string();
        if let Some(file) = &file {
            if let Some(rel) = rel_path(&self.root, file) {
                declared_at = rel;
            }
        }
        let mut out = SymbolOut {
            name: name.clone(),
            kind: kind.to_string(),
            declared_at,
            declared_in: file,
            deprecated: false,
            deprecated_reason: String::new(),
            summary: summary_of(&docs),
            docs,
            signature: String::new(),
            members,
            examples,
            status: None,
        };
        for tag in &tags {
            if tag.name == "deprecated" {
                out.deprecated = true;
                out.deprecated_reason = js_trim(&tag.text).to_string();
                break;
            }
        }
        if let Some(t) = t {
            out.signature = self.signature_of(&name, t, kind, location);
        }
        Ok(out)
    }

    /// checker.getExportsOfModule in Strada's order: a module's own exports in
    /// declaration order, then what each `export *` adds, in the order of the
    /// statements. typescript-go keeps symbol tables in Go maps.
    fn ordered_exports(&mut self, module_symbol: P<Symbol>) -> Vec<P<Symbol>> {
        let mut exports = self.c.get_exports_of_module_exported(module_symbol);
        let mut order: HashMap<String, usize> = HashMap::new();
        for (i, name) in self.export_order(Some(module_symbol), &mut HashSet::new()).into_iter().enumerate() {
            order.entry(name).or_insert(i);
        }
        let rank = |sym: &P<Symbol>| order.get(sym.name()).copied().unwrap_or(usize::MAX);
        exports.sort_by(|a, b| {
            let (ra, rb) = (rank(a), rank(b));
            if ra != rb { ra.cmp(&rb) } else { a.name().cmp(b.name()) }
        });
        exports
    }

    fn export_order(&mut self, module: Option<P<Symbol>>, visited: &mut HashSet<P<Symbol>>) -> Vec<String> {
        let Some(module) = module else { return vec![] };
        let Some(exports) = module.exports() else { return vec![] };
        if !visited.insert(module) {
            return vec![];
        }
        // Strada's binder binds a statement list's function declarations before
        // its other statements (bindEachFunctionsFirst), so they enter the symbol
        // table first.
        struct Positioned {
            name: String,
            file: String,
            hoisted: bool,
            pos: i64,
        }
        let mut own: Vec<Positioned> = Vec::new();
        for (name, sym) in exports.entries() {
            if is_reserved(name) {
                continue;
            }
            let mut p = Positioned { name: name.to_string(), file: String::new(), hoisted: false, pos: i64::MAX };
            if let Some(d) = sym.declarations().first() {
                if let Some(sf) = get_source_file_of_node(*d) {
                    p.file = sf.file_name().to_string();
                }
                p.pos = d.pos().expect_source("decl") as i64;
                for decl in sym.declarations() {
                    if decl.kind() == Kind::FunctionDeclaration {
                        p.hoisted = true;
                        p.pos = decl.pos().expect_source("decl") as i64;
                        break;
                    }
                }
            }
            own.push(p);
        }
        own.sort_by(|a, b| {
            a.file
                .cmp(&b.file)
                .then_with(|| b.hoisted.cmp(&a.hoisted))
                .then_with(|| a.pos.cmp(&b.pos))
                .then_with(|| a.name.cmp(&b.name))
        });
        let mut names: Vec<String> = own.iter().map(|p| p.name.clone()).collect();
        let mut present: HashSet<String> = names.iter().cloned().collect();
        if let Some(stars) = exports.lookup(tsrs_ast::INTERNAL_SYMBOL_NAME_EXPORT_STAR) {
            let mut nested: Vec<String> = Vec::new();
            let mut nested_seen: HashSet<String> = HashSet::new();
            for decl in stars.declarations() {
                let Some(spec) = decl.module_specifier() else { continue };
                let target = self.c.resolve_external_module_name_exported(spec, None);
                for name in self.export_order(target, visited) {
                    if name == "default" || !nested_seen.insert(name.clone()) {
                        continue;
                    }
                    nested.push(name);
                }
            }
            for name in nested {
                if present.insert(name.clone()) {
                    names.push(name);
                }
            }
        }
        names
    }
}

fn export_declaration_documentation_of(sym: P<Symbol>) -> String {
    for decl in sym.declarations() {
        if decl.kind() != Kind::ExportSpecifier {
            continue;
        }
        let Some(parent) = decl.parent() else { continue };
        let Some(gp) = parent.parent() else { continue };
        let comments = jsdoc_comments_and_tags(gp);
        if comments.is_empty() || comments[0].kind() != Kind::JSDoc {
            continue;
        }
        let Some(text) = text_of_jsdoc_comment(comments[0]) else { continue };
        let doc = js_trim(&text);
        if !doc.is_empty() {
            return doc.to_string();
        }
    }
    String::new()
}

/// Go `Collect`.
pub fn collect(package_dir: &str, options: Options) -> Result<Vec<Entrypoint>, CollectError> {
    let root = clean(&abs(package_dir));
    let Ok(data) = std::fs::read(pjoin(&[&root, "package.json"])) else { return Ok(vec![]) };
    let Some(Value::Object(pkg)) = pkgjson::decode_ordered(&data) else { return Ok(vec![]) };

    let mut declared_map: Vec<(String, Value)> = Vec::new();
    if !options.imports_subpath.is_empty() {
        if let Some(Value::Object(imports)) = pkg.get("imports") {
            if let Some(v) = imports.get(&options.imports_subpath) {
                declared_map = vec![(options.imports_subpath.clone(), v.clone())];
            }
        }
    } else if let Some(exports) = pkg.get("exports") {
        if truthy(exports) {
            declared_map = subpath_map(exports);
        }
    }
    if declared_map.is_empty() {
        return Ok(vec![]);
    }

    let (out_dir, ts_opts) = read_compiler_options(&root);
    let package_name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let mut entries: Vec<Entrypoint> = Vec::new();
    let mut seen_entry_files: HashSet<String> = HashSet::new();
    for (key, value) in &declared_map {
        if options.imports_subpath.is_empty() && !key.starts_with('.') {
            continue;
        }
        let Some(target) = target_of(value) else { continue };
        if NON_CODE_TARGET.is_match(&target) {
            continue;
        }
        let declared = if target.contains('*') {
            expand_wildcard(&root, key, &target, &out_dir)
        } else {
            vec![DeclaredSubpath { subpath: key.clone(), target: target.clone() }]
        };
        for each in declared {
            if let Some(sub) = &options.subpaths {
                if !sub.iter().any(|s| *s == each.subpath) {
                    continue;
                }
            }
            let Some(entry_file) = source_for_target(&root, &each.target, &out_dir) else { continue };
            if !seen_entry_files.insert(entry_file.clone()) {
                continue;
            }
            let mut specifier = each.subpath.clone();
            if options.imports_subpath.is_empty() {
                specifier = if each.subpath == "." { package_name.clone() } else { format!("{}{}", package_name, &each.subpath[1..]) };
            }
            entries.push(Entrypoint { subpath: each.subpath, specifier, entry_file, symbols: vec![] });
        }
    }
    if entries.is_empty() {
        return Ok(vec![]);
    }

    let roots: Vec<String> = entries.iter().map(|e| tspath::normalize_path(&pjoin(&[&root, &e.entry_file]))).collect();
    let mut compiler_opts = CompilerOptions {
        target: ScriptTarget::ES_NEXT,
        module: ModuleKind::NODE16,
        module_resolution: ModuleResolutionKind::NODE16,
        skip_lib_check: Tristate::True,
        skip_default_lib_check: Tristate::True,
        types: Some(vec![]),
        allow_js: Tristate::False,
        check_js: Tristate::False,
        ..CompilerOptions::default()
    };
    if let Some(o) = ts_opts {
        compiler_opts.base_url = o.base_url.clone();
        compiler_opts.paths = o.paths.clone();
        compiler_opts.paths_base_path = o.paths_base_path.clone();
    }
    let cwd = std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    let fs: Arc<dyn FS> = Arc::new(bundled::wrap_fs(osvfs::fs()));
    let host: Arc<dyn CompilerHost> = new_compiler_host(&cwd, fs.clone(), &bundled::lib_path(), None, None, None);
    let parsed = tsoptions::new_parsed_command_line(
        P::new(compiler_opts),
        roots.clone(),
        vec![],
        ComparePathsOptions { use_case_sensitive_file_names: fs.use_case_sensitive_file_names(), current_directory: cwd },
    );
    let prog = new_program(ProgramOptions::new(P::new(parsed), host));
    prog.bind_source_files();
    let checker = prog.get_type_checker(&Context::background());

    let mut s = Session { c: checker, prog, root: root.clone(), snippets: options.snippets };
    let statuses = collect_error_statuses(prog);

    for (i, entry) in entries.iter_mut().enumerate() {
        let Some(sf) = prog.get_source_file(&roots[i]) else { continue };
        let Some(sym) = sf.symbol() else { continue };
        let module_symbol = s.c.get_merged_symbol_exported(sym);
        for sym in s.ordered_exports(module_symbol) {
            let mut out = s.symbol(sym, &entry.entry_file).map_err(CollectError::UnknownSnippet)?;
            if let Some(status) = statuses.get(&out.name) {
                out.status = Some(*status);
            }
            entry.symbols.push(out);
        }
    }
    Ok(entries)
}

/// Reads `addError(Name, { status })` and `addErrors([[Name, { status }], ...])`
/// registrations, from sources and from the emitted .js beside a declaration
/// file that mentions PikkuError.
fn collect_error_statuses(prog: &Program) -> HashMap<String, f64> {
    let mut statuses: HashMap<String, f64> = HashMap::new();
    fn record(name: P<Node>, details: P<Node>, sf: P<SourceFile>, statuses: &mut HashMap<String, f64>) {
        if name.kind() != Kind::Identifier || details.kind() != Kind::ObjectLiteralExpression {
            return;
        }
        for property in details.properties() {
            if property.kind() != Kind::PropertyAssignment {
                continue;
            }
            if node_text(property.name().unwrap(), sf) != "status" {
                continue;
            }
            if let Some(status) = js_number(node_text(property.initializer().unwrap(), sf)) {
                statuses.insert(name.text().to_string(), status);
            }
        }
    }
    fn scan(sf: P<SourceFile>, statuses: &mut HashMap<String, f64>) {
        for statement in sf.statements().nodes() {
            if statement.kind() != Kind::ExpressionStatement {
                continue;
            }
            let Some(call) = statement.expression() else { continue };
            if call.kind() != Kind::CallExpression || call.expression().unwrap().kind() != Kind::Identifier {
                continue;
            }
            let args = call.arguments();
            match call.expression().unwrap().text() {
                "addError" => {
                    if args.len() >= 2 {
                        record(args[0], args[1], sf, statuses);
                    }
                }
                "addErrors" => {
                    if args.is_empty() || args[0].kind() != Kind::ArrayLiteralExpression {
                        continue;
                    }
                    for entry in args[0].elements() {
                        if entry.kind() != Kind::ArrayLiteralExpression {
                            continue;
                        }
                        let elements = entry.elements();
                        if elements.len() >= 2 {
                            record(elements[0], elements[1], sf, statuses);
                        }
                    }
                }
                _ => {}
            }
        }
    }
    for sf in prog.get_source_files() {
        if !sf.is_declaration_file() {
            scan(*sf, &mut statuses);
            continue;
        }
        if !sf.text().contains("PikkuError") {
            continue;
        }
        let name = sf.file_name();
        let emitted = EMITTED_DECL_TS.get().replace(name, ".$1").into_owned();
        if emitted == name {
            continue;
        }
        let mut js_path = emitted.strip_suffix(".ts").map(|s| s.to_string()).unwrap_or(emitted.clone());
        if js_path != emitted {
            js_path.push_str(".js");
        }
        let Ok(source) = std::fs::read(&js_path) else { continue };
        let source = String::from_utf8_lossy(&source).into_owned();
        scan(parse(&emitted, &source, ScriptKind::JS), &mut statuses);
    }
    statuses
}

fn node_text(n: P<Node>, sf: P<SourceFile>) -> &'static str {
    &sf.text()[start(n, sf)..n.end().expect_source("node") as usize]
}

/// `Number(text)` restricted to finite results.
fn js_number(text: &str) -> Option<f64> {
    let t = js_trim(text);
    if t.is_empty() {
        return Some(0.0);
    }
    let lower = t.to_lowercase();
    for (prefix, base) in [("0x", 16u32), ("0o", 8), ("0b", 2)] {
        if lower.starts_with(prefix) {
            let digits = &t[2..];
            if digits.is_empty() || !digits.chars().all(|c| c.is_digit(base)) {
                return None;
            }
            return u64::from_str_radix(digits, base).ok().map(|n| n as f64);
        }
    }
    if !t.chars().all(|r| r.is_ascii_digit() || matches!(r, '.' | 'e' | 'E' | '+' | '-')) {
        return None;
    }
    let n: f64 = t.parse().ok()?;
    if n.is_infinite() || n.is_nan() { None } else { Some(n) }
}

// ---- helper dispatch -----------------------------------------------------------

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct CollectSurfaceParams {
    package_dir: String,
    imports_subpath: String,
    subpaths: Option<Vec<String>>,
    snippets: Option<Vec<(String, String)>>,
}

pub fn collect_surface_params(params: &[u8]) -> Result<Box<RawValue>, Error> {
    let p: CollectSurfaceParams = if params.iter().all(|b| b.is_ascii_whitespace()) {
        CollectSurfaceParams::default()
    } else {
        serde_json::from_slice(params).map_err(|e| Error { name: String::new(), message: format!("bad params: {e}") })?
    };
    let opts = Options {
        imports_subpath: p.imports_subpath,
        subpaths: p.subpaths,
        snippets: p.snippets.map(|s| s.into_iter().map(|(name, code)| Snippet { name, code }).collect()),
    };
    match collect(&p.package_dir, opts) {
        Ok(entries) => {
            let b = crate::jsjson::marshal(&entries, "").map_err(|e| Error { name: String::new(), message: e.to_string() })?;
            RawValue::from_string(String::from_utf8(b).unwrap_or_default())
                .map_err(|e| Error { name: String::new(), message: e.to_string() })
        }
        Err(CollectError::UnknownSnippet(e)) => Err(Error { name: "UnknownSnippetError".into(), message: e.message }),
        Err(CollectError::Other(m)) => Err(Error { name: String::new(), message: m }),
    }
}

#[allow(dead_code)]
fn _unused(_: &Map<String, Value>, _: &Regex, _: &str) {
    let _ = (JS_WHITESPACE, start);
}
