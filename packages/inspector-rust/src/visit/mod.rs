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

use std::collections::HashMap;

use tsrs_ast::{Node, SourceFile, Symbol};
use tsrs_checker::{Checker, Type};
use tsrs_core::P;

use crate::diag::Logger;
use crate::state::State;
use crate::typesmap::TypesMap;

pub mod addon_dependencies;
pub mod addon_json;
pub mod addon_load;
pub mod addon_resolve;
pub mod boundary;
pub mod group_agent;
pub mod check_classification;
pub mod check_disabled;
pub mod check_indirect;
pub mod group_addon_bans;
pub mod group_approval_description;
pub mod group_analytics;
pub mod group_define_contributors;
pub mod group_wire_contributors;
pub mod group_feature;
pub mod group_feature_flag;
pub mod group_channel;
pub mod group_cli;
pub mod group_functions;
pub mod group_gateway;
pub mod group_mcp;
pub mod group_functions_node;
pub mod group_auth;
pub mod group_http;
pub mod group_keyed;
pub mod group_middleware;
pub mod group_permission;
pub mod group_scope;
pub mod group_system_role;
pub mod group_http_contracts;
pub mod group_outgoing_webhook;
pub mod group_pikku_studio;
pub mod group_rpc_invocations;
pub mod group_schedule;
pub mod group_workflow;
pub mod group_workflow_graph;
pub mod group_setup_core;
pub mod group_trigger;
pub mod group_virtual_users;
pub mod resolve_versions;
pub mod service_types;
pub mod group_wire_addon;
pub mod group_wire_remote_addon;
pub mod order;
pub mod scope_addon;
pub mod usage_sweeps;
pub mod util_callee;
pub mod util_channel_cli;
pub mod util_middleware;
pub mod util_names;
pub mod util_props;
pub mod util_schema;
pub mod util_shared;
pub mod util_types;
pub mod util_wire_meta;
pub mod workflow_dsl;
pub mod workflow_dsl_patterns;
pub mod workflow_jsobj;
pub mod validate;
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

    /// `typesLookup` (InspectorState.typesLookup): live checker types, read only
    /// during analysis. What finalize needs from it is serialized as
    /// `state.coreTypeProperties` instead.
    pub types_lookup: HashMap<String, Vec<P<Type>>>,
    /// The core interfaces a core-type visitor recorded (Go `coreTypes`).
    pub core_types: Vec<CoreType>,
    /// Go `cliConfigTypeWarned`: the missing-Config warning is logged once.
    pub cli_config_type_warned: bool,
    /// Go `contributorWirings`: the wireContributors calls, build-time opt-ins
    /// to a package's contributors that is not an addon.
    pub contributor_wirings: Vec<addon_load::AddonDecl>,
}

/// Go `coreType`: a core interface's name and its symbol.
#[derive(Clone, Debug)]
pub struct CoreType {
    pub name: String,
    pub sym: P<Symbol>,
}

impl<'a> Context<'a> {
    pub fn new(checker: &'a mut Checker, state: &'a mut State, log: &'a mut Logger, options: Options) -> Context<'a> {
        let root_dir = state.root_dir.clone();
        Context {
            checker,
            state,
            log,
            options,
            root_dir,
            source_file: None,
            types_lookup: HashMap::new(),
            core_types: Vec::new(),
            cli_config_type_warned: false,
            contributor_wirings: Vec::new(),
        }
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
pub fn register_groups(r: &mut Registry) {
    check_disabled::register(r);
    check_indirect::register(r);
    group_addon_bans::register(r);
    group_wire_addon::register(r);
    group_wire_remote_addon::register(r);
    group_setup_core::register(r);
    group_approval_description::register(r);
    group_rpc_invocations::register(r);
    group_outgoing_webhook::register(r);
    group_functions::register(r);
    group_schedule::register(r);
    group_http::register(r);
    group_trigger::register(r);
    group_feature::register(r);
    group_feature_flag::register(r);
    group_virtual_users::register(r);
    group_analytics::register(r);
    group_define_contributors::register(r);
    group_wire_contributors::register(r);
    group_pikku_studio::register(r);
    group_middleware::register(r);
    group_permission::register(r);
    group_auth::register(r);
    group_keyed::register(r);
    group_scope::register(r);
    group_system_role::register(r);
    group_channel::register(r);
    group_gateway::register(r);
    group_mcp::register(r);
    group_agent::register(r);
    group_cli::register(r);
    group_workflow::register(r);
    group_workflow_graph::register(r);
}

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
