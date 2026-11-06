//! Port of Go `internal/schemas/zodjs`: converts Zod schemas without loading
//! the project's modules under plain Node. The modules that declare them are
//! bundled with esbuild (a Node-side script, because Rust has no esbuild),
//! every import that is not zod, not part of the project and not resolvable is
//! replaced by a stub, and the bundle runs in a bare V8 context where Go runs
//! QuickJS. A schema that cannot be converted that way goes to the Node
//! converter when there is one (see `Converter::convert`).

use std::collections::HashMap;
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde_json::{json, Value};

use super::vendor::{ConvertError, VendorRef, VendorResult, VendorSchema, VendorSchemaConverter};
use crate::state::raw::Raw;

const BUNDLE_SCRIPT: &str = include_str!("zodjs-bundle.mjs");
const RUNNER_JS: &str = include_str!("../../../inspector-go/internal/schemas/zodjs/runner.js");
const HELPERS_JS: &str = include_str!("../../../inspector-go/internal/schemas/zodjs/helpers.gen.js");

pub struct Converter {
    /// The project root: zod and the project's imports resolve from it.
    pub dir: String,
    pub tsconfig: String,
    /// Where else `esbuild` may be resolved from (the Node converter's script, this binary).
    pub bases: Vec<String>,
    pub fallback: Option<Box<dyn VendorSchemaConverter>>,
}

enum Run {
    Done { schemas: Vec<Value>, errors: Vec<String>, fallback: Vec<(String, String)> },
    Failed(String),
}

impl Converter {
    fn run(&self, refs: &[VendorRef], timeout: Duration) -> Result<Run, ConvertError> {
        let env: HashMap<String, String> = std::env::vars().collect();
        let input = json!({
            "dir": self.dir,
            "tsconfig": self.tsconfig,
            "bases": self.bases,
            "env": env,
            "platform": if cfg!(windows) { "win32" } else { std::env::consts::OS },
            "helpersJS": HELPERS_JS,
            "runnerJS": RUNNER_JS,
            "refs": refs.iter().map(|r| json!({
                "name": r.name,
                "sourceFile": r.schema_ref.source_file,
                "schemaRef": serde_json::to_value(&r.schema_ref).unwrap_or(Value::Null),
            })).collect::<Vec<_>>(),
        });
        let bytes = serde_json::to_vec(&input).map_err(|e| ConvertError::Failed(e.to_string()))?;
        let mut child = Command::new("node")
            .args(["--input-type=module", "-e", BUNDLE_SCRIPT])
            .current_dir(&self.dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| ConvertError::Failed(format!("starting node: {e}")))?;
        let mut stdin = child.stdin.take().expect("piped");
        let writer = std::thread::spawn(move || {
            let _ = stdin.write_all(&bytes);
        });
        let mut stdout = child.stdout.take().expect("piped");
        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
        let reader = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = std::io::Read::read_to_end(&mut stdout, &mut buf);
            let _ = tx.send(buf);
        });
        let out = match rx.recv_timeout(timeout) {
            Ok(b) => b,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(ConvertError::Timeout(timeout));
            }
        };
        let _ = writer.join();
        let _ = child.wait();
        let _ = reader.join();
        let v: Value = match serde_json::from_slice(&out) {
            Ok(v) => v,
            Err(e) => return Ok(Run::Failed(format!("reading the zodjs result: {e}"))),
        };
        if let Some(e) = v.get("unavailable").and_then(Value::as_str) {
            return Ok(Run::Failed(e.to_string()));
        }
        if let Some(e) = v.get("error").and_then(Value::as_str) {
            return Ok(Run::Failed(e.to_string()));
        }
        let r = &v["result"];
        let strs = |k: &str| -> Vec<String> {
            r.get(k).and_then(Value::as_array).map(|a| a.iter().filter_map(|e| e.as_str().map(String::from)).collect()).unwrap_or_default()
        };
        Ok(Run::Done {
            schemas: r.get("schemas").and_then(Value::as_array).cloned().unwrap_or_default(),
            errors: strs("errors"),
            fallback: r
                .get("fallback")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .map(|p| (p[0].as_str().unwrap_or_default().to_string(), p[1].as_str().unwrap_or_default().to_string()))
                        .collect()
                })
                .unwrap_or_default(),
        })
    }
}

fn decode(pair: &Value) -> VendorSchema {
    let body = &pair[1];
    VendorSchema {
        name: pair[0].as_str().unwrap_or_default().to_string(),
        schema: Raw::of(body.get("schema").cloned().unwrap_or(Value::Null)),
        type_text: body.get("typeText").and_then(Value::as_str).unwrap_or_default().to_string(),
    }
}

impl VendorSchemaConverter for Converter {
    fn convert(&self, refs: &[VendorRef], timeout: Duration) -> Result<VendorResult, ConvertError> {
        let run = match self.run(refs, timeout) {
            Ok(Run::Done { schemas, errors, fallback }) => (schemas, errors, fallback),
            Ok(Run::Failed(msg)) => {
                return match &self.fallback {
                    Some(f) => f.convert(refs, timeout),
                    None => Err(ConvertError::Failed(format!("converting Zod schemas without Node: {msg}"))),
                };
            }
            Err(e) => return Err(e),
        };
        let (out_schemas, out_errors, out_fallback) = run;
        let mut converted: HashMap<String, VendorSchema> = HashMap::new();
        for pair in &out_schemas {
            let s = decode(pair);
            converted.insert(s.name.clone(), s);
        }
        let mut res = VendorResult { schemas: Vec::new(), errors: out_errors };
        if !out_fallback.is_empty() {
            let reasons: HashMap<&str, &str> = out_fallback.iter().map(|(n, r)| (n.as_str(), r.as_str())).collect();
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
                Some(f) => {
                    let via_node = f.convert(&pending, timeout)?;
                    for s in via_node.schemas {
                        converted.insert(s.name.clone(), s);
                    }
                    res.errors.extend(via_node.errors);
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
