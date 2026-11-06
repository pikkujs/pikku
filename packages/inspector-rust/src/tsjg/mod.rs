//! Port of Go `internal/tsjg`: the vendored ts-json-schema-generator (vega's
//! typescript-go port, MIT) on the tsrs checker and AST.
//!
//! Error convention (as in Go): parsers and formatters report failures by
//! unwinding with a [`Failure`] payload (the TypeScript throws); the generator
//! boundary catches it with [`catch`] and returns the message.

pub mod config;
pub mod formatter;
pub mod generator;
pub mod parser;
pub mod schema;
pub mod tsutils;
pub mod typenode;
pub mod types;

/// The panic payload for a generator error (Go: `panic(err)`).
#[derive(Debug)]
pub struct Failure(pub String);

/// Go `panic(fmt.Errorf(..))`.
pub fn fail(msg: &str) -> ! {
    std::panic::panic_any(Failure(msg.to_string()))
}

/// Runs `f`, turning a [`Failure`] unwind into `Err(message)`. Any other panic
/// (a bug, Go's `runtime.Error`) is re-raised.
pub fn catch<T>(f: impl FnOnce() -> T) -> Result<T, String> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(v) => Ok(v),
        Err(payload) => match payload.downcast::<Failure>() {
            Ok(f) => Err(f.0),
            Err(other) => std::panic::resume_unwind(other),
        },
    }
}
