//! Port of Go `internal/schemas` (+ `internal/tsjg`, `internal/schemas/zodjs`):
//! `schema-generator.ts` `generateAllSchemas`.

pub mod customtypes;
pub mod names;
pub mod program;
pub mod vendor;
pub mod zodjs;
pub mod cli;
pub mod generate;

pub use generate::{Config, generate_all};

use crate::protocol::SchemaConfig;

/// Go `analyze.schemaConfig`: maps inspect()'s schemaConfig onto this
/// package's. schema.supportsImportAttributes is codegen-only and not read here.
///
/// Zod schemas convert in embedded QuickJS over an esbuild bundle (`zodjs`),
/// Node only as the fallback. PIKKU_INSPECTOR_ZOD=node converts every schema
/// under Node, =quickjs never falls back to it.
pub fn config_from_protocol(sc: &SchemaConfig, root_dir: &str) -> Config {
    let additional_properties =
        sc.schema.as_ref().and_then(|s| s.get("additionalProperties")).and_then(|v| v.as_bool());
    let mut node = node_converter(&sc.vendor_script, root_dir);
    let mode = std::env::var("PIKKU_INSPECTOR_ZOD").unwrap_or_default();
    let vendor: Option<Box<dyn vendor::VendorSchemaConverter>> = match (mode.as_str(), node.take()) {
        ("node", Some(n)) => Some(n),
        (m, n) => {
            let fallback = if m == "quickjs" { None } else { n };
            Some(Box::new(zodjs::ZodjsConverter { dir: root_dir.to_string(), tsconfig: sc.tsconfig.clone(), fallback }))
        }
    };
    Config {
        tsconfig: sc.tsconfig.clone(),
        schemas_from_types: sc.schemas_from_types.clone(),
        additional_properties,
        cache_dir: sc.cache_dir.clone(),
        vendor,
    }
}

/// The Node converter, or None without a node on the PATH or with the script
/// out of reach.
fn node_converter(script: &str, root_dir: &str) -> Option<Box<dyn vendor::VendorSchemaConverter>> {
    if script.is_empty() || std::fs::metadata(script).is_err() {
        return None;
    }
    let on_path = std::env::var_os("PATH")
        .is_some_and(|p| std::env::split_paths(&p).any(|d| d.join("node").is_file()));
    if !on_path {
        return None;
    }
    Some(Box::new(vendor::NodeConverter { node: String::new(), script: script.to_string(), dir: root_dir.to_string() }))
}
