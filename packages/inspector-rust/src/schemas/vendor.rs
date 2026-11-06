//! Port of Go `internal/schemas/vendor.go`: converting schemaLookup entries
//! (Zod values the analysis found as function input/output schemas) into JSON
//! Schema. The schema is a runtime value, so it is handed to a JavaScript
//! runtime.
//!
//! Go runs QuickJS (wazero) on an esbuild bundle first and falls back to Node;
//! this port converts in embedded QuickJS only (`zodjs`) and has no Node route,
//! see PORTING.md "Known gaps".

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
