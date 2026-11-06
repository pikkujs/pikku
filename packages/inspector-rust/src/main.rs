//! Command `pikku-inspect-rs`: the Rust inspector. Same CLI shape as Go's
//! `pikku-inspect`:
//!
//! ```text
//! pikku-inspect-rs --stdin                 one Request on stdin, one Response on stdout
//! pikku-inspect-rs inspect --stdin         the same (a trailing --finalize is accepted and ignored)
//! pikku-inspect-rs finalize --stdin        {state, diagnostics?, options}: finalize a pre-finalize state
//! pikku-inspect-rs serve                   NDJSON requests on stdin, responses on stdout
//! pikku-inspect-rs helper <method>         params JSON on stdin, {"result"} or {"error"} on stdout
//! ```
//!
//! Go's legacy bench mode (`pikku-inspect [-timing] <projectDir>`) is not ported.

use std::io::{self, BufRead, BufWriter, Read, Write};
use std::process::ExitCode;

use pikku_inspect::analyze::{self, RunError};
use pikku_inspect::diag::Diagnostic;
use pikku_inspect::program::Cache;
use pikku_inspect::protocol::{Options, Request, Response, ServeError, ServeRequest, ServeResponse};
use pikku_inspect::state::State;
use pikku_inspect::{finalize, helpers, jsjson, protocol};
use serde::{Deserialize, Serialize};
use serde_json::Value;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let a = |i: usize| args.get(i).map(String::as_str);
    let stdin = io::stdin();
    let stdout = io::stdout();
    let result = match a(0) {
        Some("--stdin") if args.len() == 1 => run_inspect(stdin.lock(), stdout.lock()),
        Some("inspect") => match (args.len(), a(1), a(2)) {
            (2, Some("--stdin"), _) | (3, Some("--stdin"), Some("--finalize")) | (3, Some("--finalize"), Some("--stdin")) => {
                run_inspect(stdin.lock(), stdout.lock())
            }
            _ => Err("usage: pikku-inspect inspect --stdin".to_string()),
        },
        Some("finalize") => {
            if args.len() != 2 || a(1) != Some("--stdin") {
                Err("usage: pikku-inspect finalize --stdin".to_string())
            } else {
                run_finalize(stdin.lock(), stdout.lock())
            }
        }
        Some("serve") => run_serve(stdin.lock(), stdout.lock()),
        Some("schemas") if args.len() == 2 && a(1) == Some("--stdin") => pikku_inspect::schemas::cli::run(stdin.lock(), stdout.lock()),
        Some("helper") => match (args.len(), a(1)) {
            (2, Some(m)) if helpers::has(m) => run_helper(m, stdin.lock(), stdout.lock()),
            _ => Err(format!("usage: pikku-inspect helper <method>, method one of [{}]", helpers::METHODS.join(" "))),
        },
        _ => Err("legacy bench mode is not implemented in pikku-inspect-rs; \
                  usage: pikku-inspect-rs --stdin | inspect --stdin | finalize --stdin | serve | helper <method>"
            .to_string()),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

fn write_json<W: Write, T: Serialize>(w: &mut W, v: &T) -> Result<(), String> {
    let mut b = jsjson::marshal(v, "").map_err(|e| e.to_string())?;
    b.push(b'\n');
    w.write_all(&b).map_err(|e| e.to_string())
}

/// Go `inspect`: analysis then finalize. A [`Failure`] comes back as a Response
/// with `error` set, so the diagnostics logged before it still reach the
/// wrapper; any other error is returned.
fn inspect(req: &Request, cache: Option<&Cache>) -> Result<Response, String> {
    let mut res = match analyze::run(req, cache) {
        Ok(r) => r,
        Err(RunError::Failure(f)) => return Ok(f.into_response()),
        Err(RunError::Other(m)) => return Err(m),
    };
    if let Err(f) = finalize::response(&mut res, &req.options) {
        return Ok(f.into_response());
    }
    Ok(res)
}

fn run_inspect<R: Read, W: Write>(r: R, mut w: W) -> Result<(), String> {
    let req: Request = serde_json::from_reader(r).map_err(|e| format!("reading request: {e}"))?;
    let res = inspect(&req, None)?;
    write_json(&mut w, &res)
}

/// The `finalize --stdin` input: a serialized pre-finalize state (the TS
/// reference's or the binary's own) and the options.
#[derive(Deserialize, Default)]
#[serde(default)]
struct FinalizeRequest {
    state: Option<Box<State>>,
    diagnostics: Option<Vec<Diagnostic>>,
    options: Options,
}

fn run_finalize<R: Read, W: Write>(r: R, mut w: W) -> Result<(), String> {
    let req: FinalizeRequest = serde_json::from_reader(r).map_err(|e| format!("reading request: {e}"))?;
    let Some(state) = req.state else { return Err("finalize: request has no state".to_string()) };
    let mut res = Response {
        protocol: protocol::VERSION,
        state: Some(state),
        diagnostics: req.diagnostics.unwrap_or_default(),
        ..Response::default()
    };
    if let Err(f) = finalize::response(&mut res, &req.options) {
        res = f.into_response();
    }
    write_json(&mut w, &res)
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct HelperRequest {
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

/// A helper's result is written even when it is null (readTsconfigOutDir
/// returns null for "no outDir").
#[derive(Serialize)]
struct HelperResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    result: Box<serde_json::value::RawValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<helpers::Error>,
}

fn run_helper<R: Read, W: Write>(method: &str, mut r: R, mut w: W) -> Result<(), String> {
    let mut params = Vec::new();
    r.read_to_end(&mut params).map_err(|e| format!("reading params: {e}"))?;
    let (result, error) = helpers::dispatch(method, &params);
    write_json(&mut w, &HelperResponse { id: None, result, error })
}

#[derive(serde::Deserialize, Default)]
#[serde(default)]
struct TypeDiagnosticsParams {
    root: String,
    path: String,
    content: Option<String>,
}

/// `typeDiagnostics` in serve mode, keeping one type-check service per
/// workspace root so its parsed files outlive a request.
fn type_diagnostics(
    id: Option<Value>,
    params: Option<Value>,
    services: &mut std::collections::HashMap<String, pikku_inspect::typecheck::Service>,
) -> HelperResponse {
    let null = || serde_json::value::RawValue::from_string("null".into()).unwrap();
    let p: TypeDiagnosticsParams = match params {
        None => TypeDiagnosticsParams::default(),
        Some(v) => match serde_json::from_value(v) {
            Ok(p) => p,
            Err(e) => {
                return HelperResponse {
                    id,
                    result: null(),
                    error: Some(helpers::Error { name: String::new(), message: format!("bad params: {e}") }),
                };
            }
        },
    };
    let svc = services
        .entry(p.root.clone())
        .or_insert_with(|| pikku_inspect::typecheck::Service::new(&p.root));
    let diags = svc.diagnostics(&p.path, p.content.as_deref());
    let raw = jsjson::marshal(&diags, "")
        .ok()
        .and_then(|b| String::from_utf8(b).ok())
        .and_then(|s| serde_json::value::RawValue::from_string(s).ok())
        .unwrap_or_else(null);
    HelperResponse { id, result: raw, error: None }
}

/// Answers one NDJSON request per line until stdin closes. Requests are handled
/// one at a time; the SourceFile cache carries parsed and bound files from one
/// request to the next, and every request gets a new checker.
fn run_serve<R: BufRead, W: Write>(r: R, w: W) -> Result<(), String> {
    let cache = Cache::new();
    let mut typecheckers: std::collections::HashMap<String, pikku_inspect::typecheck::Service> = Default::default();
    let mut out = BufWriter::new(w);
    for line in r.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.is_empty() {
            continue;
        }
        if let Ok(head) = serde_json::from_str::<HelperRequest>(&line) {
            if head.method == "typeDiagnostics" {
                let resp = type_diagnostics(head.id, head.params, &mut typecheckers);
                write_json(&mut out, &resp)?;
                out.flush().map_err(|e| e.to_string())?;
                continue;
            }
            if helpers::has(&head.method) {
                let params = head.params.map(|p| p.to_string()).unwrap_or_default();
                let (result, error) = helpers::dispatch(&head.method, params.as_bytes());
                write_json(&mut out, &HelperResponse { id: head.id, result, error })?;
                out.flush().map_err(|e| e.to_string())?;
                continue;
            }
        }
        let mut resp = ServeResponse::default();
        match serde_json::from_str::<ServeRequest>(&line) {
            Err(e) => resp.error = Some(ServeError { message: format!("bad request: {e}") }),
            Ok(req) => {
                resp.id = req.id;
                match req.method.as_str() {
                    "inspect" => match inspect(&req.params, Some(&cache)) {
                        Ok(res) => resp.result = Some(res),
                        Err(e) => resp.error = Some(ServeError { message: e }),
                    },
                    other => resp.error = Some(ServeError { message: format!("unknown method {other}") }),
                }
            }
        }
        write_json(&mut out, &resp)?;
        out.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}
