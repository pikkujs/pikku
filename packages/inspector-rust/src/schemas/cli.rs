//! `pikku-inspect-rs schemas --stdin`: schema generation in isolation (Rust
//! only, no Go counterpart). Input `{"state": <State>, "options": {"schemaConfig": ..}}`
//! (a Go or Rust response's state works); output `{"schemas": {..}, "diagnostics": [..]}`.

use std::io::{Read, Write};

use serde::{Deserialize, Serialize};

use crate::diag::{Diagnostic, Logger};
use crate::protocol::Options;
use crate::state::State;
use crate::state::ordered::Record;
use crate::state::raw::Raw;

#[derive(Deserialize, Default)]
#[serde(default)]
struct Input {
    state: Option<Box<State>>,
    options: Options,
}

#[derive(Serialize)]
struct Output {
    schemas: Record<Raw>,
    diagnostics: Vec<Diagnostic>,
    #[serde(skip_serializing_if = "String::is_empty")]
    error: String,
}

pub fn run<R: Read, W: Write>(r: R, mut w: W) -> Result<(), String> {
    let input: Input = serde_json::from_reader(r).map_err(|e| format!("reading request: {e}"))?;
    let Some(mut state) = input.state else { return Err("schemas: request has no state".into()) };
    let Some(sc) = input.options.schema_config.as_ref() else { return Err("schemas: request has no options.schemaConfig".into()) };
    let mut log = Logger::new();
    let mut cfg = super::config_from_protocol(sc, &state.root_dir);
    // Test hook: answer the Zod conversion from the schemas/typesMap already in
    // the input state (Go's answer), to measure the TypeScript side in isolation.
    if std::env::var_os("PIKKU_SCHEMAS_REPLAY_VENDOR").is_some() {
        cfg.vendor = Some(Box::new(Replay { schemas: state.schemas.clone(), types: state.functions.types_map.clone() }));
    }
    let (schemas, error) = match super::generate_all(&mut log, &cfg, &mut state, None) {
        Ok(s) => (s, String::new()),
        Err(e) => (Record::new(), e),
    };
    let out = Output { schemas, diagnostics: log.entries(), error };
    let mut b = crate::jsjson::marshal(&out, "").map_err(|e| e.to_string())?;
    b.push(b'\n');
    w.write_all(&b).map_err(|e| e.to_string())
}

/// Replays vendor conversions from a state that already has them.
struct Replay {
    schemas: Record<Raw>,
    types: crate::typesmap::TypesMap,
}

impl super::vendor::VendorSchemaConverter for Replay {
    fn convert(
        &self,
        refs: &[super::vendor::VendorRef],
        _timeout: std::time::Duration,
    ) -> Result<super::vendor::VendorResult, super::vendor::ConvertError> {
        let mut res = super::vendor::VendorResult::default();
        for r in refs {
            if let (Some(schema), Some(ct)) = (self.schemas.get(&r.name), self.types.custom_type(&r.name)) {
                res.schemas.push(super::vendor::VendorSchema { name: r.name.clone(), schema: schema.clone(), type_text: ct.ty.clone() });
            }
        }
        Ok(res)
    }
}
