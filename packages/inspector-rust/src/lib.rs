//! `pikku-inspect-rs`: a Rust port of the Go inspector (`packages/inspector-go`,
//! `pikku-inspect`) on the tsrs compiler crates. It speaks the same JSON
//! protocol; the Go binary is the oracle (see PORTING.md).
//!
//! The module layout mirrors Go's `internal/` packages one to one:
//!
//! | Rust            | Go                      |
//! |-----------------|-------------------------|
//! | [`protocol`]    | `internal/protocol`     |
//! | [`state`]       | `internal/state`        |
//! | [`jsjson`]      | `internal/jsjson`       |
//! | [`diag`]        | `internal/diag`         |
//! | [`program`]     | `internal/program`      |
//! | [`analyze`]     | `internal/analyze`      |
//! | [`visit`]       | `internal/visit`        |
//! | [`typesmap`]    | `internal/typesmap`     |
//! | [`tsutil`]      | `internal/tsutil`       |
//! | [`schemas`]     | `internal/schemas`      |
//! | [`finalize`]    | `internal/finalize`     |
//! | [`helpers`]     | `internal/helpers`      |

pub mod analyze;
pub mod diag;
pub mod finalize;
pub mod helpers;
pub mod jsjson;
pub mod program;
pub mod protocol;
pub mod schemas;
pub mod sourcescan;
pub mod surface;
pub mod state;
pub mod tsutil;
pub mod typesmap;
pub mod visit;
