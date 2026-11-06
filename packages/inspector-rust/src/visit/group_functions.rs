//! Port of Go `visit/group_functions.go`: add/add-functions.ts (addFunctions).

use sha2::{Digest, Sha256};
use tsrs_ast::{self as ast, Kind, Node, SymbolFlags};
use tsrs_checker::Type;
use tsrs_core::P;

use super::group_functions_node::NodeConfig;
use super::util_props::extract_used_wires;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::{Level, codes};
use crate::state::{
    AuditMeta, DisabledFunctionMeta, FileExport, FunctionMeta, ServicesMeta, WireRef, WiresMeta,
};
use crate::tsutil::{self, file_name_of, first_decl, is_function_like, param_at};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addFunctions",
        phase: Phase::Functions,
        order: order::ADD_FUNCTIONS,
        visit: |c, n| c.add_functions(n),
    });
}

/// Go `pikkuFuncPattern`: `(?i)pikku.*func`.
fn matches_pikku_func_pattern(name: &str) -> bool {
    let l = name.to_ascii_lowercase();
    match l.find("pikku") {
        Some(i) => l[i + 5..].contains("func"),
        None => false,
    }
}

/// Go `scenarioStepKinds`.
fn scenario_step_kind(name: &str) -> Option<&'static str> {
    match name {
        "pikkuScenarioStep" => Some("virtualUser"),
        "pikkuPlatformScenarioStep" => Some("platform"),
        "pikkuAddonScenarioStep" => Some("addon"),
        _ => None,
    }
}

/// Go `isFunctionHelper`.
pub fn is_function_helper(name: &str) -> bool {
    matches_pikku_func_pattern(name)
        || name == "pikkuScenario"
        || name == "pikkuWebhookReceive"
        || scenario_step_kind(name).is_some()
}

/// Go `channelConnRe`: `(?i)ChannelConnection`.
fn is_channel_connection(wrapper: &str) -> bool {
    wrapper.to_ascii_lowercase().contains("channelconnection")
}

/// Go `nonRPCPattern`: `(?i)Trigger|ChannelConnection|ChannelDisconnection`.
fn is_non_rpc_wrapper(wrapper: &str) -> bool {
    let l = wrapper.to_ascii_lowercase();
    l.contains("trigger") || l.contains("channelconnection") || l.contains("channeldisconnection")
}

/// Go `generatedFileRe`: `\.gen\.[cm]?[jt]s$`.
pub fn is_generated_file(name: &str) -> bool {
    for ext in ["js", "ts", "mjs", "mts", "cjs", "cts"] {
        if name.ends_with(&format!(".gen.{ext}")) {
            return true;
        }
    }
    false
}

const SCENARIO_SURFACE_KEYS: [&str; 3] = ["browser", "cli", "default"];

fn is_scenario_instrumentation(name: &str) -> bool {
    let base = name.split('@').next().unwrap_or("");
    matches!(
        base,
        "pikkuScenarioTakeLiveCoverage"
            | "pikkuScenarioResetLiveCoverage"
            | "pikkuScenarioResetStubs"
            | "pikkuScenarioGetStubCalls"
            | "pikkuScenarioGradeRun"
    )
}

impl Context<'_> {
    pub fn add_functions(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) {
            return;
        }
        let expression = node.expression().unwrap();
        let wrapper = self.resolve_callee_name(node, &is_function_helper);
        if wrapper.is_empty() {
            return;
        }
        let scenario_step_kind_v = scenario_step_kind(&wrapper);
        let is_scenario_step = scenario_step_kind_v.is_some();
        let is_scenario = wrapper == "pikkuScenario";
        let is_webhook_receive = wrapper == "pikkuWebhookReceive";
        if !wrapper.starts_with("pikku") {
            return;
        }
        let args = node.arguments();
        if args.is_empty() {
            return;
        }

        let fn_name = self.extract_function_name(node);
        let mut pikku_func_id = fn_name.pikku_func_id.clone();
        let name = fn_name.name.clone();
        if pikku_func_id.is_empty() {
            return;
        }
        // Before the inline (`__temp_`) bail-out: a disabled function defined
        // inline in a wiring is still used by it, and is refused rather than skipped.
        if ast::is_object_literal_expression(args[0]) {
            if let Some(reason) = self.read_function_disabled(args[0], &name) {
                self.record_disabled_function(
                    node,
                    &pikku_func_id,
                    DisabledFunctionMeta {
                        name: name.clone(),
                        source_file: file_name_of(node).to_string(),
                        exported_name: fn_name.exported_name.clone(),
                        reason,
                    },
                );
                return;
            }
        }
        if pikku_func_id.starts_with("__temp_") {
            return;
        }
        if is_scenario_instrumentation(&pikku_func_id) || is_scenario_instrumentation(&name) {
            return;
        }

        let mut m = FunctionMeta::default();
        m.function_type = "user".into();
        m.func_wrapper = wrapper.clone();
        let mut object_node: Option<P<Node>> = None;
        let mut node_cfg: Option<NodeConfig> = None;
        let mut tags: Option<Vec<String>> = None;
        let mut expose = false;
        let mut mcp = false;
        let mut version: i64 = 0;
        let mut input_schema_ref = None;
        let mut output_schema_ref = None;

        let first_arg = args[0];
        let (handler_node, resolved_func, is_direct) = self.extract_function_node(first_arg);

        if ast::is_object_literal_expression(first_arg) {
            object_node = Some(first_arg);
            let cm = self.get_common_wire_meta_data(first_arg);
            if cm.disabled {
                return;
            }
            m.title = cm.title.clone();
            m.summary = cm.summary.clone();
            m.description = cm.description.clone();
            if cm.has_tags {
                tags = Some(cm.tags.clone());
            }
            if cm.has_errors {
                m.errors = cm.errors.clone();
            }
            expose = tsutil::get_property_value(first_arg, "expose").truthy();
            m.remote = or_nil(tsutil::get_property_value(first_arg, "remote").truthy());
            mcp = tsutil::get_property_value(first_arg, "mcp").truthy();
            let v = tsutil::get_property_value(first_arg, "auth");
            if v.bool.is_some() {
                m.auth = v.bool;
            }
            m.permissions_in_body = or_nil(tsutil::get_property_value(first_arg, "permissionsInBody").truthy());
            if m.permissions_in_body.is_some() && !self.options.allow_permissions_in_body {
                self.log.critical(
                    codes::PERMISSIONS_IN_BODY_NOT_ALLOWED,
                    format!(
                        "'{name}' declares `permissionsInBody: true`, which this project has not enabled. It silences the exposed-and-ungated audit without gating anything, so it is opt-in: set `allow: {{ permissionsInBody: true }}` in pikku.config.json if the project accepts permission checks that only a reader can verify. Otherwise express the check as a `permissions` entry, or drop `expose: true` if the function was not meant to be callable from outside."
                    ),
                );
                return;
            }
            if let Some(p) = tsutil::find_property_assignment(first_arg, "audit") {
                let init = p.initializer().unwrap();
                if init.kind() == Kind::TrueKeyword {
                    m.audit = Some(AuditMeta { durability: "best-effort".into() });
                } else if ast::is_object_literal_expression(init) {
                    let mut d = tsutil::get_property_value(init, "durability").as_string();
                    if d.is_empty() {
                        d = "best-effort".into();
                    }
                    m.audit = Some(AuditMeta { durability: d });
                }
            }
            m.readonly = or_nil(tsutil::get_property_value(first_arg, "readonly").truthy());
            m.deploy = tsutil::get_property_value(first_arg, "deploy").as_string();
            m.approval_required = or_nil(tsutil::get_property_value(first_arg, "approvalRequired").truthy());
            let v = tsutil::get_property_value(first_arg, "workflowQueued");
            if v.bool == Some(true) {
                m.workflow_queued = Some(true);
            }
            let v = tsutil::get_property_value(first_arg, "workflowRetries");
            if v.num.is_some() {
                m.workflow_retries = v.num;
            }
            m.workflow_timeout = tsutil::get_property_value(first_arg, "workflowTimeout").as_string();

            let mut declared: Vec<String> = Vec::new();
            for surface in SCENARIO_SURFACE_KEYS {
                for p in first_arg.properties() {
                    if (ast::is_property_assignment(*p) || ast::is_method_declaration(*p) || ast::is_shorthand_property_assignment(*p))
                        && p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == surface)
                    {
                        declared.push(surface.to_string());
                        break;
                    }
                }
            }
            match scenario_step_kind_v {
                Some("platform") | Some("addon") => {
                    if !declared.is_empty() {
                        return;
                    }
                    m.scenario_step_surfaces = vec!["default".into()];
                    if scenario_step_kind_v == Some("addon") {
                        m.scenario_step_addon = tsutil::get_property_value(first_arg, "addon").as_string();
                        if m.scenario_step_addon.is_empty() {
                            return;
                        }
                    }
                }
                _ => {
                    if !declared.is_empty() {
                        m.scenario_step_surfaces = declared.clone();
                    }
                    let vu = tsutil::get_property_value(first_arg, "virtualUser");
                    let browser = declared.iter().any(|d| d == "browser");
                    if vu.bool == Some(true) || browser {
                        m.scenario_step_requires_virtual_user = Some(true);
                    }
                }
            }
            m.scenario_step_template = tsutil::get_property_value(first_arg, "template").as_string();
            if let Some(sc) = tsutil::get_array_property_value(first_arg, "scopes") {
                m.scopes = sc;
            }
            for p in first_arg.properties() {
                if ast::is_property_assignment(*p)
                    && p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == "approvalDescription")
                    && ast::is_identifier(p.initializer().unwrap())
                {
                    let init = p.initializer().unwrap();
                    let id = self.extract_function_name(init).pikku_func_id;
                    if !id.is_empty() && !id.starts_with("__temp_") {
                        m.approval_description = id;
                    } else {
                        m.approval_description = init.text().to_string();
                    }
                    break;
                }
            }
            let v = tsutil::get_property_value(first_arg, "version");
            if v.present {
                let mut f = 0.0;
                let mut ok = true;
                if let Some(n) = v.num {
                    f = n;
                } else if let Some(s) = &v.str {
                    match s.trim().parse::<f64>() {
                        Ok(x) => f = x,
                        Err(_) => ok = false,
                    }
                } else if v.bool == Some(true) {
                    f = 1.0;
                }
                if ok && f >= 1.0 && f == f.trunc() {
                    version = f as i64;
                }
            }
            node_cfg = self.read_node_config(first_arg, &name);
            for p in first_arg.properties() {
                if ast::is_property_assignment(*p) && p.name().is_some_and(ast::is_identifier) {
                    let pn = p.name().unwrap().text();
                    if pn != "input" && pn != "output" {
                        continue;
                    }
                    let init = p.initializer().unwrap();
                    if ast::is_identifier(init) {
                        let ctx = format!("Function '{name}' {pn}");
                        let Some(r) = self.resolve_schema_ref(init, &ctx) else { continue };
                        if pn == "input" {
                            input_schema_ref = Some(r);
                        } else {
                            output_schema_ref = Some(r);
                        }
                    } else if ast::is_call_expression(init) {
                        let schema_name = format!("{}{}{}", tsutil::func_id_to_type_name(&name), pn[..1].to_ascii_uppercase(), &pn[1..]);
                        self.log.diagnostic(
                            Level::Error,
                            codes::INLINE_SCHEMA,
                            format!(
                                "Inline schemas are not supported for '{pn}' in '{name}'; it is validated against its TypeScript type only, so refinements are not enforced.\n  Extract to an exported variable:\n    export const {schema_name} = {}\n  Then use: {pn}: {schema_name}",
                                tsutil::node_text(init)
                            ),
                        );
                    }
                }
            }
        }

        if version != 0 {
            let mut base = fn_name.explicit_name.clone();
            if base.is_empty() {
                base = fn_name.exported_name.clone();
            }
            if base.is_empty() {
                base = pikku_func_id.clone();
            }
            let suffix = format!("V{version}");
            if base.ends_with(&suffix) && base.len() > suffix.len() {
                base.truncate(base.len() - suffix.len());
            }
            pikku_func_id = tsutil::format_versioned_id(&base, version);
            m.version = Some(version);
        }
        m.pikku_func_id = pikku_func_id.clone();
        m.name = name.clone();

        if wrapper == "pikkuRemoteChannelFunc" {
            // addRemoteChannelFunc is not ported.
            return;
        }

        let is_mcp_tool_func = wrapper == "pikkuMCPToolFunc";
        let is_list_func = wrapper == "pikkuListFunc";
        let mcp_enabled = mcp || is_mcp_tool_func;

        let mut handler = handler_node;
        if let Some(r) = resolved_func {
            if is_function_like(r) {
                handler = r;
            }
        }
        if !is_function_like(handler) {
            let mut stub = FunctionMeta::default();
            stub.pikku_func_id = pikku_func_id.clone();
            stub.function_type = "user".into();
            stub.name = name.clone();
            stub.services = ServicesMeta { optimized: false, services: vec![] };
            stub.inputs = vec![];
            stub.outputs = vec![];
            self.state.functions.meta.set(pikku_func_id, stub);
            return;
        }

        let mut services = ServicesMeta { optimized: true, services: vec![] };
        fn add_services(services: &mut ServicesMeta, fn_node: P<Node>, dedupe: bool) {
            let Some(p) = param_at(fn_node, 0) else { return };
            let pname = p.name().unwrap();
            if ast::is_object_binding_pattern(pname) {
                for n in tsutil::binding_names(p) {
                    if dedupe && services.services.contains(&n) {
                        continue;
                    }
                    services.services.push(n);
                }
            } else if ast::is_identifier(pname) && !pname.text().starts_with('_') {
                services.optimized = false;
            }
        }
        add_services(&mut services, handler, false);
        let mut wires = extract_used_wires(handler, 2);

        let compensate_init = match object_node {
            Some(o) => self.get_property_assignment_initializer(o, "compensate", true),
            None => None,
        };
        if let Some(ci) = compensate_init {
            if is_function_like(ci) {
                add_services(&mut services, ci, true);
                let cw = extract_used_wires(ci, 2);
                let mut seen = std::collections::HashSet::new();
                let mut merged = Vec::new();
                for w in wires.wires.iter().chain(cw.wires.iter()) {
                    if seen.insert(w.clone()) {
                        merged.push(w.clone());
                    }
                }
                wires = WiresMeta { optimized: wires.optimized && cw.optimized, wires: merged };
            }
            m.compensate = Some(true);
        }

        let body = handler.body().expect("function with a body");
        let invoked = tsutil::collect_invoked_rpc_names(body);
        if !invoked.names.is_empty() {
            m.invokes = invoked.names.clone();
        }
        for call in &invoked.dynamic {
            self.log.warn(format!(
                "• {pikku_func_id} calls {call} with a computed name — the deploy planner cannot bind its unit to the callee's, so the call fails with \"No service binding\" if the two are deployed apart. Use a literal RPC name."
            ));
        }

        // --- Generics → types, unwrapped from Promise ---
        let mut generics: Vec<P<Type>> = Vec::new();
        for tn in node.type_arguments() {
            let t = self.checker.get_type_from_type_node_exported(*tn);
            generics.push(self.unwrap_promise(t));
        }
        let is_channel_conn = is_channel_connection(&wrapper);
        let capitalized = tsutil::func_id_to_type_name(&name);

        let mut input_names: Vec<String> = Vec::new();
        let mut output_names: Vec<String>;
        let mut input_types: Vec<P<Type>> = Vec::new();
        if input_schema_ref.is_some() {
            input_names = vec![format!("{capitalized}Input")];
            self.state.schema_lookup.set(input_names[0].clone(), input_schema_ref.clone().unwrap());
            self.types_map().add_custom_type(&input_names[0], "unknown", vec![]);
        } else if is_list_func && !generics.is_empty() {
            input_names = vec![format!("{capitalized}Input")];
            let refs = self.resolve_type_imports(generics[0], true);
            let ts = self.type_to_string(generics[0]);
            self.types_map().add_custom_type(
                &input_names[0],
                &format!("{{ cursor?: string; limit?: number; sort?: Array<{{ column: string; direction: 'asc' | 'desc' }}>; filter?: unknown; search?: string; }} & {ts}"),
                tsutil::dedupe(&refs),
            );
            if let Some(p) = param_at(handler, 1) {
                input_types = vec![self.checker.get_type_at_location(p)];
            } else {
                input_types = vec![generics[0]];
            }
        } else if !is_channel_conn && !is_list_func && !generics.is_empty() {
            let (n, t) = self.get_names_and_types("Input", &name, Some(generics[0]));
            input_names = n;
            input_types = t;
        } else if let Some(p) = param_at(handler, 1) {
            let t = self.checker.get_type_at_location(p);
            let (n, ty) = self.get_names_and_types("Input", &pikku_func_id, Some(t));
            input_names = n;
            input_types = ty;
        }
        if is_webhook_receive {
            input_names = vec![];
        }

        if output_schema_ref.is_some() {
            output_names = vec![format!("{capitalized}Output")];
            self.state.schema_lookup.set(output_names[0].clone(), output_schema_ref.clone().unwrap());
            self.types_map().add_custom_type(&output_names[0], "unknown", vec![]);
        } else if is_list_func && generics.len() >= 2 {
            output_names = vec![format!("{capitalized}Output")];
            let refs = self.resolve_type_imports(generics[1], true);
            let ts = self.type_to_string(generics[1]);
            self.types_map().add_custom_type(
                &output_names[0],
                &format!("{{ rows: Array<{ts}>; nextCursor: string | null; totalCount?: number; }}"),
                tsutil::dedupe(&refs),
            );
        } else if !is_list_func && generics.len() >= 2 {
            output_names = self.get_names_and_types("Output", &name, Some(generics[1])).0;
        } else {
            let sig = self.checker.get_signature_from_declaration_exported(handler);
            let ret = self.checker.get_return_type_of_signature_exported(sig);
            let ret = self.unwrap_promise(ret);
            output_names = self.get_names_and_types("Output", &pikku_func_id, Some(ret)).0;
        }
        let mcp_output_type = match wrapper.as_str() {
            "pikkuMCPResourceFunc" => Some("MCPResourceResponse"),
            "pikkuMCPToolFunc" => Some("MCPToolResponse"),
            "pikkuMCPPromptFunc" => Some("MCPPromptResponse"),
            _ => None,
        };
        if let Some(t) = mcp_output_type {
            if output_names.is_empty() || output_names[0] != t {
                if !self.register_mcp_output_type(expression, t) {
                    self.types_map().add_custom_type(t, t, vec![]);
                }
                output_names = vec![t.to_string()];
            }
        }

        if input_names.len() > 1 {
            self.log.warn("More than one input type detected, only the first one will be used as a schema.");
        }
        if self.options.is_addon && m.remote == Some(true) && !is_scenario_step && !is_webhook_receive {
            let violation = super::boundary::addon_zod_contract_violation(
                self.types_map(),
                &super::boundary::AddonContractTypeSource {
                    name: name.clone(),
                    uses_generics: !node.type_arguments().is_empty(),
                    has_input_schema: input_schema_ref.is_some(),
                    has_output_schema: output_schema_ref.is_some(),
                    input_names: input_names.clone(),
                    output_names: output_names.clone(),
                },
            );
            if !violation.is_empty() {
                self.log.critical(codes::ADDON_REMOTE_CONTRACT_NOT_ZOD, violation);
            }
        }
        if !input_types.is_empty() {
            self.types_lookup.insert(pikku_func_id.clone(), input_types);
        }

        let source_file = file_name_of(node).to_string();
        if let Some(existing) = self.state.functions.meta.get(&pikku_func_id) {
            if !existing.source_file.is_empty() && existing.source_file != source_file {
                let msg = format!(
                    "Function name '{name}' is not unique. '{pikku_func_id}' is already defined in '{}' and cannot be redefined in '{source_file}'.",
                    existing.source_file
                );
                self.log.critical(codes::DUPLICATE_FUNCTION_NAME, msg);
                return;
            }
        }
        if !fn_name.exported_name.is_empty() || !fn_name.explicit_name.is_empty() {
            let existing = self.state.rpc.internal_meta.get(&name).cloned().unwrap_or_default();
            if !existing.is_empty() && !super::resolve_versions::are_compatible_function_ids(&existing, &pikku_func_id) {
                let src = self.existing_function_source(&existing);
                self.log.critical(
                    codes::DUPLICATE_FUNCTION_NAME,
                    format!(
                        "Function name '{name}' is not unique. It already points to '{existing}' in '{src}', but '{pikku_func_id}' in '{source_file}' tried to use the same name."
                    ),
                );
                return;
            }
            if expose {
                let existing = self.state.rpc.exposed_meta.get(&name).cloned().unwrap_or_default();
                if !existing.is_empty() && !super::resolve_versions::are_compatible_function_ids(&existing, &pikku_func_id) {
                    let src = self.existing_function_source(&existing);
                    self.log.critical(
                        codes::DUPLICATE_FUNCTION_NAME,
                        format!(
                            "Exposed function name '{name}' is not unique. It already points to '{existing}' in '{src}', but '{pikku_func_id}' in '{source_file}' tried to use the same name."
                        ),
                    );
                    return;
                }
            }
        }

        if self.options.classification_check {
            self.check_classification(&name, handler, wrapper != "pikkuFunc");
        }

        m.sessionless = Some(wrapper != "pikkuFunc");
        m.services = services;
        if !wires.wires.is_empty() || !wires.optimized {
            m.wires = Some(wires);
        }
        m.input_schema_name = input_names.first().cloned();
        m.output_schema_name = output_names.first().cloned();
        m.inputs = filter_void(&input_names);
        m.outputs = filter_void(&output_names);
        m.expose = or_nil(expose);
        if is_webhook_receive {
            m.auth = Some(false);
        }
        m.scenario_step = or_nil(is_scenario_step);
        m.webhook_receive = or_nil(is_webhook_receive);
        m.scenario = or_nil(is_scenario);
        m.mcp = or_nil(mcp_enabled);
        if let Some(k) = scenario_step_kind_v {
            if k != "virtualUser" {
                m.scenario_step_kind = k.to_string();
            }
        }
        m.tags = tags.clone();
        if let Some(o) = object_node {
            let mw = self.resolve_middleware(o, tags.as_deref());
            if !mw.is_empty() {
                m.middleware = mw;
            }
            let pm = self.resolve_permissions(o);
            if !pm.is_empty() {
                m.permissions = pm;
            }
        }
        m.implementation_hash = implementation_hash(&wrapper, handler, object_node, is_direct);
        m.is_direct_function = Some(is_direct);
        m.source_file = source_file.clone();
        let handler_sf = tsutil::source_file_of(handler);
        if handler_sf.file_name() != source_file {
            m.body_source_file = handler_sf.file_name().to_string();
        }
        m.exported_name = fn_name.exported_name.clone();
        let line_of = |pos: usize| tsrs_scanner::get_ecma_line_of_position(handler_sf.get(), pos as u32) as i64 + 1;
        let (bs, be);
        if ast::is_block(body) && !body.statements().is_empty() {
            let stmts = body.statements();
            bs = line_of(tsutil::node_start(stmts[0]));
            be = line_of(tsutil::node_end(stmts[stmts.len() - 1]));
        } else {
            bs = line_of(tsutil::node_start(body));
            be = line_of(tsutil::node_end(body));
        }
        m.body_start = Some(bs);
        m.body_end = Some(be);
        let started = tsutil::collect_started_workflows(body);
        if !started.names.is_empty() {
            m.starts_workflows = started.names.clone();
        }
        // Generated scaffolds (the workflow start/run routes) take the name from the
        // request by design, and are served by units that have every workflow.
        if !is_generated_file(file_name_of(handler)) {
            for call in &started.dynamic {
                self.log.warn(format!(
                    "• {pikku_func_id} calls {call} with a computed name — the deploy planner cannot bundle that workflow's meta into {pikku_func_id}'s unit, so the deployed call fails with \"Workflow not found\" unless the unit has it for another reason. Use a literal workflow name."
                ));
            }
            if !started.rpc_handoffs.is_empty() {
                self.log.warn(format!(
                    "• {pikku_func_id} passes rpc to {} — rpc.startWorkflow / rpc.invoke calls made there are invisible to the deploy planner, so their targets are not bundled into or bound to {pikku_func_id}'s unit. Make those calls in the handler itself.",
                    started.rpc_handoffs.join(", ")
                ));
            }
        }

        let remote = m.remote == Some(true);
        self.state.functions.meta.set(pikku_func_id.clone(), m.clone());
        if let Some(cfg) = &node_cfg {
            self.add_node_meta(cfg, file_name_of(node), &pikku_func_id, &m);
        }
        if mcp_enabled {
            self.add_mcp_tool(object_node, &source_file, &name, &m);
            self.state.service_aggregation.used_functions.add(pikku_func_id.clone());
            self.add_used_wires(&m.middleware, &m.permissions);
        }
        self.register_rpc(RpcRegistration {
            wrapper: wrapper.clone(),
            pikku_func_id,
            name,
            exported_name: fn_name.exported_name.clone(),
            explicit_name: fn_name.explicit_name.clone(),
            source_file,
            expose,
            remote,
            mcp_enabled,
            not_rpc: is_scenario_step || is_webhook_receive,
            versioned: version != 0,
        });
    }

    pub fn existing_function_source(&self, id: &str) -> String {
        if let Some(m) = self.state.functions.meta.get(id) {
            if !m.source_file.is_empty() {
                return m.source_file.clone();
            }
        }
        if let Some(f) = self.state.rpc.internal_files.get(id) {
            if !f.path.is_empty() {
                return f.path.clone();
            }
        }
        "unknown file".into()
    }

    /// `addUsedWires`.
    pub fn add_used_wires(&mut self, middleware: &[WireRef], permissions: &[WireRef]) {
        for w in middleware {
            if w.ty == "wire" {
                self.state.service_aggregation.used_middleware.add(w.name.clone());
            }
        }
        for w in permissions {
            if w.ty == "wire" {
                self.state.service_aggregation.used_permissions.add(w.name.clone());
            }
        }
    }

    /// `registerRPC` is the tail of addFunctions: the function's file and its
    /// RPC entries.
    fn register_rpc(&mut self, r: RpcRegistration) {
        if r.wrapper.contains("Workflow") || is_non_rpc_wrapper(&r.wrapper) {
            return;
        }
        let file = FileExport { path: r.source_file.clone(), exported_name: r.exported_name.clone() };
        if !r.exported_name.is_empty() {
            self.state.functions.files.set(r.pikku_func_id.clone(), file.clone());
        }
        if r.exported_name.is_empty() && r.explicit_name.is_empty() {
            return;
        }
        if r.exported_name.is_empty() {
            self.log.error(format!("• Function with explicit name '{}' is not exported, this is not allowed.", r.name));
            return;
        }
        let st = &mut *self.state;
        if r.remote && !r.not_rpc {
            st.rpc.invoked_functions.add(r.pikku_func_id.clone());
            st.rpc.remote_meta.set(r.name.clone(), r.pikku_func_id.clone());
            st.rpc.remote_files.set(r.name.clone(), file.clone());
        }
        if r.expose && !r.not_rpc {
            st.rpc.exposed_meta.set(r.name.clone(), r.pikku_func_id.clone());
            st.rpc.exposed_files.set(r.name.clone(), file.clone());
            st.service_aggregation.used_functions.add(r.pikku_func_id.clone());
        }
        if !r.not_rpc {
            st.rpc.internal_meta.set(r.name.clone(), r.pikku_func_id.clone());
            if r.versioned {
                st.rpc.internal_meta.set(r.pikku_func_id.clone(), r.pikku_func_id.clone());
                st.rpc.invoked_functions.add(r.pikku_func_id.clone());
            }
        }
        if st.rpc.invoked_functions.has(&r.pikku_func_id) || r.expose || r.remote || r.mcp_enabled {
            st.rpc.internal_files.set(r.pikku_func_id.clone(), file);
        }
    }

    /// `registerMCPOutputType` records where the wrapper's MCP response type is
    /// declared, resolved from the wrapper's own declaration.
    fn register_mcp_output_type(&mut self, wrapper_ident: P<Node>, type_name: &str) -> bool {
        let sym = self.symbol_at(wrapper_ident);
        let Some(sym) = self.resolve_alias(sym) else { return false };
        for d in sym.declarations() {
            let Some(ts) = self.checker.resolve_name_exported(type_name, Some(*d), SymbolFlags::Type, false) else { continue };
            let resolved = self.resolve_alias(Some(ts));
            if let Some(decl) = first_decl(resolved) {
                let path = file_name_of(decl);
                let tm = self.types_map();
                if tm.exists(type_name, path).is_none() {
                    tm.add_type(type_name, path);
                }
                return true;
            }
        }
        false
    }
}

struct RpcRegistration {
    wrapper: String,
    pikku_func_id: String,
    name: String,
    exported_name: String,
    explicit_name: String,
    source_file: String,
    expose: bool,
    remote: bool,
    mcp_enabled: bool,
    not_rpc: bool,
    versioned: bool,
}

/// `OrNil`: `x || undefined`.
fn or_nil(b: bool) -> Option<bool> {
    if b { Some(true) } else { None }
}

fn filter_void(names: &[String]) -> Vec<String> {
    names.iter().filter(|n| *n != "void").cloned().collect()
}

// --- implementationHash -----------------------------------------------------

/// Go's `encoding/json` string encoding with HTML escaping off: `\n \r \t \b \f`,
/// other control characters as `\u00xx`, U+2028 / U+2029 as ` ` / ` `.
fn go_json_string(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// `implementationHash`.
pub fn implementation_hash(wrapper: &str, handler: P<Node>, object_node: Option<P<Node>>, is_direct: bool) -> String {
    let mut buf = String::from("{");
    buf.push_str("\"config\":");
    match object_node {
        Some(o) => go_json_string(&tsutil::print::print_node(o), &mut buf),
        None => buf.push_str("null"),
    }
    buf.push_str(",\"handler\":");
    go_json_string(&tsutil::print::print_node(handler), &mut buf);
    buf.push_str(",\"isDirectFunction\":");
    buf.push_str(if is_direct { "true" } else { "false" });
    buf.push_str(",\"wrapper\":");
    go_json_string(wrapper, &mut buf);
    buf.push('}');
    let sum = Sha256::digest(buf.as_bytes());
    let hex: String = sum.iter().map(|b| format!("{b:02x}")).collect();
    hex[..16].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_patterns() {
        assert!(is_function_helper("pikkuFunc"));
        assert!(is_function_helper("pikkuSessionlessFunc"));
        assert!(is_function_helper("PIKKUXFUNC"));
        assert!(is_function_helper("pikkuScenario"));
        assert!(is_function_helper("pikkuWebhookReceive"));
        assert!(is_function_helper("pikkuAddonScenarioStep"));
        assert!(!is_function_helper("funcPikku"));
        assert!(!is_function_helper("pikku"));
    }

    #[test]
    fn generated_and_rpc_patterns() {
        assert!(is_generated_file("/a/b.gen.ts"));
        assert!(is_generated_file("/a/b.gen.mjs"));
        assert!(!is_generated_file("/a/b.gen.tsx"));
        assert!(is_non_rpc_wrapper("pikkuTriggerFunc"));
        assert!(is_non_rpc_wrapper("pikkuChannelDisconnectionFunc"));
        assert!(!is_non_rpc_wrapper("pikkuFunc"));
        assert!(is_channel_connection("pikkuChannelConnectionFunc"));
    }

    #[test]
    fn json_strings_follow_go() {
        let mut s = String::new();
        go_json_string("a\"b\\c\n\u{2028}<&>\u{1}é", &mut s);
        assert_eq!(s, "\"a\\\"b\\\\c\\n\\u2028<&>\\u0001é\"");
    }

    #[test]
    fn scenario_kinds() {
        assert_eq!(scenario_step_kind("pikkuPlatformScenarioStep"), Some("platform"));
        assert!(is_scenario_instrumentation("pikkuScenarioGradeRun@v2"));
    }
}
