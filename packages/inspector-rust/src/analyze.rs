//! Port of Go `internal/analyze`: `inspect()` up to the finalize boundary.
//! Build the program, run the setup / functions / routes sweeps and the
//! analysis steps between them, generate schemas. Everything after that
//! belongs to [`crate::finalize`].
//!
//! The phase order below is Go's `analyze.Run`, line for line. Keep it.

use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::time::Instant;

use crate::diag::Logger;
use crate::program::{self, Cache};
use crate::protocol::{Failure, Request, Response, Stats, VERSION};
use crate::state::State;
use crate::visit::{self, Abort, Context, Phase, Registry};

/// Inspects one request with the registry of all ported groups. `cache` may be
/// `None`; serve mode passes one cache for the life of the process.
///
/// An error raised after logging began (an `Abort`, later a schema generation
/// failure) is a [`Failure`] that carries the diagnostics logged so far.
pub fn run(req: &Request, cache: Option<&Cache>) -> Result<Response, RunError> {
    run_with(req, cache, &visit::default_registry())
}

#[derive(Debug)]
pub enum RunError {
    /// Stopped with an error after logging: reported inside a Response.
    Failure(Failure),
    /// Any other error (the program could not be built): reported on stderr.
    Other(String),
}

impl std::fmt::Display for RunError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RunError::Failure(x) => x.fmt(f),
            RunError::Other(m) => f.write_str(m),
        }
    }
}

impl std::error::Error for RunError {}

/// [`run`] with an explicit registry (tests register their own visitors).
pub fn run_with(req: &Request, cache: Option<&Cache>, registry: &Registry) -> Result<Response, RunError> {
    let mut log = Logger::new();
    let start = Instant::now();
    if let Some(c) = cache {
        c.begin();
    }
    let result = catch_unwind(AssertUnwindSafe(|| run_inner(req, cache, registry, &mut log, start)));
    if let Some(c) = cache {
        c.prune();
    }
    match result {
        Ok(r) => r,
        Err(payload) => match payload.downcast::<Abort>() {
            Ok(abort) => Err(RunError::Failure(Failure { message: abort.message, diagnostics: log.entries() })),
            Err(other) => resume_unwind(other),
        },
    }
}

fn run_inner(
    req: &Request,
    cache: Option<&Cache>,
    registry: &Registry,
    log: &mut Logger,
    start: Instant,
) -> Result<Response, RunError> {
    let mut prog = program::create(
        &program::Options {
            route_files: req.route_files.clone(),
            root_dir: req.options.root_dir.clone(),
            tsconfig: req.options.tsconfig.clone(),
        },
        cache,
    )
    .map_err(RunError::Other)?;

    let mut st = State::new(prog.root_dir.clone());
    let allow = req.options.allow.clone().unwrap_or_default();
    let setup_only = req.options.setup_only;
    let files = prog.project_files.clone();
    {
        let mut ctx = Context::new(
            prog.checker(),
            &mut st,
            log,
            visit::Options {
                setup_only,
                allow_complex_workflows: allow.complex_workflows,
                allow_permissions_in_body: allow.permissions_in_body,
                classification_check: req.options.classification_check,
                is_addon: req.options.is_addon,
                types: None,
            },
        );

        ctx.sweep_usage(&files);
        ctx.sweep(registry, Phase::Setup, &files);
        ctx.load_addon_functions_meta();
        if !setup_only {
            ctx.sweep(registry, Phase::Functions, &files);
            ctx.sweep(registry, Phase::Routes, &files);
            ctx.check_disabled_workflow_steps();
            ctx.validate_webhook_source_triggers();
            ctx.validate_pikku_studio();
            ctx.resolve_latest_versions();
        }

        ctx.finish_core_type_properties();
        ctx.finish_service_types();
    }

    // The counts lock every checker, so the handle goes first.
    prog.release();
    let (types, instantiations, symbols) = prog.counts();
    let stats = Stats {
        files: req.route_files.len() as i64,
        project_files: files.len() as i64,
        files_reused: prog.files_reused as i64,
        types: types as i64,
        instantiations: instantiations as i64,
        symbols: symbols as i64,
        cpu_ms: process_cpu_ms(),
        wall_ms: start.elapsed().as_millis() as i64,
        // Go reports runtime.MemStats.HeapAlloc; Rust has no equivalent counter.
        heap_used_mb: 0,
    };

    // Schema generation (`req.options.schema_config`) is not ported: see schemas.rs.

    Ok(Response {
        protocol: VERSION,
        finalized: false,
        state: Some(Box::new(st)),
        diagnostics: log.entries(),
        stats,
        validation_pass: None,
        error: String::new(),
    })
}

/// User + system CPU time of the process in ms (Go `processCPUMs`).
fn process_cpu_ms() -> i64 {
    // /proc/self/stat fields 14 and 15 are utime and stime in clock ticks
    // (100 Hz on Linux); other platforms report 0.
    let Ok(stat) = std::fs::read_to_string("/proc/self/stat") else { return 0 };
    let Some(rest) = stat.rsplit_once(')').map(|(_, r)| r) else { return 0 };
    let f: Vec<&str> = rest.split_whitespace().collect();
    let ticks = |i: usize| f.get(i).and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
    (ticks(11) + ticks(12)) * 10
}
