//! Port of Go `internal/schemas/generate.go`: `generateAllSchemas`.

use std::collections::HashSet;
use std::time::Duration;

use super::customtypes::generate_custom_types;
use super::names::{is_primitive, primitive_type_to_schema, schema_names};
use super::program::{create_schema_program, virtual_file_path};
use super::vendor::{ConvertError, VendorRef, VendorSchema, VendorSchemaConverter};
use crate::diag::Logger;
use crate::diag::codes::SCHEMA_GENERATION_ERROR;
use crate::jsjson;
use crate::program::Cache;
use crate::state::State;
use crate::state::ordered::Record;
use crate::state::raw::Raw;
use crate::tsjg::config::{Config as GenConfig, DiscriminatorType, Expose, JsDocMode};
use crate::tsjg::factory::{create_formatter, create_parser};
use crate::tsjg::generator::{GenError, SchemaGenerator};
use crate::tsjg::schema::to_value;

/// The TS schemaConfig ({ tsconfig, schemasFromTypes, schema, cacheDir }) plus
/// the converter for Zod schemas.
pub struct Config {
    pub tsconfig: String,
    pub schemas_from_types: Vec<String>,
    /// schema.additionalProperties; None means false.
    pub additional_properties: Option<bool>,
    /// Where the TS schemas are cached across runs. NOT IMPLEMENTED in the Rust
    /// port (the cache is a performance feature only, see PORTING.md).
    pub cache_dir: String,
    /// Converts schemaLookup. When the lookup is non-empty and this is None,
    /// generation fails rather than return a state missing them.
    pub vendor: Option<Box<dyn VendorSchemaConverter>>,
}

/// generateAllSchemas. Like the TS it adds each converted Zod schema's type to
/// the typesMap as a custom type, and its result replaces `state.schemas`. An
/// error means inspection failed, as the TS throw does.
pub fn generate_all(log: &mut Logger, cfg: &Config, st: &mut State, cache: Option<&Cache>) -> Result<Record<Raw>, String> {
    let vendor_schemas = generate_vendor_schemas(log, cfg.vendor.as_deref(), st)?;
    let covered: HashSet<String> = vendor_schemas.iter().map(|s| s.name.clone()).collect();

    let ts_schemas = generate_ts_schemas(log, cfg, st, &covered, cache);

    let mut out = Record::new();
    for (k, v) in ts_schemas.iter() {
        out.set(k.to_string(), v.clone());
    }
    for s in vendor_schemas {
        out.set(s.name, s.schema);
    }
    Ok(out)
}

const DEFAULT_VENDOR_TIMEOUT: Duration = Duration::from_secs(120);

fn vendor_timeout() -> Duration {
    match std::env::var("PIKKU_VENDOR_SCHEMA_TIMEOUT_MS").ok().and_then(|s| s.parse::<u64>().ok()) {
        Some(ms) if ms > 0 => Duration::from_millis(ms),
        _ => DEFAULT_VENDOR_TIMEOUT,
    }
}

/// generateZodSchemas.
fn generate_vendor_schemas(
    log: &mut Logger,
    conv: Option<&dyn VendorSchemaConverter>,
    st: &mut State,
) -> Result<Vec<VendorSchema>, String> {
    if st.schema_lookup.is_empty() {
        return Ok(Vec::new());
    }
    let mut refs = Vec::with_capacity(st.schema_lookup.len());
    let mut files = HashSet::new();
    for name in st.schema_lookup.keys() {
        let r = st.schema_lookup.get(name).expect("key").clone();
        if !r.vendor.is_empty() && r.vendor != "zod" {
            return Err(format!(
                "Schema '{name}' uses {} which is not yet supported for JSON Schema generation. \
                 Currently only Zod schemas can be converted to JSON Schema. \
                 Please use Zod or contribute support for {}.",
                r.vendor, r.vendor
            ));
        }
        files.insert(r.source_file.clone());
        refs.push(VendorRef { name: name.to_string(), schema_ref: r });
    }
    let Some(conv) = conv else {
        return Err(format!(
            "{} Zod schema(s) need converting to JSON Schema, which takes a JavaScript runtime, and no vendor schema converter is configured",
            refs.len()
        ));
    };
    log.debug(format!("[TIMING] Zod schemas: {} schemas from {} files", refs.len(), files.len()));
    let start = std::time::Instant::now();
    let timeout = vendor_timeout();
    let res = match conv.convert(&refs, timeout) {
        Ok(r) => r,
        Err(ConvertError::Timeout(_)) => {
            return Err(format!(
                "Zod schema conversion did not answer within {}. Set PIKKU_VENDOR_SCHEMA_TIMEOUT_MS to allow longer: context deadline exceeded",
                go_duration(timeout)
            ));
        }
        Err(ConvertError::Failed(m)) => return Err(m),
    };
    if !res.errors.is_empty() {
        for msg in &res.errors {
            log.error(msg.clone());
        }
        let plural = if res.errors.len() == 1 { "" } else { "s" };
        return Err(format!("Schema generation failed for {} schema{plural}", res.errors.len()));
    }
    for s in &res.schemas {
        st.functions.types_map.add_custom_type(&s.name, &s.type_text, Vec::new());
    }
    log.debug(format!("[TIMING] Vendor schemas: {}ms ({} generated)", start.elapsed().as_millis(), res.schemas.len()));
    Ok(res.schemas)
}

/// Go's Duration.String for whole seconds/minutes (messages only).
fn go_duration(d: Duration) -> String {
    let s = d.as_secs();
    if d.subsec_millis() == 0 && s % 60 == 0 && s >= 60 {
        format!("{}m0s", s / 60)
    } else if d.subsec_millis() == 0 {
        format!("{s}s")
    } else {
        format!("{}ms", d.as_millis())
    }
}

/// The option set generateTSSchemas passes over DEFAULT_CONFIG.
fn generator_config(additional_properties: bool) -> GenConfig {
    GenConfig {
        skip_type_check: true,
        top_ref: false,
        discriminator_type: DiscriminatorType::OpenApi,
        expose: Expose::Export,
        js_doc: JsDocMode::Extended,
        sort_props: true,
        strict_tuples: false,
        encode_refs: false,
        additional_properties,
        ..GenConfig::default()
    }
}

/// generateTSSchemas: schemas for the names zod did not cover, from a second
/// program rooted at the custom-types virtual file.
fn generate_ts_schemas(
    log: &mut Logger,
    cfg: &Config,
    st: &State,
    covered: &HashSet<String>,
    cache: Option<&Cache>,
) -> Record<Raw> {
    let mut schemas: Record<Raw> = Record::new();
    let tm = &st.functions.types_map;
    let (content, _) = generate_custom_types(tm);

    let names = schema_names(st, &cfg.schemas_from_types);
    let uncovered: Vec<String> = names.into_iter().filter(|n| !is_primitive(n) && !covered.contains(n)).collect();
    if uncovered.is_empty() {
        return schemas;
    }
    let sample = &uncovered[..uncovered.len().min(3)];
    let more = if uncovered.len() > 3 { "..." } else { "" };
    log.debug(format!("generateTSSchemas needed for {} types: {}{more}", uncovered.len(), sample.join(", ")));

    let start = std::time::Instant::now();
    let prog = create_schema_program(&cfg.tsconfig, &virtual_file_path(&cfg.tsconfig), &content, cache);
    let source_files = prog.source_files();
    log.debug(format!("Created schema program in {}ms ({} files)", start.elapsed().as_millis(), source_files.len()));

    let gcfg = generator_config(cfg.additional_properties == Some(true));
    let gen_ = SchemaGenerator::new(
        source_files,
        prog.root_file_names.clone(),
        prog.checker.clone(),
        create_parser(prog.checker.clone(), &gcfg),
        create_formatter(&gcfg),
        gcfg.clone(),
    );

    for name in &uncovered {
        match gen_.create_schema(std::slice::from_ref(name)) {
            Ok(def) => {
                let v = to_value(&def);
                match jsjson::marshal(&v, "") {
                    Ok(b) => {
                        let parsed: serde_json::Value = serde_json::from_slice(&b).expect("own output");
                        schemas.set(name.clone(), Raw::of(parsed));
                        continue;
                    }
                    Err(e) => log_error(log, name, &e.to_string(), tm.custom_type(name).map(|c| c.ty.as_str())),
                }
            }
            Err(GenError::Rootless(_)) => {
                if let Some(ct) = tm.custom_type(name) {
                    if let Some(fallback) = primitive_type_to_schema(&ct.ty) {
                        schemas.set(name.clone(), fallback);
                    }
                }
            }
            Err(GenError::Other(m)) => log_error(log, name, &m, tm.custom_type(name).map(|c| c.ty.as_str())),
        }
    }
    schemas
}

fn log_error(log: &mut Logger, name: &str, msg: &str, custom_type: Option<&str>) {
    let info = match custom_type {
        Some(t) => format!("type={t}"),
        None => "not in typesMap".to_string(),
    };
    log.error(format!("[{SCHEMA_GENERATION_ERROR}] Error generating schema: {name}. Message: {msg}. Type info: {info}"));
}
