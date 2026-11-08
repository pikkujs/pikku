//! Port of Go `internal/schemas/zodjs`: Zod schemas converted in-process.
//!
//! Go bundles the declaring modules with esbuild and runs the bundle in
//! QuickJS. This port is native end to end: tsrs's emitter turns each
//! TypeScript module into an ES module, `oxc_resolver` resolves imports the way
//! esbuild does (conditions `import`/`default`, main fields `module`/`main`,
//! the project's tsconfig paths), and the modules are linked by QuickJS's own
//! module loader (rquickjs). `runner.js` and `helpers.gen.js` are Go's files,
//! embedded byte for byte. A bare import that is not `zod` and cannot be
//! loaded (a Node built-in, a package that does not resolve) is a stub, as in
//! Go. There is no Node fallback: a schema that touches a stub is an error.
//!
//! A package under `node_modules` is loaded for real first, because a schema
//! can be built from one (`defineAnalyticsEvents` from `@pikku/core/analytics`)
//! and Go only converts such a schema by handing it to Node. The schemas that
//! then fail to load, or touch a stub, run again with every package under
//! `node_modules` stubbed, which is all this converter did before.

use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::time::{Duration, Instant};

use regex::Regex;
use rquickjs::loader::{ImportAttributes, Loader, Resolver};
use rquickjs::module::Declared;
use rquickjs::{CatchResultExt, Context, Ctx, Error as JsError, Module, Runtime};
use serde_json::Value;

use super::transpile::Transpiler;
use super::vendor::{ConvertError, VendorRef, VendorResult, VendorSchema, VendorSchemaConverter};
use crate::state::raw::Raw;

const RUNNER_JS: &str = include_str!("../../../inspector-go/internal/schemas/zodjs/runner.js");
const HELPERS_JS: &str = include_str!("../../../inspector-go/internal/schemas/zodjs/helpers.gen.js");

const HELPERS_MODULE: &str = "pikku:zod-helpers";
const RUNNER_MODULE: &str = "pikku:zod-runner";
const ENTRY_MODULE: &str = "pikku:zod-entry";
const STUB_PREFIX: &str = "pikku-stub:";

/// zodjs.Converter, without the Node fallback.
pub struct ZodjsConverter {
    /// The project root: zod and the project's imports resolve from it.
    pub dir: String,
    pub tsconfig: String,
}

#[derive(Default)]
struct RunResult {
    schemas: Vec<(String, Value)>,
    errors: Vec<String>,
    fallback: Vec<(String, String)>,
}

impl VendorSchemaConverter for ZodjsConverter {
    fn convert(&self, refs: &[VendorRef], timeout: Duration) -> Result<VendorResult, ConvertError> {
        let wrap = |e: ConvertError| match e {
            ConvertError::Failed(m) => ConvertError::Failed(format!("converting Zod schemas without Node: {m}")),
            e => e,
        };
        let mut out = self.run(refs, timeout, true).map_err(wrap)?;
        if !out.fallback.is_empty() {
            let pending: Vec<VendorRef> =
                refs.iter().filter(|r| out.fallback.iter().any(|(n, _)| n == &r.name)).cloned().collect();
            let stubbed = self.run(&pending, timeout, false).map_err(wrap)?;
            out.fallback = stubbed.fallback;
            out.schemas.extend(stubbed.schemas);
            out.errors.extend(stubbed.errors);
        }
        let mut converted: HashMap<String, VendorSchema> = HashMap::new();
        for (name, body) in out.schemas {
            let schema = body.get("schema").cloned().unwrap_or(Value::Null);
            let type_text = body.get("typeText").and_then(Value::as_str).unwrap_or_default().to_string();
            converted.insert(name.clone(), VendorSchema { name, schema: Raw::of(schema), type_text });
        }
        let mut res = VendorResult { schemas: Vec::new(), errors: out.errors };
        let reasons: HashMap<&str, &str> = out.fallback.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect();
        for r in refs.iter().filter(|r| reasons.contains_key(r.name.as_str())) {
            res.errors.push(format!(
                "Could not convert Zod schema '{}' without Node: {}. Install Node, or build the schema from values the module declares itself.",
                r.name, reasons[r.name.as_str()]
            ));
        }
        for r in refs {
            if let Some(s) = converted.remove(&r.name) {
                res.schemas.push(s);
            }
        }
        Ok(res)
    }
}

impl ZodjsConverter {
    fn run(&self, refs: &[VendorRef], timeout: Duration, load_packages: bool) -> Result<RunResult, ConvertError> {
        let (dir, tsconfig) = (self.dir.clone(), self.tsconfig.clone());
        let refs = refs.to_vec();
        // QuickJS and the TypeScript emitter recurse on the native stack.
        let handle = std::thread::Builder::new()
            .stack_size(64 << 20)
            .spawn(move || run_in_thread(&dir, &tsconfig, &refs, timeout, load_packages))
            .map_err(|e| ConvertError::Failed(format!("starting QuickJS: {e}")))?;
        let text = handle.join().unwrap_or_else(|_| Err(ConvertError::Failed("QuickJS panicked".into())))?;
        let v: Value = serde_json::from_str(&text)
            .map_err(|e| ConvertError::Failed(format!("reading the QuickJS result: {e}")))?;
        let mut out = RunResult::default();
        for pair in v.get("schemas").and_then(Value::as_array).into_iter().flatten() {
            let name = pair.get(0).and_then(Value::as_str).unwrap_or_default().to_string();
            out.schemas.push((name, pair.get(1).cloned().unwrap_or(Value::Null)));
        }
        for e in v.get("errors").and_then(Value::as_array).into_iter().flatten() {
            if let Some(s) = e.as_str() {
                out.errors.push(s.to_string());
            }
        }
        for f in v.get("fallback").and_then(Value::as_array).into_iter().flatten() {
            out.fallback.push((
                f.get(0).and_then(Value::as_str).unwrap_or_default().to_string(),
                f.get(1).and_then(Value::as_str).unwrap_or_default().to_string(),
            ));
        }
        Ok(out)
    }
}

/// The script that loads every declaring module on demand, so that one which
/// throws costs only its own schemas, and runs Go's runner over them.
fn entry_source(refs: &[VendorRef]) -> Result<String, ConvertError> {
    let mut index: HashMap<String, usize> = HashMap::new();
    let mut files: Vec<String> = Vec::new();
    let mut lookup = Vec::new();
    for r in refs {
        let file = runtime_file(&r.schema_ref.source_file);
        let i = match index.get(&file) {
            Some(i) => *i,
            None => {
                let i = files.len();
                index.insert(file.clone(), i);
                files.push(file);
                i
            }
        };
        let sr = serde_json::to_string(&r.schema_ref).map_err(|e| ConvertError::Failed(e.to_string()))?;
        lookup.push(format!("[{}, {}, {}]", quote(&r.name), sr, i));
    }
    let file_list: Vec<String> = files.iter().map(|f| quote(f)).collect();
    Ok(format!(
        "import * as z from 'zod'\n\
         import {{ zodToTypeText, findZodTransform }} from '{HELPERS_MODULE}'\n\
         import {{ run }} from '{RUNNER_MODULE}'\n\
         const FILES = [{}]\n\
         const loaded = new Map()\n\
         for (const file of FILES) {{\n\
         \x20 try {{ loaded.set(file, {{ module: await import(file) }}) }} catch (e) {{ loaded.set(file, {{ failed: e }}) }}\n\
         }}\n\
         globalThis.__pikkuResult = JSON.stringify(run({{ z, zodToTypeText, findZodTransform,\n\
         \x20 files: FILES.map((file) => ({{ file, load: () => {{ const r = loaded.get(file); if (r.failed) throw r.failed; return r.module }} }})),\n\
         \x20 lookup: [{}] }}))\n",
        file_list.join(", "),
        lookup.join(",\n")
    ))
}

fn run_in_thread(dir: &str, tsconfig: &str, refs: &[VendorRef], timeout: Duration, load_packages: bool) -> Result<String, ConvertError> {
    let failed = |m: String| ConvertError::Failed(m);
    let entry = entry_source(refs)?;
    let shared = Rc::new(RefCell::new(Shared::new(dir, tsconfig, declaring_dirs(refs), load_packages)));

    let rt = Runtime::new().map_err(|e| failed(format!("starting QuickJS: {e}")))?;
    rt.set_max_stack_size(32 << 20);
    rt.set_loader(ModuleResolver(shared.clone()), ModuleLoader(shared.clone()));
    let deadline = Instant::now() + timeout;
    let timed_out = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = timed_out.clone();
    rt.set_interrupt_handler(Some(Box::new(move || {
        let over = Instant::now() > deadline;
        if over {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        over
    })));
    let ctx = Context::full(&rt).map_err(|e| failed(format!("starting QuickJS: {e}")))?;
    let prelude = prelude(dir);
    let result: Result<String, String> = ctx.with(|ctx| {
        ctx.eval::<(), _>(prelude).catch(&ctx).map_err(|e| e.to_string())?;
        let promise = Module::evaluate(ctx.clone(), ENTRY_MODULE, entry).catch(&ctx).map_err(|e| e.to_string())?;
        promise.finish::<()>().catch(&ctx).map_err(|e| e.to_string())?;
        ctx.globals().get::<_, String>("__pikkuResult").catch(&ctx).map_err(|e| e.to_string())
    });
    match result {
        Ok(s) => Ok(s),
        Err(_) if timed_out.load(std::sync::atomic::Ordering::Relaxed) => Err(ConvertError::Timeout(timeout)),
        Err(m) => Err(failed(m)),
    }
}


/// QuickJS has no TextEncoder/TextDecoder; Go's qjs does, and modules read
/// them while they load.
const TEXT_CODEC: &str = r#"
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    get encoding() { return 'utf-8' }
    encode(input = '') {
      const s = String(input), out = []
      for (let i = 0; i < s.length; i++) {
        let c = s.codePointAt(i)
        if (c > 0xffff) i++
        if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd
        if (c < 0x80) out.push(c)
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
      }
      return new Uint8Array(out)
    }
  }
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    constructor(label = 'utf-8') { this.encoding = String(label).toLowerCase() }
    decode(input) {
      if (input === undefined) return ''
      const b = input instanceof Uint8Array ? input : new Uint8Array(input.buffer || input)
      let s = ''
      for (let i = 0; i < b.length;) {
        const c = b[i++]
        let cp = c
        if (c >= 0xf0) { cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63) }
        else if (c >= 0xe0) { cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63) }
        else if (c >= 0xc0) { cp = ((c & 31) << 6) | (b[i++] & 63) }
        s += String.fromCodePoint(cp)
      }
      return s
    }
  }
}
"#;

/// Stands in for the parts of Node a module reads while it loads, and for the
/// console QuickJS does not have (Go's qjs has one and discards its output).
fn prelude(dir: &str) -> String {
    let mut env: Vec<(String, String)> = std::env::vars_os()
        .filter_map(|(k, v)| Some((k.into_string().ok()?, v.into_string().ok()?)))
        .collect();
    env.sort();
    let mut map = serde_json::Map::new();
    for (k, v) in env {
        map.insert(k, Value::String(v));
    }
    let platform = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    };
    format!(
        "if (typeof globalThis.console === 'undefined') {{ const n = () => {{}}; globalThis.console = {{ log: n, info: n, warn: n, error: n, debug: n, trace: n, assert: n, dir: n, table: n, time: n, timeEnd: n, group: n, groupEnd: n }} }}\n\
         {TEXT_CODEC}\n\
         globalThis.global = globalThis;\n\
         globalThis.process = {{ env: {}, argv: [], platform: {}, versions: {{}}, cwd: () => {} }};",
        Value::Object(map),
        quote(platform),
        quote(dir)
    )
}

// ---------------------------------------------------------------------------
// Module graph

struct Shared {
    dir: String,
    resolver: oxc_resolver::Resolver,
    transpiler: Transpiler,
    /// Source of every module loaded so far, by module name: a stub's exports
    /// are the names its importer asks for.
    sources: HashMap<String, String>,
    stubs: HashMap<String, StubInfo>,
    /// Where the entry's `zod` is looked for after the project root: the
    /// directories of the modules that declare the schemas.
    declaring_dirs: Vec<PathBuf>,
    /// Load a package under `node_modules` instead of stubbing it.
    load_packages: bool,
}

struct StubInfo {
    spec: String,
    names: BTreeSet<String>,
}

impl Shared {
    fn new(dir: &str, tsconfig: &str, declaring_dirs: Vec<PathBuf>, load_packages: bool) -> Shared {
        let tsconfig_opt = (!tsconfig.is_empty() && Path::new(tsconfig).exists()).then(|| {
            oxc_resolver::TsconfigDiscovery::Manual(oxc_resolver::TsconfigOptions {
                config_file: PathBuf::from(tsconfig),
                references: oxc_resolver::TsconfigReferences::Auto,
            })
        });
        let ext = |a: &str, b: &[&str]| (a.to_string(), b.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        let options = oxc_resolver::ResolveOptions {
            tsconfig: tsconfig_opt,
            condition_names: vec!["import".into(), "default".into()],
            main_fields: vec!["module".into(), "main".into()],
            extensions: [".tsx", ".ts", ".jsx", ".js", ".json"].iter().map(|s| s.to_string()).collect(),
            extension_alias: vec![
                ext(".js", &[".ts", ".tsx", ".js"]),
                ext(".jsx", &[".tsx", ".jsx"]),
                ext(".mjs", &[".mts", ".mjs"]),
                ext(".cjs", &[".cts", ".cjs"]),
            ],
            symlinks: true,
            ..oxc_resolver::ResolveOptions::default()
        };
        Shared {
            dir: dir.to_string(),
            resolver: oxc_resolver::Resolver::new(options),
            transpiler: Transpiler::new(tsconfig),
            sources: HashMap::new(),
            stubs: HashMap::new(),
            declaring_dirs,
            load_packages,
        }
    }

    fn importer_dir(&self, base: &str) -> PathBuf {
        if base.starts_with("pikku:") || base.starts_with(STUB_PREFIX) || base.is_empty() {
            return PathBuf::from(&self.dir);
        }
        Path::new(base).parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from(&self.dir))
    }

    /// The module name for an import: the resolved file, or a stub for a bare
    /// import that is outside the project.
    fn resolve(&mut self, base: &str, name: &str) -> Result<String, String> {
        if name.starts_with("pikku:") {
            return Ok(name.to_string());
        }
        let from = self.importer_dir(base);
        if base == ENTRY_MODULE && is_zod(name) {
            return self.resolve_entry_zod(&from, name);
        }
        let bare = !name.starts_with('.') && !name.starts_with('/') && !Path::new(name).is_absolute();
        if bare && !is_zod(name) {
            return match self.resolver.resolve(&from, name) {
                Ok(r) if self.loadable(&r.full_path()) => Ok(path_string(&r.full_path())),
                _ => {
                    let stub = format!("{STUB_PREFIX}{name}@{base}");
                    if !self.stubs.contains_key(&stub) {
                        let names = self.imported_names(base, name);
                        self.stubs.insert(stub.clone(), StubInfo { spec: name.to_string(), names });
                    }
                    Ok(stub)
                }
            };
        }
        if Path::new(name).is_absolute() && Path::new(name).is_file() {
            return Ok(name.to_string());
        }
        self.resolver
            .resolve(&from, name)
            .map(|r| path_string(&r.full_path()))
            .map_err(|e| format!("Could not resolve \"{name}\" from {}: {e}", from.display()))
    }

    /// Zod is imported by the entry, whose directory is the project root. In a
    /// workspace the root often has none (bun and pnpm install it beside the
    /// package that depends on it), so it is then the one the schemas' own
    /// modules would get.
    fn resolve_entry_zod(&self, root: &Path, name: &str) -> Result<String, String> {
        let first = self.resolver.resolve(root, name);
        let found = first.clone().ok().or_else(|| self.declaring_dirs.iter().find_map(|d| self.resolver.resolve(d, name).ok()));
        found
            .map(|r| path_string(&r.full_path()))
            .ok_or_else(|| format!("Could not resolve \"{name}\" from {}: {}", root.display(), first.err().map(|e| e.to_string()).unwrap_or_default()))
    }

    /// A resolved bare import is loaded when it is in the project, or when it
    /// is an ES module under `node_modules` and packages are being loaded.
    fn loadable(&self, path: &Path) -> bool {
        let text = path.to_string_lossy();
        if !in_node_modules(&text) {
            return true;
        }
        self.load_packages && matches!(path.extension().and_then(|e| e.to_str()), Some("js" | "mjs" | "json"))
    }

    /// The names `base` imports from `spec`, read off its source.
    fn imported_names(&self, base: &str, spec: &str) -> BTreeSet<String> {
        let mut names = BTreeSet::new();
        let Some(src) = self.sources.get(base) else { return names };
        let esc = regex::escape(spec);
        let import_re = Regex::new(&format!(r#"(?s)\bimport\s+([^;'"]*?)\s*from\s*["']{esc}["']"#)).unwrap();
        for c in import_re.captures_iter(src) {
            let clause = &c[1];
            if let (Some(a), Some(b)) = (clause.find('{'), clause.find('}')) {
                names.extend(specifier_names(&clause[a + 1..b]));
            }
            let ns_re = Regex::new(r"\*\s*as\s+([A-Za-z_$][\w$]*)").unwrap();
            if let Some(ns) = ns_re.captures(clause) {
                let member = Regex::new(&format!(r"\b{}\s*\??\.\s*([A-Za-z_$][\w$]*)", regex::escape(&ns[1]))).unwrap();
                names.extend(member.captures_iter(src).map(|m| m[1].to_string()));
            }
        }
        let export_re = Regex::new(&format!(r#"(?s)\bexport\s*\{{([^}}]*)\}}\s*from\s*["']{esc}["']"#)).unwrap();
        for c in export_re.captures_iter(src) {
            names.extend(specifier_names(&c[1]));
        }
        names
    }

    fn stub_source(&self, name: &str) -> Option<String> {
        let info = self.stubs.get(name)?;
        let mut out = format!(
            "import {{ createStub }} from '{RUNNER_MODULE}'\n\
             const registry = globalThis.__pikkuStubs || (globalThis.__pikkuStubs = {{}})\n\
             const stub = registry[{spec}] || (registry[{spec}] = createStub({spec}))\n\
             export default stub\n",
            spec = quote(&info.spec)
        );
        for n in &info.names {
            if n != "default" && is_identifier(n) {
                out.push_str(&format!("export const {n} = stub\n"));
            }
        }
        Some(out)
    }

    fn file_source(&mut self, name: &str) -> Result<String, String> {
        let path = Path::new(name);
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or_default();
        let file = name.to_string();
        let is_declaration = file.ends_with(".d.ts") || file.ends_with(".d.mts") || file.ends_with(".d.cts");
        match ext {
            "ts" | "tsx" | "mts" | "cts" if !is_declaration => self.transpiler.transpile(&file),
            "json" => {
                let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
                Ok(format!("export default {text}"))
            }
            "css" | "scss" | "sass" | "less" | "svg" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" | "woff"
            | "woff2" | "ttf" | "eot" | "md" | "html" | "txt" | "sql" | "wasm" | "node" => Ok("export default {}".into()),
            _ => std::fs::read_to_string(path).map_err(|e| format!("{name}: {e}")),
        }
    }
}

struct ModuleResolver(Rc<RefCell<Shared>>);
struct ModuleLoader(Rc<RefCell<Shared>>);

impl Resolver for ModuleResolver {
    fn resolve<'js>(
        &mut self,
        _ctx: &Ctx<'js>,
        base: &str,
        name: &str,
        _attributes: Option<ImportAttributes<'js>>,
    ) -> rquickjs::Result<String> {
        self.0
            .borrow_mut()
            .resolve(base, name)
            .map_err(|m| JsError::new_resolving_message(base.to_string(), name.to_string(), m))
    }
}

impl Loader for ModuleLoader {
    fn load<'js>(
        &mut self,
        ctx: &Ctx<'js>,
        name: &str,
        _attributes: Option<ImportAttributes<'js>>,
    ) -> rquickjs::Result<Module<'js, Declared>> {
        let source = {
            let mut shared = self.0.borrow_mut();
            let source = match name {
                HELPERS_MODULE => HELPERS_JS.to_string(),
                RUNNER_MODULE => RUNNER_JS.to_string(),
                n if n.starts_with(STUB_PREFIX) => shared
                    .stub_source(n)
                    .ok_or_else(|| JsError::new_loading_message(name.to_string(), "unknown stub".to_string()))?,
                n => shared
                    .file_source(n)
                    .map_err(|m| JsError::new_loading_message(name.to_string(), m))?,
            };
            shared.sources.insert(name.to_string(), source.clone());
            source
        };
        Module::declare(ctx.clone(), name.to_string(), source)
    }
}

fn specifier_names(list: &str) -> Vec<String> {
    list.split(',')
        .filter_map(|part| {
            let part = part.trim();
            let part = part.strip_prefix("type ").unwrap_or(part);
            let imported = part.split_whitespace().next()?;
            Some(imported.trim_matches(|c| c == '"' || c == '\'').to_string())
        })
        .collect()
}

fn is_identifier(n: &str) -> bool {
    const RESERVED: &[&str] = &[
        "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum",
        "export", "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null",
        "return", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield",
        "let", "static", "await", "stub", "registry", "createStub",
    ];
    let mut chars = n.chars();
    matches!(chars.next(), Some(c) if c.is_alphabetic() || c == '_' || c == '$')
        && chars.all(|c| c.is_alphanumeric() || c == '_' || c == '$')
        && !RESERVED.contains(&n)
}

fn declaring_dirs(refs: &[VendorRef]) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    for r in refs {
        if let Some(d) = Path::new(&runtime_file(&r.schema_ref.source_file)).parent() {
            if !dirs.iter().any(|x| x == d) {
                dirs.push(d.to_path_buf());
            }
        }
    }
    dirs
}

fn path_string(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

fn is_zod(path: &str) -> bool {
    path == "zod" || path.starts_with("zod/")
}

fn in_node_modules(path: &str) -> bool {
    path.replace('\\', "/").contains("/node_modules/")
}

fn quote(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_default()
}

/// vendor-schemas.mjs's schemaRuntimeFile: a schema declared in a .d.ts is
/// loaded from the .js emitted beside it, when there is one.
fn runtime_file(source_file: &str) -> String {
    for (suffix, js) in [(".d.ts", ".js"), (".d.mts", ".mjs"), (".d.cts", ".cjs")] {
        if let Some(stem) = source_file.strip_suffix(suffix) {
            let emitted = format!("{stem}{js}");
            return if Path::new(&emitted).exists() { emitted } else { source_file.to_string() };
        }
    }
    source_file.to_string()
}
