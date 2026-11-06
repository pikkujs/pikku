//! Port of Go `internal/visit`: the sweep state ([`Context`]), the visitor
//! registry and the three sweeps. A visitor group is one `add*` call of
//! `visit.ts`; ported groups live in sibling modules (Go: `group_*.go`,
//! `util_*.go`, `check_*.go`).
//!
//! # Adding a visitor group
//!
//! 1. Create `visit/group_<name>.rs` with
//!    `pub fn register(r: &mut Registry)` that calls
//!    `r.register(Visitor { name, phase, order, visit })`.
//! 2. Pick `order` from [`order`] (index x 10 of the `add*` call in `visit.ts`).
//! 3. Call your `register` from [`register_groups`].
//!
//! Go registers from `init()`; Rust has no life-before-main, so registration is
//! the explicit list in [`register_groups`]. Registry rules are Go's: two
//! visitors with the same phase and order, or the same name, panic.

use tsrs_ast::{Node, SourceFile};
use tsrs_checker::Checker;
use tsrs_core::P;

use crate::diag::Logger;
use crate::state::State;
use crate::typesmap::TypesMap;

pub mod addon_dependencies;
pub mod addon_json;
pub mod addon_load;
pub mod addon_resolve;
pub mod order;
pub mod scope_addon;
pub mod validate_addon_zod;

/// Go `visit.Abort`: a TS `throw` inside a visitor. It ends the inspection with
/// an error; [`abort`] raises it and `analyze::run` turns it into a
/// `protocol::Failure` that carries the diagnostics logged so far.
#[derive(Clone, Debug)]
pub struct Abort {
    pub message: String,
}

/// Raises an [`Abort`]. Unwinds without running the panic hook, so nothing is
/// printed; only `analyze::run` is meant to catch it.
pub fn abort(message: impl Into<String>) -> ! {
    std::panic::resume_unwind(Box::new(Abort { message: message.into() }))
}

/// `visit.ts`'s three sweeps.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Phase {
    Setup,
    Functions,
    Routes,
}

impl Phase {
    pub const ALL: [Phase; 3] = [Phase::Setup, Phase::Functions, Phase::Routes];

    pub fn as_str(self) -> &'static str {
        match self {
            Phase::Setup => "setup",
            Phase::Functions => "functions",
            Phase::Routes => "routes",
        }
    }

    fn index(self) -> usize {
        self as usize
    }
}

/// Types is InspectorOptions.types: the configured names of the core types.
/// Only finalize's getFilesAndMethods reads it; analysis passes it through.
#[derive(Clone, Debug, Default)]
pub struct Types {
    pub config_file_type: String,
    pub user_session_type: String,
    pub singleton_services_factory_type: String,
    pub wire_services_factory_type: String,
}

/// The subset of InspectorOptions the analysis reads.
#[derive(Clone, Debug, Default)]
pub struct Options {
    pub setup_only: bool,
    /// options.allow.complexWorkflows.
    pub allow_complex_workflows: bool,
    /// options.allow.permissionsInBody.
    pub allow_permissions_in_body: bool,
    /// options.classificationCheck (`pikku all --security`).
    pub classification_check: bool,
    pub types: Option<Types>,
    pub is_addon: bool,
}

/// What every visitor receives: the TS visitors' (logger, checker, state,
/// options) arguments in one place, plus the file being swept.
pub struct Context<'a> {
    pub checker: &'a mut Checker,
    pub state: &'a mut State,
    pub log: &'a mut Logger,
    pub options: Options,
    pub root_dir: String,
    /// The file being swept; `None` outside a sweep.
    pub source_file: Option<P<SourceFile>>,
}

impl<'a> Context<'a> {
    pub fn new(checker: &'a mut Checker, state: &'a mut State, log: &'a mut Logger, options: Options) -> Context<'a> {
        let root_dir = state.root_dir.clone();
        Context { checker, state, log, options, root_dir, source_file: None }
    }

    pub fn types_map(&mut self) -> &mut TypesMap {
        &mut self.state.functions.types_map
    }
}

/// One entry of a sweep: a port of one `add*(...)` call in `visit.ts`. At every
/// node, the phase's visitors run in `order`, then the sweep descends: the same
/// as `visit.ts` calling each `add*` in sequence before `ts.forEachChild`.
#[derive(Clone, Copy)]
pub struct Visitor {
    pub name: &'static str,
    pub phase: Phase,
    /// The position of the TS call in its visit function; see [`order`].
    pub order: i32,
    pub visit: for<'a, 'b> fn(&'b mut Context<'a>, P<Node>),
}

#[derive(Default)]
pub struct Registry {
    by_phase: [Vec<Visitor>; 3],
}

impl Registry {
    pub fn new() -> Registry {
        Registry::default()
    }

    /// Adds a visitor. Two visitors with the same phase and order, or the same
    /// name, are a programming error and panic.
    pub fn register(&mut self, v: Visitor) {
        for e in &self.by_phase[v.phase.index()] {
            if e.order == v.order || e.name == v.name {
                panic!("visit: {:?} collides with {:?} in phase {}", v.name, e.name, v.phase.as_str());
            }
        }
        let list = &mut self.by_phase[v.phase.index()];
        list.push(v);
        list.sort_by_key(|e| e.order); // stable
    }

    /// A phase's visitors in run order.
    pub fn visitors(&self, phase: Phase) -> &[Visitor] {
        &self.by_phase[phase.index()]
    }
}

/// Registers every ported visitor group. Empty: no group is ported yet.
pub fn register_groups(_r: &mut Registry) {}

/// The registry with every ported group registered.
pub fn default_registry() -> Registry {
    let mut r = Registry::new();
    register_groups(&mut r);
    r
}

impl Context<'_> {
    /// Runs one phase over every project file: `visit.ts`'s
    /// `ts.forEachChild(sourceFile, child => visitX(...))`, which recurses
    /// itself.
    pub fn sweep(&mut self, registry: &Registry, phase: Phase, files: &[P<SourceFile>]) {
        let vs = registry.visitors(phase);
        if vs.is_empty() {
            return;
        }
        for sf in files {
            self.source_file = Some(*sf);
            crate::tsutil::walk(sf.as_node(), &mut |n| {
                for v in vs {
                    (v.visit)(self, n);
                }
            });
        }
        self.source_file = None;
    }

    /// Go `SweepUsage` (usage_sweeps.go). Not ported.
    pub fn sweep_usage(&mut self, _files: &[P<SourceFile>]) {}

    /// Go `CheckDisabledWorkflowSteps` (check_disabled.go). Not ported.
    pub fn check_disabled_workflow_steps(&mut self) {}

    /// Go `ValidateWebhookSourceTriggers` (validate.go). Not ported.
    pub fn validate_webhook_source_triggers(&mut self) {}

    /// Go `ValidatePikkuStudio` (group_pikku_studio.go). Not ported.
    pub fn validate_pikku_studio(&mut self) {}

    /// Go `ResolveLatestVersions` (resolve_versions.go). Not ported.
    pub fn resolve_latest_versions(&mut self) {}

    /// Go `FinishCoreTypeProperties` (group_setup_core.go). Not ported.
    pub fn finish_core_type_properties(&mut self) {}

    /// Go `FinishServiceTypes` (service_types.go). Not ported.
    pub fn finish_service_types(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    fn noop(_: &mut Context<'_>, _: P<Node>) {}

    fn v(name: &'static str, phase: Phase, order: i32) -> Visitor {
        Visitor { name, phase, order, visit: noop }
    }

    #[test]
    fn visitors_run_in_order_per_phase() {
        let mut r = Registry::new();
        r.register(v("b", Phase::Setup, 10));
        r.register(v("a", Phase::Setup, 0));
        r.register(v("c", Phase::Routes, 0));
        let names: Vec<_> = r.visitors(Phase::Setup).iter().map(|v| v.name).collect();
        assert_eq!(names, ["a", "b"]);
        assert_eq!(r.visitors(Phase::Functions).len(), 0);
        assert_eq!(r.visitors(Phase::Routes).len(), 1);
    }

    #[test]
    #[should_panic(expected = "collides")]
    fn duplicate_order_panics() {
        let mut r = Registry::new();
        r.register(v("a", Phase::Setup, 0));
        r.register(v("b", Phase::Setup, 0));
    }

    #[test]
    fn abort_unwinds_with_the_message() {
        let err = std::panic::catch_unwind(|| abort("boom")).unwrap_err();
        assert_eq!(err.downcast_ref::<Abort>().unwrap().message, "boom");
    }
}
