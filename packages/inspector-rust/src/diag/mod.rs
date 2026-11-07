//! Port of Go `internal/diag`: the Rust side of InspectorLogger. It records what
//! the visitors pass to `logger.critical / error / warn / info / debug`, with
//! the same code strings and message text, for the protocol's `diagnostics`
//! array.
//!
//! The error codes are the TS `ErrorCode` enum under its own names
//! (`diag::codes::MISSING_FUNC`); Go spells the same constants in PascalCase.

use serde::{Deserialize, Serialize};
use std::io::Write;

pub mod codes {
    include!("codes_gen.rs");
}

/// An ErrorCode value ("PKU236").
pub type Code = &'static str;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Critical,
    Error,
    Warn,
    Info,
    Debug,
}

/// One protocol diagnostics entry. Key order is `level`, `code`, `message`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Diagnostic {
    pub level: Level,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    pub message: String,
}

/// The half-open range `[start, end)` of entries logged inside a validation pass.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pass {
    pub start: usize,
    /// `-1` while the pass is open (Go uses an int for this too).
    pub end: i64,
}

/// Collects diagnostics. Debug lines are only kept when `verbose` is set (TS
/// `logger.debug` is likewise dropped unless the CLI runs with `--verbose`),
/// and are mirrored to `debug_out` when it is set.
#[derive(Default)]
pub struct Logger {
    entries: Vec<Diagnostic>,
    pass: Option<Pass>,
    pub verbose: bool,
    pub debug_out: Option<Box<dyn Write + Send>>,
}

impl Logger {
    pub fn new() -> Logger {
        Logger::default()
    }

    /// `logger.beginValidationPass()`: the CLI logger drops what earlier passes
    /// reported once a new one begins.
    pub fn begin_validation_pass(&mut self) {
        self.pass = Some(Pass { start: self.entries.len(), end: -1 });
    }

    /// `logger.endValidationPass()`.
    pub fn end_validation_pass(&mut self) {
        if let Some(p) = &mut self.pass {
            p.end = self.entries.len() as i64;
        }
    }

    /// The last validation pass, or `None` when none ran. A pass that was begun
    /// but not ended runs to the last entry.
    pub fn validation_pass(&self) -> Option<Pass> {
        self.pass.map(|mut p| {
            if p.end < 0 {
                p.end = self.entries.len() as i64;
            }
            p
        })
    }

    fn add(&mut self, d: Diagnostic) {
        self.entries.push(d);
    }

    /// `logger.critical(code, message)`.
    pub fn critical(&mut self, code: Code, message: impl Into<String>) {
        self.add(Diagnostic { level: Level::Critical, code: Some(code.to_string()), message: message.into() });
    }

    /// `logger.diagnostic({ severity, code, message })`.
    pub fn diagnostic(&mut self, level: Level, code: Code, message: impl Into<String>) {
        self.add(Diagnostic { level, code: Some(code.to_string()), message: message.into() });
    }

    pub fn error(&mut self, message: impl Into<String>) {
        self.add(Diagnostic { level: Level::Error, code: None, message: message.into() });
    }

    pub fn warn(&mut self, message: impl Into<String>) {
        self.add(Diagnostic { level: Level::Warn, code: None, message: message.into() });
    }

    pub fn info(&mut self, message: impl Into<String>) {
        self.add(Diagnostic { level: Level::Info, code: None, message: message.into() });
    }

    /// Go's `Debugf`: build the message with `format!` at the call site.
    pub fn debug(&mut self, message: impl Into<String>) {
        if !self.verbose && self.debug_out.is_none() {
            return;
        }
        let message = message.into();
        if let Some(out) = &mut self.debug_out {
            let _ = writeln!(out, "{message}");
        }
        if self.verbose {
            self.add(Diagnostic { level: Level::Debug, code: None, message });
        }
    }

    /// `logger.hasCriticalErrors()`.
    pub fn has_critical_errors(&self) -> bool {
        self.entries.iter().any(|d| d.level == Level::Critical)
    }

    /// The diagnostics in the order they were logged.
    pub fn entries(&self) -> Vec<Diagnostic> {
        self.entries.clone()
    }

    /// Appends entries recorded by an earlier logger, so a later phase (the
    /// finalize pass on an analyzed Response) continues the same list.
    pub fn seed(&mut self, entries: Vec<Diagnostic>) {
        self.entries.extend(entries);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialises_like_go() {
        let mut l = Logger::new();
        l.critical(codes::MISSING_FUNC, "no func");
        l.warn("careful");
        l.debug("dropped without verbose");
        assert_eq!(
            crate::jsjson::to_string(&l.entries()).unwrap(),
            r#"[{"level":"critical","code":"PKU236","message":"no func"},{"level":"warn","message":"careful"}]"#
        );
        assert!(l.has_critical_errors());
    }

    #[test]
    fn validation_pass_runs_to_the_last_entry_when_open() {
        let mut l = Logger::new();
        l.info("a");
        assert_eq!(l.validation_pass(), None);
        l.begin_validation_pass();
        l.info("b");
        assert_eq!(l.validation_pass(), Some(Pass { start: 1, end: 2 }));
        l.end_validation_pass();
        l.info("c");
        assert_eq!(l.validation_pass(), Some(Pass { start: 1, end: 2 }));
    }

    #[test]
    fn codes_are_generated() {
        assert_eq!(codes::MISSING_NAME, "PKU111");
    }
}
