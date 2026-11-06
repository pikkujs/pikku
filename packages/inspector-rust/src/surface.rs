//! Port of Go `internal/surface` (collectSurface). Not yet ported.

use serde_json::value::RawValue;

use crate::helpers::Error;

pub fn collect_surface_params(_params: &[u8]) -> Result<Box<RawValue>, Error> {
    Err(Error { name: String::new(), message: "collectSurface: not implemented in pikku-inspect-rs".into() })
}
