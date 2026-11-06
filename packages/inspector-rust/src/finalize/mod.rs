//! Port of Go `internal/finalize` (finalizeInspectorState,
//! packages/inspector/src/finalize.ts): the checker-free half of an
//! inspection. It reads only the state analysis produced and the request
//! options, so it runs the same on a state just analyzed and on one
//! deserialized from the TypeScript engine.
//!
//! Where Go works on a `state.Raw` section it decodes through its JS-value
//! model; here that model is [`jsval::V`], and a typed Rust section is read
//! through [`jv`] (its JSON form), so a section that gets a typed struct later
//! needs no change in the steps that read it.
//!
//! File map (Go file -> Rust file): `run.go`/`response.go` -> this file,
//! `types.go`/`finalize_b.go` -> `post_process`, `hash.go` -> `hash`,
//! `contracts.go` -> `contracts`, `services.go` -> `services`,
//! `workflows.go` -> `workflows`, `finalize_workflows.go` ->
//! `finalize_workflows`, `workflow_wires.go` -> `workflow_wires`,
//! `convert_dsl_to_graph.go` -> `convert_dsl_to_graph`, `scenarios.go` ->
//! `scenarios`, `addons.go` (+ `internal/remotesdk`) -> `addons`, `secrets.go`
//! -> `secrets`, `auth.go` -> `auth`, `agents.go` -> `agents`, `scopes.go` ->
//! `scopes`, `addon_schemas.go` -> `addon_schemas`, `files_and_methods.go` ->
//! `files_and_methods`, `openapi.go`/`openapi_convert.go` -> `openapi`/
//! `openapi_convert`, `jsvalue.go` -> `jsval`.

pub mod addon_schemas;
pub mod addons;
pub mod agents;
pub mod auth;
pub mod contracts;
pub mod convert_dsl_to_graph;
pub mod files_and_methods;
pub mod finalize_workflows;
pub mod hash;
pub mod jsval;
pub mod openapi;
pub mod openapi_convert;
pub mod post_process;
pub mod resolve;
pub mod scenarios;
pub mod scopes;
pub mod secrets;
pub mod services;
pub mod utils;
pub mod workflow_wires;
pub mod workflows;

use crate::diag::Logger;
use crate::protocol::{Failure, Response};
use crate::state::State;

/// InspectorOptions as the protocol carries it.
pub type Options = crate::protocol::Options;

/// A serializable value as a JS value (its JSON form).
pub fn jv<T: serde::Serialize + ?Sized>(x: &T) -> jsval::V {
    jsval::V::from_json(&serde_json::to_value(x).unwrap_or(serde_json::Value::Null))
}

/// `finalizeInspectorState`: every step, in finalize.ts order. It mutates `st`
/// in place.
pub fn run(log: &mut Logger, st: &mut State, opts: &Options) -> Result<(), String> {
    if !opts.setup_only {
        if opts.schema_config.is_some() {
            contracts::compute_contract_hashes(st);
            post_process::compute_required_schemas(st, opts);
        }

        // Re-load addon schemas (generateAllSchemas replaces state.schemas).
        addon_schemas::load_addon_schemas(st);

        // After the addon merge: an addon supplies its own schemas there.
        if opts.schema_config.is_some() {
            post_process::validate_schema_references(log, st);
        }

        contracts::apply_manifest(st, opts.manifest.as_ref())?;

        finalize_workflows::finalize_workflows(st);
        workflow_wires::finalize_workflow_helper_types(st);
        workflow_wires::finalize_workflow_wires(st);
    }

    files_and_methods::get_files_and_methods(st, opts.types.as_ref())?;

    if !opts.setup_only {
        log.begin_validation_pass();
        services::stamp_auth_handler_services(st);
        services::aggregate_required_services(st);

        post_process::compute_resolved_io_types(st);
        post_process::compute_middleware_groups_meta(st);
        post_process::compute_permissions_groups_meta(st);
        secrets::validate_no_secret_alias_services(log, st);
        secrets::register_derived_oauth2_app_secrets(st);
        secrets::validate_secret_usage(log, st);
        secrets::compute_diagnostics(st);
        workflows::validate_schema_wiring_separation(log, st);
        workflows::validate_workflow_graph_addons(log, st);
        workflows::validate_single_step_workflows(log, st);
        scenarios::validate_scenario_services(log, st);
        scenarios::validate_scenario_steps(log, st);
        scenarios::validate_scenario_features(log, st);
        auth::annotate_http_route_auth(st);
        auth::validate_exposed_functions_gated(log, st, opts.is_addon);
        auth::validate_tags_resolve_to_middleware(log, st);

        if let Some(open_api) = opts.open_api.as_ref().filter(|v| !v.is_null()) {
            openapi::generate_openapi_spec(log, st, open_api)?;
        }

        agents::validate_agent_models(log, st, &opts.model_aliases);
        agents::validate_agent_tool_references(log, st, opts);
        agents::validate_agent_scorer_references(log, st);
        addons::validate_secret_overrides(log, st);
        addons::validate_variable_overrides(log, st);
        addons::validate_credential_overrides(log, st);
        addons::validate_addon_uses(log, st);
        addons::validate_addon_content_grants(log, st);
        addons::validate_remote_addon_dependencies(log, st);
        addons::validate_remote_addon_auth(log, st);
        scopes::apply_declared_scopes(st);
        scopes::validate_scope_references(log, st);
        scopes::validate_system_role_scopes(log, st);
        scopes::validate_virtual_user_roles(log, st);
        log.end_validation_pass();
    }
    Ok(())
}

/// `finalize.Response(res, opts)`: finalizes an analysis Response in place. The
/// state is finalized, finalize's diagnostics follow analysis's,
/// `validation_pass` marks the validation-pass bracket, and `finalized` is set.
pub fn response(res: &mut Response, opts: &Options) -> Result<(), Failure> {
    let mut log = Logger::new();
    log.seed(res.diagnostics.clone());
    let Some(state) = res.state.as_mut() else {
        return Err(Failure { message: "finalize: response has no state".to_string(), diagnostics: log.entries() });
    };
    if let Err(message) = run(&mut log, state, opts) {
        return Err(Failure { message, diagnostics: log.entries() });
    }
    res.diagnostics = log.entries();
    res.validation_pass = log.validation_pass();
    res.finalized = true;
    Ok(())
}
