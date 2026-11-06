//! Port of Go `internal/schemas` (+ `internal/tsjg`, `internal/schemas/zodjs`):
//! `schema-generator.ts` `generateAllSchemas`.

pub mod customtypes;
pub mod names;
pub mod program;
pub mod vendor;
pub mod transpile;
pub mod zodjs;
pub mod cli;
pub mod generate;

pub use generate::{Config, generate_all};

use crate::protocol::SchemaConfig;

/// Go `analyze.schemaConfig`: maps inspect()'s schemaConfig onto this
/// package's. schema.supportsImportAttributes is codegen-only and not read here.
///
/// Zod schemas convert in embedded QuickJS over TypeScript that tsrs emits
/// (`zodjs`); there is no Node route and no vendor script.
pub fn config_from_protocol(sc: &SchemaConfig, root_dir: &str) -> Config {
    let additional_properties =
        sc.schema.as_ref().and_then(|s| s.get("additionalProperties")).and_then(|v| v.as_bool());
    Config {
        tsconfig: sc.tsconfig.clone(),
        schemas_from_types: sc.schemas_from_types.clone(),
        additional_properties,
        cache_dir: sc.cache_dir.clone(),
        vendor: Some(Box::new(zodjs::ZodjsConverter { dir: root_dir.to_string(), tsconfig: sc.tsconfig.clone() })),
    }
}
