//! Port of Go `internal/finalize`: everything after analysis (contract hashes,
//! manifest, service aggregation, validators, OpenAPI, ...), run on the
//! returned state.
//!
//! Status: NOT PORTED. [`response`] is a no-op that leaves `finalized` false, so
//! a Rust response is visibly pre-finalize. Port the Go package file by file
//! (`run.go` is the entry), keeping its order.

use crate::protocol::{Failure, Options, Response};

/// Go `finalize.Response(res, opts)`: runs finalize over an analyzed response.
/// Currently a no-op (see the module docs).
pub fn response(_res: &mut Response, _opts: &Options) -> Result<(), Failure> {
    Ok(())
}
