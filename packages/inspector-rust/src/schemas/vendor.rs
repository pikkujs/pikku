//! Port of Go `internal/schemas/vendor.go`: converting schemaLookup entries
//! (Zod values the analysis found as function input/output schemas) into JSON
//! Schema. The schema is a runtime value, so it is handed to a JavaScript
//! runtime.
//!
//! Go runs QuickJS (wazero) on an esbuild bundle first and falls back to Node;
//! this port has only the Node route (`scripts/vendor-schemas.mjs`), see
//! PORTING.md "Known gaps".

use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde_json::Value;

use crate::state::meta::SchemaRef;
use crate::state::raw::Raw;

/// A schemaLookup entry with its key.
#[derive(Clone, Debug)]
pub struct VendorRef {
    pub name: String,
    pub schema_ref: SchemaRef,
}

#[derive(Clone, Debug)]
pub struct VendorSchema {
    pub name: String,
    /// JSON.stringify output, stored verbatim.
    pub schema: Raw,
    /// zodToTypeText's rendering, added to the typesMap as a custom type.
    pub type_text: String,
}

/// generateZodSchemas' outcome: the schemas converted, in processing order,
/// and one message per schema that could not be.
#[derive(Default)]
pub struct VendorResult {
    pub schemas: Vec<VendorSchema>,
    pub errors: Vec<String>,
}

pub enum ConvertError {
    Timeout(Duration),
    Failed(String),
}

pub trait VendorSchemaConverter {
    fn convert(&self, refs: &[VendorRef], timeout: Duration) -> Result<VendorResult, ConvertError>;
}

/// Runs a helper script (scripts/vendor-schemas.mjs speaks the protocol) under
/// Node: the schemaLookup goes in on stdin as the TS serializer writes it, the
/// result comes back on stdout.
pub struct NodeConverter {
    /// The node binary; "node" when empty.
    pub node: String,
    pub script: String,
    /// The working directory, normally the project root, so the user's modules
    /// resolve their dependencies as they do under the TS inspector.
    pub dir: String,
}

impl VendorSchemaConverter for NodeConverter {
    fn convert(&self, refs: &[VendorRef], timeout: Duration) -> Result<VendorResult, ConvertError> {
        let lookup: Vec<Value> = refs
            .iter()
            .map(|r| Value::Array(vec![Value::String(r.name.clone()), serde_json::to_value(&r.schema_ref).unwrap_or(Value::Null)]))
            .collect();
        let input = serde_json::to_vec(&lookup).map_err(|e| ConvertError::Failed(e.to_string()))?;
        let node = if self.node.is_empty() { "node" } else { &self.node };
        let failed = |e: String, stderr: &str| {
            ConvertError::Failed(format!("vendor schema conversion ({node} {}) failed: {e}\n{stderr}", self.script))
        };
        let mut child = Command::new(node)
            .arg(&self.script)
            .current_dir(&self.dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| failed(e.to_string(), ""))?;
        let mut stdin = child.stdin.take().expect("piped");
        let writer = std::thread::spawn(move || {
            let _ = stdin.write_all(&input);
        });
        let mut stdout = child.stdout.take().expect("piped");
        let mut stderr = child.stderr.take().expect("piped");
        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
        let out_reader = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = std::io::Read::read_to_end(&mut stdout, &mut buf);
            let _ = tx.send(buf);
        });
        let err_reader = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = std::io::Read::read_to_end(&mut stderr, &mut buf);
            buf
        });
        // The complete answer is what matters; waiting for the process to exit
        // can hang (Node can deadlock inside process.exit), so the answer is
        // read from the pipe and the child is killed.
        let bytes = match rx.recv_timeout(timeout) {
            Ok(b) => b,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(ConvertError::Timeout(timeout));
            }
        };
        let _ = writer.join();
        let status = child.wait();
        let _ = out_reader.join();
        let stderr_text = String::from_utf8_lossy(&err_reader.join().unwrap_or_default()).into_owned();
        let parsed: Result<Value, _> = serde_json::from_slice(&bytes);
        let out = match parsed {
            Ok(v) => v,
            Err(e) => {
                if let Ok(s) = status {
                    if !s.success() {
                        return Err(failed(s.to_string(), &stderr_text));
                    }
                }
                return Err(ConvertError::Failed(format!("vendor schema conversion returned invalid output: {e}")));
            }
        };
        let mut res = VendorResult::default();
        if let Some(errs) = out.get("errors").and_then(Value::as_array) {
            res.errors = errs.iter().filter_map(|e| e.as_str().map(String::from)).collect();
        }
        if let Some(schemas) = out.get("schemas").and_then(Value::as_array) {
            for pair in schemas {
                let name = pair.get(0).and_then(Value::as_str).unwrap_or_default().to_string();
                let body = pair.get(1).cloned().unwrap_or(Value::Null);
                let schema = body.get("schema").cloned().unwrap_or(Value::Null);
                let type_text = body.get("typeText").and_then(Value::as_str).unwrap_or_default().to_string();
                res.schemas.push(VendorSchema { name, schema: Raw::of(schema), type_text });
            }
        }
        Ok(res)
    }
}
