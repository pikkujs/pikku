//! Port of Go `visit/group_agent.go`: add/add-agent.ts (addAgent) and
//! add/add-agent-scorer.ts (addAgentScorer).

use serde_json::Value;
use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::util_schema::symbol_decl;
use super::util_wire_meta::num_value;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::{Level, codes};
use crate::jsjson::format_number;
use crate::state::{AgentMeta, FileExport, Raw, Record, ScorerMeta};
use crate::tsutil::{self, PropValue, file_name_of, func_id_to_type_name, node_text, unwrap_as};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addAgent", phase: Phase::Routes, order: order::ADD_AGENT, visit: |c, n| c.add_agent(n) });
    r.register(Visitor { name: "addAgentScorer", phase: Phase::Routes, order: order::ADD_AGENT_SCORER, visit: |c, n| c.add_agent_scorer(n) });
}

/// The services an AI agent function needs that are not visible through
/// parameter destructuring.
const AGENT_PLATFORM_SERVICES: [&str; 4] = ["agentStorage", "agentRunState", "agentRunService", "agentRunner"];

/// `(getPropertyValue(obj, k) as string | null) || ''`, as written into a string field.
fn truthy_string(v: &PropValue) -> String {
    if !v.truthy() {
        return String::new();
    }
    if let Some(s) = &v.str {
        return s.clone();
    }
    if let Some(n) = v.num {
        return format_number(n);
    }
    if v.bool.is_some() {
        return "true".into();
    }
    v.strs.clone().unwrap_or_default().join(",")
}

/// The JSON of getPropertyValue's result, or empty (undefined) when the
/// property is absent.
fn prop_raw(v: &PropValue) -> Raw {
    if !v.present {
        return Raw::default();
    }
    if let Some(n) = v.num {
        return Raw::of(num_value(n));
    }
    if let Some(b) = v.bool {
        return Raw::of(Value::Bool(b));
    }
    if let Some(s) = &v.str {
        return Raw::of(Value::from(s.as_str()));
    }
    Raw::of(Value::Array(v.strs.clone().unwrap_or_default().into_iter().map(Value::from).collect()))
}

/// literal-properties.ts getProperty: the initializer of a property assignment
/// named by an identifier or a string literal.
fn literal_property(obj: P<Node>, name: &str) -> Option<P<Node>> {
    for p in obj.properties() {
        if ast::is_property_assignment(*p) && p.name().is_some_and(|n| ast::is_identifier(n) || ast::is_string_literal(n)) && p.name().unwrap().text() == name {
            return p.initializer();
        }
    }
    None
}

/// literal-properties.ts readJsonValue: the JSON of a JSON-shaped literal, all
/// or nothing.
fn read_json_literal(node: P<Node>) -> Option<Value> {
    let value = unwrap_as(node);
    if ast::is_string_literal_like(value) {
        return Some(Value::from(value.text()));
    }
    if ast::is_numeric_literal(value) {
        return value.text().parse::<f64>().ok().map(num_value);
    }
    if ast::is_prefix_unary_expression(value) {
        let pu = value.as_prefix_unary_expression();
        if pu.operator() == Kind::MinusToken && ast::is_numeric_literal(pu.operand()) {
            return pu.operand().text().parse::<f64>().ok().map(|f| num_value(-f));
        }
    }
    match value.kind() {
        Kind::TrueKeyword => return Some(Value::Bool(true)),
        Kind::FalseKeyword => return Some(Value::Bool(false)),
        Kind::NullKeyword => return Some(Value::Null),
        _ => {}
    }
    if ast::is_array_literal_expression(value) {
        let mut entries = Vec::new();
        for e in value.elements() {
            entries.push(read_json_literal(*e)?);
        }
        return Some(Value::Array(entries));
    }
    if ast::is_object_literal_expression(value) {
        let mut rec: Record<Value> = Record::new();
        for p in value.properties() {
            if !ast::is_property_assignment(*p) {
                return None;
            }
            let n = p.name().unwrap();
            if !ast::is_identifier(n) && !ast::is_string_literal_like(n) && !ast::is_numeric_literal(n) {
                return None;
            }
            let v = read_json_literal(p.initializer().unwrap())?;
            rec.set(n.text(), v);
        }
        return serde_json::to_value(&rec).ok();
    }
    None
}

/// The `<name>: [...]` initializer, or `None`.
fn array_property(obj: P<Node>, name: &str) -> Option<P<Node>> {
    for p in obj.properties() {
        if ast::is_property_assignment(*p) && p.name().is_some_and(ast::is_identifier) && p.name().unwrap().text() == name {
            let init = p.initializer().unwrap();
            return if ast::is_array_literal_expression(init) { Some(init) } else { None };
        }
    }
    None
}

/// The string-literal first argument of `callee(...)` when node is a call to
/// one of callees. Returns the callee text, and the argument when matched.
fn string_call_arg(node: P<Node>, callees: &[&str]) -> Option<(String, Option<String>)> {
    if !ast::is_call_expression(node) || !node.expression().is_some_and(ast::is_identifier) {
        return None;
    }
    let callee = node.expression().unwrap().text().to_string();
    for c in callees {
        if *c != callee {
            continue;
        }
        let args = node.arguments();
        if !args.is_empty() && ast::is_string_literal(args[0]) {
            return Some((callee, Some(args[0].text().to_string())));
        }
    }
    Some((callee, None))
}

impl Context<'_> {
    pub fn add_agent(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) {
            return;
        }
        let expression = node.expression().unwrap();
        if !ast::is_identifier(expression) || expression.text() != "pikkuAgent" {
            return;
        }
        let args = node.arguments();
        if args.is_empty() {
            return;
        }
        let exported_name = self.extract_function_name(node).exported_name;
        let obj = args[0];
        if !ast::is_object_literal_expression(obj) {
            return;
        }

        let name_value = tsutil::get_property_value(obj, "name").as_string();
        let cm = self.wire_meta_data(obj, "AI agent", &name_value);
        if cm.disabled {
            return;
        }

        let model_value = tsutil::get_property_value(obj, "model");
        let role_value = tsutil::get_property_value(obj, "role");
        let personality_value = tsutil::get_property_value(obj, "personality");
        let goal_value = tsutil::get_property_value(obj, "goal");
        let max_steps_value = tsutil::get_property_value(obj, "maxSteps");
        let temperature_value = tsutil::get_property_value(obj, "temperature");
        let tool_choice_value = tsutil::get_property_value(obj, "toolChoice");
        let provider_options = self.resolve_provider_options(obj, &name_value);
        let scorers = self.resolve_scorer_names(obj, &name_value);
        let tools = self.resolve_tool_references(obj, &name_value);

        for tool_name in &tools {
            if tool_name.contains(':') {
                continue;
            }
            if let Some(f) = self.state.functions.files.get(tool_name).cloned() {
                if !self.state.rpc.internal_files.has(tool_name) {
                    self.state.rpc.internal_files.set(tool_name.clone(), f);
                }
            }
        }

        let agents = self.resolve_agent_references(obj, &name_value);
        let workflows = self.resolve_workflow_references(obj, &name_value);
        for w in &workflows {
            self.state.workflows.invoked_workflows.add(w.clone());
        }

        if name_value.is_empty() {
            self.log.critical(codes::MISSING_NAME, "AI agent is missing the required 'name' property.");
            return;
        }
        let agent_key = if exported_name.is_empty() { name_value.clone() } else { exported_name.clone() };
        let description = match cm.description.as_deref() {
            Some(d) if !d.is_empty() => d.to_string(),
            _ => {
                self.log.critical(codes::MISSING_DESCRIPTION, format!("AI agent '{name_value}' is missing a description."));
                return;
            }
        };

        let mut input_schema: Option<String> = None;
        let mut output_schema: Option<String> = None;
        let mut working_memory_schema: Option<String> = None;
        let capitalized = func_id_to_type_name(&agent_key);
        for p in obj.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(ast::is_identifier) {
                continue;
            }
            let prop_name = p.name().unwrap().text().to_string();
            let init = p.initializer().unwrap();
            if prop_name == "input" || prop_name == "output" {
                let mut cap = prop_name[..1].to_uppercase();
                cap.push_str(&prop_name[1..]);
                let schema_name = format!("{capitalized}{cap}");
                if ast::is_identifier(init) {
                    let Some(r) = self.resolve_schema_ref(init, &format!("AI agent '{name_value}' {prop_name}")) else { continue };
                    self.state.schema_lookup.set(schema_name.clone(), r);
                    self.types_map().add_custom_type(&schema_name, "unknown", vec![]);
                    if prop_name == "input" {
                        input_schema = Some(schema_name);
                    } else {
                        output_schema = Some(schema_name);
                    }
                } else if ast::is_call_expression(init) {
                    self.log.critical(
                        codes::INLINE_SCHEMA,
                        format!(
                            "Inline schemas are not supported for '{prop_name}' in AI agent '{name_value}'.\n  Extract to an exported variable:\n    export const {schema_name} = {}\n  Then use: {prop_name}: {schema_name}",
                            node_text(init)
                        ),
                    );
                }
            } else if prop_name == "memory" && ast::is_object_literal_expression(init) {
                for mp in init.properties() {
                    if !ast::is_property_assignment(*mp)
                        || !mp.name().is_some_and(ast::is_identifier)
                        || mp.name().unwrap().text() != "workingMemory"
                        || !ast::is_identifier(mp.initializer().unwrap())
                    {
                        continue;
                    }
                    let Some(r) = self.resolve_schema_ref(mp.initializer().unwrap(), &format!("AI agent '{name_value}' workingMemory")) else { continue };
                    let schema_name = format!("{capitalized}WorkingMemory");
                    self.state.schema_lookup.set(schema_name.clone(), r);
                    self.types_map().add_custom_type(&schema_name, "unknown", vec![]);
                    working_memory_schema = Some(schema_name);
                }
            }
        }

        let tags: Vec<String> = if cm.has_tags { cm.tags.clone() } else { vec![] };
        let tags_opt = cm.tags_or_nil().map(|t| t.to_vec());
        let middleware = self.resolve_middleware(obj, tags_opt.as_deref());
        let channel_middleware = self.resolve_channel_middleware(obj, tags_opt.as_deref());
        let agent_middleware = self.resolve_agent_middleware(obj);
        let permissions = self.resolve_permissions(obj);

        self.state.service_aggregation.used_functions.add(agent_key.clone());
        self.add_used_wires(&middleware, &permissions);

        let source_file = file_name_of(node).to_string();
        if !exported_name.is_empty() {
            self.state.agents.files.set(agent_key.clone(), FileExport { path: source_file.clone(), exported_name: exported_name.clone() });
        }

        let meta = AgentMeta {
            name: name_value,
            description,
            role: truthy_string(&role_value),
            personality: truthy_string(&personality_value),
            goal: truthy_string(&goal_value),
            model: truthy_string(&model_value),
            summary: cm.summary.clone(),
            errors: if cm.has_errors { cm.errors.clone() } else { vec![] },
            source_file,
            exported_name,
            max_steps: prop_raw(&max_steps_value),
            temperature: prop_raw(&temperature_value),
            tool_choice: prop_raw(&tool_choice_value),
            provider_options,
            tools,
            agents,
            workflows,
            scorers,
            tags,
            input_schema,
            output_schema,
            working_memory_schema,
            middleware,
            channel_middleware,
            agent_middleware,
            permissions,
        };
        self.state.agents.agents_meta.set(agent_key.clone(), meta);

        if let Some(fm) = self.state.functions.meta.get_mut(&agent_key) {
            for svc in AGENT_PLATFORM_SERVICES {
                if !fm.services.services.iter().any(|e| e == svc) {
                    fm.services.services.push(svc.to_string());
                }
            }
        }
    }

    /// Reads `providerOptions` as a JSON object literal (literal-properties.ts
    /// jsonObjectProperty), warning when it is computed.
    fn resolve_provider_options(&mut self, obj: P<Node>, agent_name: &str) -> Raw {
        let Some(value) = literal_property(obj, "providerOptions") else { return Raw::default() };
        if ast::is_object_literal_expression(unwrap_as(value)) {
            if let Some(v) = read_json_literal(value) {
                return Raw::of(v);
            }
        }
        self.log.diagnostic(
            Level::Warn,
            codes::AGENT_PROVIDER_OPTIONS_UNREADABLE,
            format!(
                "AI agent '{agent_name}' has a 'providerOptions' the inspector cannot read statically, so it is missing from the generated metadata. Inline it as an object literal of strings, numbers, booleans, arrays and nested objects."
            ),
        );
        Raw::default()
    }

    fn resolve_tool_references(&mut self, obj: P<Node>, agent_name: &str) -> Vec<String> {
        let Some(arr) = array_property(obj, "tools") else { return vec![] };
        let mut resolved = Vec::new();
        for el in arr.elements() {
            let el = *el;
            if ast::is_string_literal(el) {
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "AI agent '{agent_name}' tools array contains a string literal '{}'. Use a function reference instead (e.g., import the pikkuFunc variable).",
                        el.text()
                    ),
                );
                continue;
            }
            if let Some((callee, Some(arg))) = string_call_arg(el, &["workflow", "ref"]) {
                if callee == "workflow" {
                    resolved.push(format!("workflow:{arg}"));
                } else {
                    resolved.push(arg);
                }
                continue;
            }
            if ast::is_identifier(el) {
                let name = self.resolve_identifier_to_rpc_name(el);
                if !name.is_empty() {
                    resolved.push(name);
                    continue;
                }
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!("AI agent '{agent_name}' tools array contains identifier '{}' that could not be resolved to a pikkuFunc.", el.text()),
                );
            }
        }
        resolved
    }

    fn resolve_agent_references(&mut self, obj: P<Node>, agent_name: &str) -> Vec<String> {
        let Some(arr) = array_property(obj, "agents") else { return vec![] };
        let mut resolved = Vec::new();
        for el in arr.elements() {
            let el = *el;
            if ast::is_string_literal(el) {
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "AI agent '{agent_name}' agents array contains a string literal '{}'. Use an agent reference instead (e.g., import the pikkuAgent variable).",
                        el.text()
                    ),
                );
                continue;
            }
            if ast::is_identifier(el) {
                if let Some(decl) = self.pikku_call_declaration(el, &["pikkuAgent"]) {
                    if decl.name().is_some_and(ast::is_identifier) {
                        resolved.push(decl.name().unwrap().text().to_string());
                        continue;
                    }
                }
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!("AI agent '{agent_name}' agents array contains identifier '{}' that could not be resolved to a pikkuAgent.", el.text()),
                );
            }
        }
        resolved
    }

    fn resolve_workflow_references(&mut self, obj: P<Node>, agent_name: &str) -> Vec<String> {
        let Some(arr) = array_property(obj, "workflows") else { return vec![] };
        let mut resolved = Vec::new();
        for el in arr.elements() {
            let el = *el;
            if ast::is_string_literal(el) {
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "AI agent '{agent_name}' workflows array contains a string literal '{}'. Use a workflow reference instead (e.g., ref('<workflowName>') or import the pikkuWorkflowGraph variable).",
                        el.text()
                    ),
                );
                continue;
            }
            if let Some((_, Some(arg))) = string_call_arg(el, &["ref", "workflow"]) {
                resolved.push(arg);
                continue;
            }
            if ast::is_identifier(el) {
                let name = self.resolve_identifier_to_workflow_name(el);
                if !name.is_empty() {
                    resolved.push(name);
                    continue;
                }
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!("AI agent '{agent_name}' workflows array contains identifier '{}' that could not be resolved to a pikkuWorkflowGraph.", el.text()),
                );
            }
        }
        resolved
    }

    /// Resolves an identifier (through an import) to its `const x = <callee>(...)`
    /// declaration when callee is one of callees.
    fn pikku_call_declaration(&mut self, ident: P<Node>, callees: &[&str]) -> Option<P<Node>> {
        let s = self.symbol_at(ident);
        let sym = self.resolve_alias(s)?;
        let decl = symbol_decl(sym)?;
        if !ast::is_variable_declaration(decl) || decl.initializer().is_none() {
            return None;
        }
        let init = decl.initializer().unwrap();
        if !ast::is_call_expression(init) || !init.expression().is_some_and(ast::is_identifier) {
            return None;
        }
        let callee = init.expression().unwrap().text();
        if callees.iter().any(|c| *c == callee) { Some(decl) } else { None }
    }

    fn resolve_identifier_to_rpc_name(&mut self, ident: P<Node>) -> String {
        let Some(decl) = self.pikku_call_declaration(ident, &["pikkuFunc", "pikkuSessionlessFunc", "pikkuVoidFunc"]) else { return String::new() };
        if let Some(v) = string_property_of_first_arg(decl, "override") {
            return v;
        }
        if decl.name().is_some_and(ast::is_identifier) {
            return decl.name().unwrap().text().to_string();
        }
        String::new()
    }

    fn resolve_identifier_to_workflow_name(&mut self, ident: P<Node>) -> String {
        let Some(decl) = self.pikku_call_declaration(ident, &["pikkuWorkflowGraph", "pikkuWorkflow", "pikkuWorkflowComplex"]) else { return String::new() };
        if let Some(v) = string_property_of_first_arg(decl, "name") {
            return v;
        }
        if decl.name().is_some_and(ast::is_identifier) {
            return decl.name().unwrap().text().to_string();
        }
        String::new()
    }

    /// Reads `scorers`, which are plain names.
    fn resolve_scorer_names(&mut self, obj: P<Node>, agent_name: &str) -> Vec<String> {
        let Some(arr) = array_property(obj, "scorers") else { return vec![] };
        let mut names = Vec::new();
        for el in arr.elements() {
            if !ast::is_string_literal(*el) {
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "AI agent '{agent_name}' lists a scorer that is not an inline string: `{}`. A scorer is named, not imported, so the name has to be readable from source.",
                        node_text(*el)
                    ),
                );
                continue;
            }
            names.push(el.text().to_string());
        }
        names
    }

    // --- add-agent-scorer.ts ---------------------------------------------------

    pub fn add_agent_scorer(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !node.expression().is_some_and(ast::is_identifier) {
            return;
        }
        // pikkuAgentScorer grades in code, pikkuAgentJudge with a model.
        let lane = match node.expression().unwrap().text() {
            "pikkuAgentScorer" => "fast",
            "pikkuAgentJudge" => "slow",
            _ => return,
        };
        let args = node.arguments();
        if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
            return;
        }
        let obj = args[0];
        let exported_name = self.extract_function_name(node).exported_name;

        let name_value = tsutil::get_property_value(obj, "name").as_string();
        if name_value.is_empty() {
            self.log.critical(codes::MISSING_NAME, "AI scorer is missing the required 'name' property.");
            return;
        }
        let description = tsutil::get_property_value(obj, "description");
        if !description.truthy() {
            self.log.critical(codes::MISSING_DESCRIPTION, format!("AI scorer '{name_value}' is missing the required 'description' property."));
            return;
        }
        let sample_rate = tsutil::get_property_value(obj, "sampleRate");
        if let Some(n) = sample_rate.num {
            if !(0.0..=1.0).contains(&n) {
                self.log.critical(
                    codes::INVALID_VALUE,
                    format!(
                        "AI scorer '{name_value}' has a sampleRate of {} \u{2014} it is the fraction of live runs to grade, so it must be between 0 and 1.",
                        format_number(n)
                    ),
                );
                return;
            }
        }
        let mut sample_rate_raw = prop_raw(&sample_rate);
        if sample_rate_raw.is_empty() {
            sample_rate_raw = Raw::of(Value::from(1));
        }
        let mut requires_reference = prop_raw(&tsutil::get_property_value(obj, "requiresReference"));
        if requires_reference.is_empty() {
            requires_reference = Raw::of(Value::Bool(false));
        }

        let scorer_key = if exported_name.is_empty() { name_value.clone() } else { exported_name.clone() };
        let source_file = file_name_of(node).to_string();
        if !exported_name.is_empty() {
            self.state.scorers.files.set(scorer_key.clone(), FileExport { path: source_file.clone(), exported_name: exported_name.clone() });
        }
        self.state.scorers.scorers_meta.set(
            scorer_key,
            ScorerMeta {
                name: name_value,
                description: truthy_string(&description),
                lane: lane.to_string(),
                sample_rate: sample_rate_raw,
                requires_reference,
                source_file,
                exported_name,
            },
        );
    }
}

/// The string-literal `<name>` of the declaration initializer's first
/// object-literal argument.
fn string_property_of_first_arg(decl: P<Node>, name: &str) -> Option<String> {
    let args = decl.initializer().unwrap().arguments();
    if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
        return None;
    }
    for p in args[0].properties() {
        if ast::is_property_assignment(*p)
            && p.name().is_some_and(ast::is_identifier)
            && p.name().unwrap().text() == name
            && ast::is_string_literal(p.initializer().unwrap())
        {
            return Some(p.initializer().unwrap().text().to_string());
        }
    }
    None
}
