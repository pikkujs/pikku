//! Port of Go `visit/group_workflow.go`: add/add-workflow.ts.

use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::workflow_dsl::DslResult;
use super::workflow_dsl_patterns::{extract_virtual_user_from_options, get_source_text};
use super::workflow_jsobj::{Js, JsObj, jo, js_number};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::{FileExport, Set};
use crate::tsutil::{self, PropValue, file_name_of};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addWorkflow",
        phase: Phase::Setup,
        order: order::ADD_WORKFLOW,
        visit: |c, n| c.add_workflow(n),
    });
}

/// extract-node-value.ts isStringLike.
fn is_string_like(mut n: P<Node>) -> bool {
    while tsutil::is_as_expression(n) || n.kind() == Kind::TypeAssertionExpression {
        n = n.expression().unwrap();
    }
    ast::is_string_literal(n) || ast::is_no_substitution_template_literal(n) || ast::is_template_expression(n)
}

fn contains_expect_eventually_call(n: P<Node>) -> bool {
    if ast::is_call_expression(n) {
        let callee = n.expression().unwrap();
        if ast::is_property_access_expression(callee) && callee.name().unwrap().text() == "expectEventually" {
            return true;
        }
    }
    let mut found = false;
    n.for_each_child(&mut |c| {
        if !found && !ast::is_function_declaration(c) {
            found = contains_expect_eventually_call(c);
        }
        false
    });
    found
}

/// The nested step lists of a branch, switch, fanout or parallel step, in the
/// order the TS walkers visit them.
fn child_step_lists(step: &JsObj) -> Vec<Vec<&JsObj>> {
    let mut out = vec![];
    match step.str("type").unwrap_or("") {
        "branch" => {
            for b in step.steps("branches") {
                out.push(b.steps("steps"));
            }
            out.push(step.steps("elseSteps"));
        }
        "switch" => {
            for c in step.steps("cases") {
                out.push(c.steps("steps"));
            }
            out.push(step.steps("defaultSteps"));
        }
        "fanout" => out.push(step.steps("body")),
        "parallel" => out.push(step.steps("children")),
        _ => {}
    }
    out
}

fn has_inline_steps(steps: &[&JsObj]) -> bool {
    for st in steps {
        if st.str("type") == Some("inline") {
            return true;
        }
        for l in child_step_lists(st) {
            if has_inline_steps(&l) {
                return true;
            }
        }
    }
    false
}

fn collect_invoked_rpcs(steps: &[&JsObj], rpcs: &mut Set) {
    for st in steps {
        let t = st.str("type").unwrap_or("");
        if t == "rpc" {
            if let Some(n) = st.str("rpcName").filter(|n| !n.is_empty()) {
                rpcs.add(n);
            }
            continue;
        }
        if t == "scenarioStep" {
            if let Some(n) = st.str("stepFunc").filter(|n| !n.is_empty()) {
                rpcs.add(n);
            }
            continue;
        }
        for l in child_step_lists(st) {
            collect_invoked_rpcs(&l, rpcs);
        }
    }
}

/// getPropertyValue's result as a JS value: null for none.
fn prop_value_to_js(v: &PropValue) -> Js {
    if !v.present {
        return Js::Null;
    }
    if let Some(b) = v.bool {
        return Js::Bool(b);
    }
    if let Some(n) = v.num {
        return Js::Num(n);
    }
    if let Some(s) = &v.strs {
        return Js::from(s.clone());
    }
    if let Some(s) = &v.str {
        return Js::from(s.as_str());
    }
    Js::Null
}

impl Context<'_> {
    fn extract_step_name(&mut self, n: P<Node>) -> String {
        self.extract_string_literal(n).unwrap_or_else(|| get_source_text(n))
    }

    /// The basic AST walk used when a workflow is not (or not only) a DSL
    /// workflow.
    fn get_workflow_invocations(&mut self, n: P<Node>, steps: &mut Vec<JsObj>) {
        if ast::is_property_access_expression(n) {
            let name = n.name().unwrap().text();
            let parent = n.parent();
            if matches!(name, "do" | "sleep" | "cancel" | "expectEventually") {
                if let Some(parent) = parent.filter(|p| ast::is_call_expression(*p) && p.expression() == Some(n)) {
                    let args = parent.arguments();
                    if name == "do" && args.len() >= 2 {
                        let options_arg = if args.len() >= 4 { Some(args[args.len() - 1]) } else { None };
                        let mut step_name = self.extract_step_name(args[0]);
                        if is_string_like(args[1]) {
                            if let Some(rpc_name) = self.extract_string_literal(args[1]) {
                                steps.push(jo!(
                                    "type" => "rpc",
                                    "stepName" => step_name,
                                    "rpcName" => rpc_name.as_str(),
                                    "virtualUser" => extract_virtual_user_from_options(options_arg),
                                ));
                                self.state.rpc.invoked_functions.add(rpc_name);
                            }
                        } else if ast::is_arrow_function(args[1])
                            || ast::is_function_expression(args[1])
                            || ast::is_function_declaration(args[1])
                        {
                            let mut description = self.extract_options_description(options_arg);
                            if step_name.is_empty() {
                                step_name = "<dynamic>".to_string();
                            }
                            if description.is_empty() {
                                description = "<dynamic>".to_string();
                            }
                            steps.push(jo!("type" => "inline", "stepName" => step_name, "description" => description));
                        }
                    } else if name == "expectEventually" && args.len() >= 4 {
                        let step_name = self.extract_step_name(args[0]);
                        if is_string_like(args[1]) {
                            if let Some(rpc_name) = self.extract_string_literal(args[1]) {
                                let opt = if args.len() >= 5 { Some(args[4]) } else { None };
                                steps.push(jo!(
                                    "type" => "rpc",
                                    "stepName" => step_name,
                                    "rpcName" => rpc_name.as_str(),
                                    "expectEventually" => true,
                                    "virtualUser" => extract_virtual_user_from_options(opt),
                                ));
                                self.state.rpc.invoked_functions.add(rpc_name);
                            }
                        }
                    } else if name == "sleep" && args.len() >= 2 {
                        let mut step_name = self.extract_step_name(args[0]);
                        if step_name.is_empty() {
                            step_name = "<dynamic>".to_string();
                        }
                        let mut duration = Js::from("<dynamic>");
                        if ast::is_numeric_literal(args[1]) {
                            let v = js_number(args[1].text());
                            if v != 0.0 {
                                duration = Js::Num(v);
                            }
                        } else if let Some(v) = self.extract_string_literal(args[1]).filter(|v| !v.is_empty()) {
                            duration = Js::Str(v);
                        }
                        steps.push(jo!("type" => "sleep", "stepName" => step_name, "duration" => duration));
                    } else if name == "cancel" {
                        steps.push(jo!("type" => "cancel"));
                    }
                }
            }
        }
        n.for_each_child(&mut |c| {
            if !ast::is_function_declaration(c) {
                self.get_workflow_invocations(c, steps);
            }
            false
        });
    }

    /// extract-node-value.ts extractDescription.
    fn extract_options_description(&mut self, opt: Option<P<Node>>) -> String {
        let Some(opt) = opt.filter(|o| ast::is_object_literal_expression(*o)) else { return String::new() };
        if let Some(p) = tsutil::find_property_assignment(opt, "description") {
            if let Some(v) = self.extract_string_literal(p.initializer().unwrap()) {
                return v;
            }
        }
        String::new()
    }

    pub fn add_workflow(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !node.expression().is_some_and(ast::is_identifier) {
            return;
        }
        let callee = node.expression().unwrap().text();
        let wrapper = match callee {
            "pikkuWorkflowFunc" => "dsl",
            "pikkuWorkflowComplexFunc" => {
                if !self.options.allow_complex_workflows {
                    self.log.critical(
                        codes::COMPLEX_WORKFLOW_NOT_ALLOWED,
                        format!(
                            "'{callee}' is used here, but this project has not enabled complex workflows. \
                             Their inline steps cannot be serialized, so they are absent from the workflow graph and \
                             cannot be replayed or migrated across a definition change. Express the workflow with \
                             pikkuWorkflowFunc and the step DSL, or set `allow: {{ complexWorkflows: true }}` in \
                             pikku.config.json if the project accepts that trade."
                        ),
                    );
                    return;
                }
                "complex"
            }
            "pikkuScenario" => "scenario",
            _ => return,
        };
        let args = node.arguments();
        let Some(&first_arg) = args.first() else { return };

        let fn_name = self.extract_function_name(node);
        let mut workflow_name = fn_name.exported_name.clone();
        if workflow_name.is_empty() {
            workflow_name = fn_name.name.clone();
        }
        if workflow_name.is_empty() {
            self.log.critical(
                codes::MISSING_NAME,
                format!(
                    "Could not determine workflow name from export at {}. Assign the `{callee}(...)` call to an exported const; that name is how it is registered.",
                    self.node_position(node)
                ),
            );
            return;
        }

        let (func_node, resolved_func, _) = self.extract_function_node(first_arg);

        let (mut tags, mut errors_list, mut title, mut summary, mut description, mut expose, mut skip) =
            (Js::Undef, Js::Undef, Js::Undef, Js::Undef, Js::Undef, Js::Undef, Js::Undef);
        if ast::is_object_literal_expression(first_arg) {
            let m = self.get_common_wire_meta_data(first_arg);
            if m.disabled {
                return;
            }
            if m.has_tags {
                tags = Js::from(m.tags.clone());
            }
            if m.has_errors {
                errors_list = Js::from(m.errors.clone());
            }
            title = Js::from(m.title.clone());
            summary = Js::from(m.summary.clone());
            description = Js::from(m.description.clone());
            expose = prop_value_to_js(&tsutil::get_property_value(first_arg, "expose"));
            let s = prop_value_to_js(&tsutil::get_property_value(first_arg, "skip"));
            if s != Js::Null {
                skip = s;
            }
        }

        if ast::is_object_literal_expression(first_arg) && func_node == first_arg {
            self.log.critical(codes::MISSING_FUNC, format!("No valid 'func' property for workflow '{workflow_name}'."));
            return;
        }
        let Some(resolved_func) = resolved_func else {
            self.log.critical(codes::MISSING_FUNC, format!("Could not resolve workflow function for '{workflow_name}'."));
            return;
        };
        if wrapper != "scenario" && contains_expect_eventually_call(resolved_func) {
            self.log.critical(
                codes::EXPECT_EVENTUALLY_SCENARIO_ONLY,
                format!(
                    "Workflow '{workflow_name}' calls workflow.expectEventually(), which is only available in scenarios (pikkuScenario). Move it into a scenario, or drive the assertion outside the workflow."
                ),
            );
            return;
        }

        if !fn_name.exported_name.is_empty() {
            self.state.workflows.files.set(
                fn_name.pikku_func_id.clone(),
                FileExport { path: file_name_of(node).to_string(), exported_name: fn_name.exported_name.clone() },
            );
        }

        let mut steps: Vec<JsObj> = vec![];
        let (mut context, mut dsl, mut asserts) = (Js::Undef, Js::Undef, Js::Undef);

        let result: DslResult = self.extract_dsl_workflow(node, wrapper != "dsl");
        let reason = if result.reason.is_empty() { "Unknown error".to_string() } else { result.reason.clone() };
        if result.ok {
            steps = result.steps;
            context = result.context;
            asserts = result.asserts;
            let refs: Vec<&JsObj> = steps.iter().collect();
            if has_inline_steps(&refs) {
                if wrapper == "dsl" {
                    self.log.critical(
                        codes::INVALID_DSL_WORKFLOW,
                        format!(
                            "Workflow '{workflow_name}' uses pikkuWorkflowFunc but contains inline steps which are not allowed in DSL workflows. Use pikkuWorkflowComplexFunc instead."
                        ),
                    );
                    return;
                }
                dsl = Js::Bool(false);
            } else {
                dsl = Js::Bool(wrapper == "dsl");
            }
            let mut rpcs = Set::new();
            collect_invoked_rpcs(&refs, &mut rpcs);
            for r in rpcs.values() {
                self.state.rpc.invoked_functions.add(r);
            }
        } else {
            match wrapper {
                "dsl" => {
                    self.get_workflow_invocations(resolved_func, &mut steps);
                    self.log.critical(
                        codes::INVALID_DSL_WORKFLOW,
                        format!("Workflow '{workflow_name}' does not conform to DSL workflow rules:\n{reason}"),
                    );
                    return;
                }
                "scenario" => {
                    self.log.critical(
                        codes::SCENARIO_NOT_EXTRACTABLE,
                        format!(
                            "Scenario '{workflow_name}' could not be extracted, so none of its steps were recorded and it would run as an empty scenario:\n{reason}"
                        ),
                    );
                    return;
                }
                _ => {
                    self.log.debug(format!(
                        "Workflow '{workflow_name}' could not be extracted as DSL workflow: {reason}. Falling back to basic extraction."
                    ));
                    dsl = Js::Bool(false);
                }
            }
        }

        if wrapper != "dsl" {
            if !steps.is_empty() {
                let mut sink = vec![];
                self.get_workflow_invocations(resolved_func, &mut sink);
            } else {
                self.get_workflow_invocations(resolved_func, &mut steps);
            }
        }

        let mut virtual_users: Vec<String> = vec![];
        for st in &steps {
            if let Some(v) = st.str("virtualUser") {
                if !virtual_users.iter().any(|u| u == v) {
                    virtual_users.push(v.to_string());
                }
            }
        }

        let meta = jo!(
            "pikkuFuncId" => fn_name.pikku_func_id.as_str(),
            "name" => workflow_name.as_str(),
            "steps" => steps,
            "context" => context,
            "dsl" => dsl,
            "title" => title,
            "summary" => summary,
            "description" => description,
            "errors" => errors_list,
            "tags" => tags,
            "expose" => expose,
            "skip" => skip,
            "scenario" => if wrapper == "scenario" { Js::Bool(true) } else { Js::Undef },
            "asserts" => asserts,
            "virtualUsers" => if virtual_users.is_empty() { Js::Undef } else { Js::from(virtual_users) },
        );
        self.state.workflows.meta.set(workflow_name, meta.raw());
    }
}
