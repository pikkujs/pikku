//! Port of Go `internal/schemas/zodjs`: Zod schemas converted without Node.
//!
//! The modules that declare the schemas are bundled with esbuild (the native
//! executable that ships in the repository's node_modules, driven through its
//! service protocol so the same resolve/load plugin Go registers can run) and
//! the bundle is evaluated in embedded QuickJS (rquickjs). `runner.js` and
//! `helpers.gen.js` are Go's own files, embedded byte for byte. What QuickJS
//! cannot convert goes to the Node converter when there is one.

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use serde_json::Value;

use super::vendor::{ConvertError, VendorRef, VendorResult, VendorSchema, VendorSchemaConverter};
use crate::state::raw::Raw;

const RUNNER_JS: &str = include_str!("../../../inspector-go/internal/schemas/zodjs/runner.js");
const HELPERS_JS: &str = include_str!("../../../inspector-go/internal/schemas/zodjs/helpers.gen.js");

const HELPERS_MODULE: &str = "pikku:zod-helpers";
const RUNNER_MODULE: &str = "pikku:zod-runner";
const STUB_NAMESPACE: &str = "pikku-stub";
const SKIP_RESOLVE: i64 = 0;

/// zodjs.Converter: no Node needed.
pub struct ZodjsConverter {
    /// The project root: zod and the project's imports resolve from it.
    pub dir: String,
    pub tsconfig: String,
    /// Converts what QuickJS cannot; None without Node.
    pub fallback: Option<Box<dyn VendorSchemaConverter>>,
}

#[derive(Default)]
struct RunResult {
    schemas: Vec<(String, Value)>,
    errors: Vec<String>,
    fallback: Vec<(String, String)>,
}

impl VendorSchemaConverter for ZodjsConverter {
    fn convert(&self, refs: &[VendorRef], timeout: Duration) -> Result<VendorResult, ConvertError> {
        let out = match self.run(refs, timeout) {
            Ok(o) => o,
            Err(e) => {
                if let Some(fb) = &self.fallback {
                    return fb.convert(refs, timeout);
                }
                return Err(match e {
                    ConvertError::Failed(m) => ConvertError::Failed(format!("converting Zod schemas without Node: {m}")),
                    other => other,
                });
            }
        };
        let mut converted: HashMap<String, VendorSchema> = HashMap::new();
        for (name, body) in out.schemas {
            let schema = body.get("schema").cloned().unwrap_or(Value::Null);
            let type_text = body.get("typeText").and_then(Value::as_str).unwrap_or_default().to_string();
            converted.insert(name.clone(), VendorSchema { name, schema: Raw::of(schema), type_text });
        }
        let mut res = VendorResult { schemas: Vec::new(), errors: out.errors };
        if !out.fallback.is_empty() {
            let reasons: HashMap<&str, &str> = out.fallback.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect();
            let pending: Vec<VendorRef> = refs.iter().filter(|r| reasons.contains_key(r.name.as_str())).cloned().collect();
            match &self.fallback {
                None => {
                    for r in &pending {
                        res.errors.push(format!(
                            "Could not convert Zod schema '{}' without Node: {}. Install Node, or build the schema from values the module declares itself.",
                            r.name, reasons[r.name.as_str()]
                        ));
                    }
                }
                Some(fb) => {
                    let via = fb.convert(&pending, timeout)?;
                    for s in via.schemas {
                        converted.insert(s.name.clone(), s);
                    }
                    res.errors.extend(via.errors);
                }
            }
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
    fn run(&self, refs: &[VendorRef], timeout: Duration) -> Result<RunResult, ConvertError> {
        let started = Instant::now();
        let bundle = self.bundle(refs).map_err(ConvertError::Failed)?;
        let remaining = timeout.saturating_sub(started.elapsed());
        let script = format!("{CONSOLE_STUB}\n{bundle}\nglobalThis.__pikkuResult");
        let text = eval_quickjs(script, remaining)?;
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

    /// The tsconfig when it exists: esbuild fails a build whose tsconfig is
    /// missing, and the paths it adds are only a convenience here.
    fn tsconfig(&self) -> Option<&str> {
        (!self.tsconfig.is_empty() && Path::new(&self.tsconfig).exists()).then_some(self.tsconfig.as_str())
    }

    /// The script QuickJS runs: every module declaring a schema, loaded on
    /// demand so that one which throws costs only its own schemas.
    fn bundle(&self, refs: &[VendorRef]) -> Result<String, String> {
        let mut index: HashMap<String, usize> = HashMap::new();
        let (mut files, mut lookup) = (Vec::new(), Vec::new());
        for r in refs {
            let file = runtime_file(&r.schema_ref.source_file);
            let i = match index.get(&file) {
                Some(i) => *i,
                None => {
                    let i = index.len();
                    index.insert(file.clone(), i);
                    files.push(format!("{{ file: {q}, load: () => require({q}) }}", q = quote(&file)));
                    i
                }
            };
            let sr = serde_json::to_string(&r.schema_ref).map_err(|e| e.to_string())?;
            lookup.push(format!("[{}, {}, {}]", quote(&r.name), sr, i));
        }
        let entry = format!(
            "import * as z from 'zod'\n\
             import {{ zodToTypeText, findZodTransform }} from '{HELPERS_MODULE}'\n\
             import {{ run }} from '{RUNNER_MODULE}'\n\
             globalThis.__pikkuResult = JSON.stringify(run({{ z, zodToTypeText, findZodTransform,\n  files: [{}],\n  lookup: [{}] }}))\n",
            files.join(",\n"),
            lookup.join(",\n")
        );

        let mut flags: Vec<String> = vec![
            "--log-level=silent".into(),
            "--log-limit=0".into(),
            "--bundle".into(),
            "--format=iife".into(),
            "--platform=neutral".into(),
            "--main-fields=module,main".into(),
            "--conditions=import,default".into(),
            "--target=es2020".into(),
            format!("--banner:js={}", self.prelude()),
            "--sourcefile=zod-schemas-entry.js".into(),
            "--loader=js".into(),
        ];
        if let Some(t) = self.tsconfig() {
            flags.push(format!("--tsconfig={t}"));
        }
        for ext in ASSET_EXTENSIONS {
            flags.push(format!("--loader:{ext}=empty"));
        }
        let out = Esbuild::locate(&self.dir)?.build(&flags, &entry, self)?;
        String::from_utf8(out).map_err(|e| e.to_string())
    }

    /// Stands in for the parts of Node a module reads while it loads.
    fn prelude(&self) -> String {
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
            "globalThis.global = globalThis;\nglobalThis.process = {{ env: {}, argv: [], platform: {}, versions: {{}}, cwd: () => {} }};",
            Value::Object(map),
            quote(platform),
            quote(&self.dir)
        )
    }

    /// The two onResolve/onLoad pairs of Go's `pikku-zodjs` plugin.
    fn on_resolve(&self, esb: &mut Esbuild, req: &P) -> Result<P, String> {
        let path = req.get("path").and_then(P::as_str).unwrap_or_default();
        for id in req.ids() {
            match id {
                ID_RESOLVE_PIKKU => {
                    return Ok(obj([("id", id.into()), ("path", path.into()), ("namespace", "pikku".into())]));
                }
                ID_RESOLVE_BARE => {
                    let plugin_data = req.get("pluginData").and_then(P::as_int).unwrap_or(-1);
                    if plugin_data == SKIP_RESOLVE || is_zod(path) || Path::new(path).is_absolute() {
                        continue;
                    }
                    let mut sub = vec![
                        ("command", P::from("resolve")),
                        ("path", path.into()),
                        ("key", 0i64.into()),
                        ("pluginName", "pikku-zodjs".into()),
                    ];
                    for k in ["importer", "resolveDir", "kind"] {
                        if let Some(v) = req.get(k).and_then(P::as_str) {
                            sub.push((k, v.into()));
                        }
                    }
                    sub.push(("pluginData", SKIP_RESOLVE.into()));
                    let r = esb.request(obj_vec(sub), self)?;
                    let rpath = r.get("path").and_then(P::as_str).unwrap_or_default();
                    let external = r.get("external").and_then(P::as_bool).unwrap_or(false);
                    let no_errors = r.get("errors").map_or(true, |e| e.items().is_empty());
                    let (path_out, ns_out) = if no_errors && !rpath.is_empty() && !external && !in_node_modules(rpath) {
                        (rpath, r.get("namespace").and_then(P::as_str).unwrap_or_default())
                    } else {
                        (path, STUB_NAMESPACE)
                    };
                    return Ok(obj([("id", id.into()), ("path", path_out.into()), ("namespace", ns_out.into())]));
                }
                _ => {}
            }
        }
        Ok(obj([]))
    }

    fn on_load(&self, req: &P) -> P {
        let path = req.get("path").and_then(P::as_str).unwrap_or_default();
        for id in req.ids() {
            let contents = match id {
                ID_LOAD_PIKKU => {
                    if path == HELPERS_MODULE { HELPERS_JS.to_string() } else { RUNNER_JS.to_string() }
                }
                ID_LOAD_STUB => format!("module.exports = require({}).createStub({})", quote(RUNNER_MODULE), quote(path)),
                _ => continue,
            };
            return obj([
                ("id", id.into()),
                ("contents", P::Bytes(contents.into_bytes())),
                ("loader", "js".into()),
                ("resolveDir", self.dir.as_str().into()),
            ]);
        }
        obj([])
    }
}

const ID_RESOLVE_PIKKU: i64 = 0;
const ID_LOAD_PIKKU: i64 = 1;
const ID_RESOLVE_BARE: i64 = 2;
const ID_LOAD_STUB: i64 = 3;

const ASSET_EXTENSIONS: &[&str] = &[
    ".css", ".scss", ".sass", ".less", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2",
    ".ttf", ".eot", ".md", ".html", ".txt", ".sql", ".wasm", ".node",
];

/// QuickJS has no console; Go's qjs does and discards what it prints.
const CONSOLE_STUB: &str = "if (typeof globalThis.console === 'undefined') { const n = () => {}; globalThis.console = { log: n, info: n, warn: n, error: n, debug: n, trace: n, assert: n, dir: n, table: n, time: n, timeEnd: n, group: n, groupEnd: n }; }";

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

// ---------------------------------------------------------------------------
// QuickJS

fn eval_quickjs(script: String, timeout: Duration) -> Result<String, ConvertError> {
    // QuickJS recurses on the native stack; give it room.
    let handle = std::thread::Builder::new()
        .stack_size(64 << 20)
        .spawn(move || eval_quickjs_inner(&script, timeout))
        .map_err(|e| ConvertError::Failed(format!("starting QuickJS: {e}")))?;
    handle.join().unwrap_or_else(|_| Err(ConvertError::Failed("QuickJS panicked".into())))
}

fn eval_quickjs_inner(script: &str, timeout: Duration) -> Result<String, ConvertError> {
    use rquickjs::{CatchResultExt, Context, Runtime};
    let rt = Runtime::new().map_err(|e| ConvertError::Failed(format!("starting QuickJS: {e}")))?;
    rt.set_max_stack_size(32 << 20);
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
    let ctx = Context::full(&rt).map_err(|e| ConvertError::Failed(format!("starting QuickJS: {e}")))?;
    let result = ctx.with(|ctx| {
        ctx.eval::<String, _>(script).catch(&ctx).map_err(|e| e.to_string())
    });
    match result {
        Ok(s) => Ok(s),
        Err(_) if timed_out.load(std::sync::atomic::Ordering::Relaxed) => Err(ConvertError::Timeout(timeout)),
        Err(m) => Err(ConvertError::Failed(m)),
    }
}

// ---------------------------------------------------------------------------
// esbuild service protocol (lib/shared/stdio_protocol.ts)

#[derive(Clone, Debug)]
enum P {
    Null,
    Bool(bool),
    Int(i64),
    Str(String),
    Bytes(Vec<u8>),
    Array(Vec<P>),
    Object(Vec<(String, P)>),
}

impl From<&str> for P {
    fn from(s: &str) -> P {
        P::Str(s.to_string())
    }
}
impl From<i64> for P {
    fn from(i: i64) -> P {
        P::Int(i)
    }
}

fn obj<const N: usize>(items: [(&str, P); N]) -> P {
    obj_vec(items.into_iter().collect())
}
fn obj_vec(items: Vec<(&str, P)>) -> P {
    P::Object(items.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

impl P {
    fn get(&self, key: &str) -> Option<&P> {
        match self {
            P::Object(o) => o.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    fn as_str(&self) -> Option<&str> {
        if let P::Str(s) = self { Some(s) } else { None }
    }
    fn as_int(&self) -> Option<i64> {
        if let P::Int(i) = self { Some(*i) } else { None }
    }
    fn as_bool(&self) -> Option<bool> {
        if let P::Bool(b) = self { Some(*b) } else { None }
    }
    fn items(&self) -> &[P] {
        if let P::Array(a) = self { a } else { &[] }
    }
    /// The callback ids esbuild asks a request to be offered to.
    fn ids(&self) -> Vec<i64> {
        self.get("ids").map(|a| a.items().iter().filter_map(P::as_int).collect()).unwrap_or_default()
    }
}

fn encode_value(out: &mut Vec<u8>, v: &P) {
    fn bytes(out: &mut Vec<u8>, b: &[u8]) {
        out.extend_from_slice(&(b.len() as u32).to_le_bytes());
        out.extend_from_slice(b);
    }
    match v {
        P::Null => out.push(0),
        P::Bool(b) => {
            out.push(1);
            out.push(*b as u8);
        }
        P::Int(i) => {
            out.push(2);
            out.extend_from_slice(&(*i as i32).to_le_bytes());
        }
        P::Str(s) => {
            out.push(3);
            bytes(out, s.as_bytes());
        }
        P::Bytes(b) => {
            out.push(4);
            bytes(out, b);
        }
        P::Array(a) => {
            out.push(5);
            out.extend_from_slice(&(a.len() as u32).to_le_bytes());
            for x in a {
                encode_value(out, x);
            }
        }
        P::Object(o) => {
            out.push(6);
            out.extend_from_slice(&(o.len() as u32).to_le_bytes());
            for (k, x) in o {
                bytes(out, k.as_bytes());
                encode_value(out, x);
            }
        }
    }
}

struct Reader<'a> {
    b: &'a [u8],
    at: usize,
}

impl Reader<'_> {
    fn u32(&mut self) -> Result<u32, String> {
        let s = self.b.get(self.at..self.at + 4).ok_or("truncated esbuild packet")?;
        self.at += 4;
        Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn bytes(&mut self) -> Result<&[u8], String> {
        let n = self.u32()? as usize;
        let s = self.b.get(self.at..self.at + n).ok_or("truncated esbuild packet")?;
        self.at += n;
        Ok(s)
    }
    fn value(&mut self) -> Result<P, String> {
        let tag = *self.b.get(self.at).ok_or("truncated esbuild packet")?;
        self.at += 1;
        Ok(match tag {
            0 => P::Null,
            1 => {
                let v = *self.b.get(self.at).ok_or("truncated esbuild packet")?;
                self.at += 1;
                P::Bool(v != 0)
            }
            2 => P::Int(self.u32()? as i32 as i64),
            3 => P::Str(String::from_utf8_lossy(self.bytes()?).into_owned()),
            4 => P::Bytes(self.bytes()?.to_vec()),
            5 => {
                let n = self.u32()?;
                P::Array((0..n).map(|_| self.value()).collect::<Result<_, _>>()?)
            }
            6 => {
                let n = self.u32()?;
                let mut o = Vec::new();
                for _ in 0..n {
                    let k = String::from_utf8_lossy(self.bytes()?).into_owned();
                    o.push((k, self.value()?));
                }
                P::Object(o)
            }
            _ => return Err("invalid esbuild packet".into()),
        })
    }
}

/// A running `esbuild --service` process.
struct Esbuild {
    child: Child,
    stdin: std::process::ChildStdin,
    stdout: std::process::ChildStdout,
    next_id: u32,
    responses: HashMap<u32, P>,
}

impl Drop for Esbuild {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Esbuild {
    /// The esbuild executable the repository ships (a dependency of tsx),
    /// found the way node would find the package: PIKKU_ESBUILD, then every
    /// node_modules from the project directory upwards.
    fn locate(dir: &str) -> Result<Esbuild, String> {
        let exe = find_esbuild(Path::new(dir))
            .ok_or_else(|| format!("no esbuild executable found from {dir} (install the esbuild package, or set PIKKU_ESBUILD)"))?;
        let version = Command::new(&exe)
            .arg("--version")
            .output()
            .map_err(|e| format!("running {}: {e}", exe.display()))?;
        let version = String::from_utf8_lossy(&version.stdout).trim().to_string();
        let mut child = Command::new(&exe)
            .arg(format!("--service={version}"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("starting {}: {e}", exe.display()))?;
        let stdin = child.stdin.take().expect("piped");
        let stdout = child.stdout.take().expect("piped");
        let mut esb = Esbuild { child, stdin, stdout, next_id: 0, responses: HashMap::new() };
        // The first packet is the binary's version.
        esb.read_packet()?;
        Ok(esb)
    }

    fn read_packet(&mut self) -> Result<Vec<u8>, String> {
        let mut len = [0u8; 4];
        self.stdout.read_exact(&mut len).map_err(|e| format!("esbuild stopped: {e}"))?;
        let mut buf = vec![0u8; u32::from_le_bytes(len) as usize];
        self.stdout.read_exact(&mut buf).map_err(|e| format!("esbuild stopped: {e}"))?;
        Ok(buf)
    }

    fn send(&mut self, id: u32, is_request: bool, v: &P) -> Result<(), String> {
        let mut body = Vec::new();
        body.extend_from_slice(&((id << 1) | (!is_request) as u32).to_le_bytes());
        encode_value(&mut body, v);
        let mut packet = (body.len() as u32).to_le_bytes().to_vec();
        packet.extend_from_slice(&body);
        self.stdin.write_all(&packet).and_then(|_| self.stdin.flush()).map_err(|e| format!("esbuild stopped: {e}"))
    }

    /// Sends a request and serves whatever esbuild asks meanwhile, until the
    /// answer arrives.
    fn request(&mut self, v: P, conv: &ZodjsConverter) -> Result<P, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(id, true, &v)?;
        loop {
            if let Some(r) = self.responses.remove(&id) {
                if let Some(P::Str(e)) = r.get("error") {
                    return Err(e.clone());
                }
                return Ok(r);
            }
            let packet = self.read_packet()?;
            let mut rd = Reader { b: &packet, at: 0 };
            let head = rd.u32()?;
            let value = rd.value()?;
            let pid = head >> 1;
            if head & 1 == 0 {
                let command = value.get("command").and_then(P::as_str).unwrap_or_default().to_string();
                let answer = match command.as_str() {
                    "ping" => obj([]),
                    "on-start" => obj([("errors", P::Array(vec![])), ("warnings", P::Array(vec![]))]),
                    "on-resolve" => conv.on_resolve(self, &value)?,
                    "on-load" => conv.on_load(&value),
                    other => obj([("errors", P::Array(vec![obj([("text", format!("Invalid command: {other}").as_str().into())])]))]),
                };
                self.send(pid, false, &answer)?;
            } else {
                self.responses.insert(pid, value);
            }
        }
    }

    /// api.Build with the options Go's `bundle` sets: stdin as the entry,
    /// in memory, one output file.
    fn build(&mut self, flags: &[String], entry: &str, conv: &ZodjsConverter) -> Result<Vec<u8>, String> {
        let filter = |s: &str, ns: &str| (s.to_string(), ns.to_string());
        let hooks = |ids: [i64; 2], filters: [(String, String); 2]| {
            P::Array(
                ids.iter()
                    .zip(filters)
                    .map(|(id, (f, ns))| obj([("id", (*id).into()), ("filter", f.as_str().into()), ("namespace", ns.as_str().into())]))
                    .collect(),
            )
        };
        let plugin = obj([
            ("name", "pikku-zodjs".into()),
            ("onStart", P::Bool(false)),
            ("onEnd", P::Bool(false)),
            ("onResolve", hooks([ID_RESOLVE_PIKKU, ID_RESOLVE_BARE], [filter("^pikku:", ""), filter("^[^./]", "")])),
            ("onLoad", hooks([ID_LOAD_PIKKU, ID_LOAD_STUB], [filter(".*", "pikku"), filter(".*", STUB_NAMESPACE)])),
        ]);
        let request = obj([
            ("command", "build".into()),
            ("key", 0i64.into()),
            ("entries", P::Array(vec![])),
            ("flags", P::Array(flags.iter().map(|f| P::from(f.as_str())).collect())),
            ("write", P::Bool(false)),
            ("stdinContents", P::Bytes(entry.as_bytes().to_vec())),
            ("stdinResolveDir", conv.dir.as_str().into()),
            ("absWorkingDir", std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default().as_str().into()),
            ("nodePaths", P::Array(vec![])),
            ("context", P::Bool(false)),
            ("plugins", P::Array(vec![plugin])),
        ]);
        let res = self.request(request, conv)?;
        if let Some(first) = res.get("errors").and_then(|e| e.items().first()) {
            let mut msg = first.get("text").and_then(P::as_str).unwrap_or_default().to_string();
            if let Some(loc) = first.get("location").filter(|l| !matches!(l, P::Null)) {
                msg = format!(
                    "{}:{}: {msg}",
                    loc.get("file").and_then(P::as_str).unwrap_or_default(),
                    loc.get("line").and_then(P::as_int).unwrap_or(0)
                );
            }
            return Err(format!("bundling the modules that declare Zod schemas: {msg}"));
        }
        match res.get("outputFiles").and_then(|o| o.items().first()).and_then(|f| f.get("contents")) {
            Some(P::Bytes(b)) => Ok(b.clone()),
            _ => Err("bundling the modules that declare Zod schemas: esbuild produced no output".into()),
        }
    }
}

fn find_esbuild(dir: &Path) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("PIKKU_ESBUILD").map(PathBuf::from).filter(|p| p.is_file()) {
        return Some(p);
    }
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        o => o,
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        "x86" => "ia32",
        a => a,
    };
    let pkg = format!("{os}-{arch}");
    let (rel, file) = if os == "win32" { ("", "esbuild.exe") } else { ("bin", "esbuild") };
    let mut seen = HashSet::new();
    let mut cur = Some(dir);
    while let Some(d) = cur {
        let nm = d.join("node_modules");
        let direct = nm.join("@esbuild").join(&pkg).join(rel).join(file);
        if direct.is_file() && seen.insert(direct.clone()) {
            return Some(direct);
        }
        // bun and pnpm keep packages beside their dependents.
        for store in [".bun", ".pnpm"] {
            if let Ok(rd) = std::fs::read_dir(nm.join(store)) {
                let mut names: Vec<_> = rd
                    .flatten()
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .filter(|n| n.starts_with(&format!("@esbuild+{pkg}@")))
                    .collect();
                names.sort();
                for n in names.iter().rev() {
                    let p = nm.join(store).join(n).join("node_modules/@esbuild").join(&pkg).join(rel).join(file);
                    if p.is_file() {
                        return Some(p);
                    }
                }
            }
        }
        // The esbuild package's own bin is the native executable unless an
        // install script has not replaced the shim.
        let bin = nm.join("esbuild").join("bin").join("esbuild");
        if let Ok(mut f) = std::fs::File::open(&bin) {
            let mut magic = [0u8; 2];
            if f.read_exact(&mut magic).is_ok() && &magic != b"#!" {
                return Some(bin);
            }
        }
        cur = d.parent();
    }
    None
}
