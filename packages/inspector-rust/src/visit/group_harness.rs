//! Port of Go `visit/group_harness.go`. pikkuHarness and pikkuHarnessGateAgent
//! have no body and are read here. pikkuHarnessGate has one, so addFunctions
//! reads it as a function and `read_harness_gate` adds its harness fields.

use std::collections::HashSet;

use tsrs_ast::{self as ast, Node, NodeFlags};
use tsrs_core::P;

use super::group_agent::truthy_string;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::{Harness, HarnessAgentMeta, HarnessGateAgentMeta, HarnessGateEntry, HarnessMeta};
use crate::tsutil::{self, file_name_of, node_text, unwrap_as};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addHarness", phase: Phase::Routes, order: order::ADD_HARNESS, visit: |c, n| c.add_harness(n) });
}

pub const HARNESS_WRAPPER: &str = "pikkuHarness";
pub const HARNESS_GATE_WRAPPER: &str = "pikkuHarnessGate";
pub const HARNESS_GATE_AGENT_WRAPPER: &str = "pikkuHarnessGateAgent";

fn is_severity(s: &str) -> bool {
    matches!(s, "low" | "medium" | "high")
}

/// What a gate may change when it declares no `writes`.
const DEFAULT_HARNESS_WRITES: [&str; 1] = [".pikku/**"];

pub struct HarnessGateConfig {
    pub fail_on: String,
    pub writes: Vec<String>,
}

/// The elements of an inline array of string literals.
fn literal_strings(n: P<Node>) -> Option<Vec<String>> {
    let n = unwrap_as(n);
    if !ast::is_array_literal_expression(n) {
        return None;
    }
    let mut out = Vec::new();
    for e in n.elements() {
        if !ast::is_string_literal(*e) {
            return None;
        }
        out.push(e.text().to_string());
    }
    Some(out)
}

/// The inline object literal assigned to `name`.
fn object_property(obj: P<Node>, name: &str) -> Option<P<Node>> {
    let p = tsutil::find_property_assignment(obj, name)?;
    let init = unwrap_as(p.initializer()?);
    ast::is_object_literal_expression(init).then_some(init)
}

impl Context<'_> {
    /// Go `readHarnessGate`: a pikkuHarnessGate's name, failOn and writes, or
    /// `None` (reported) when one of them is not readable from source.
    pub fn read_harness_gate(&mut self, obj: P<Node>, name: &str) -> Option<HarnessGateConfig> {
        if !ast::is_object_literal_expression(obj) {
            self.log.critical(
                codes::INVALID_VALUE,
                format!(
                    "A harness gate is declared with a config that is not an inline object: `{}`. Its name, failOn and writes have to be readable from source.",
                    node_text(obj)
                ),
            );
            return None;
        }
        if name.is_empty() {
            self.log.critical(codes::MISSING_NAME, "Harness gate is missing the required 'name' property.");
            return None;
        }
        if !tsutil::get_property_value(obj, "description").truthy() {
            self.log.critical(codes::MISSING_DESCRIPTION, format!("Harness gate '{name}' is missing the required 'description' property."));
            return None;
        }
        let fail_on = self.harness_fail_on(obj, &format!("Harness gate '{name}'"))?;
        let mut writes: Vec<String> = DEFAULT_HARNESS_WRITES.iter().map(|s| s.to_string()).collect();
        if let Some(p) = tsutil::find_property_assignment(obj, "writes") {
            let init = p.initializer().unwrap();
            match literal_strings(init) {
                Some(w) => writes = w,
                None => {
                    self.log.critical(
                        codes::INVALID_VALUE,
                        format!(
                            "Harness gate '{name}' has a writes that is not an inline array of path patterns: `{}`. The engine checks every change the gate makes against it, so it has to be readable from source.",
                            node_text(init)
                        ),
                    );
                    return None;
                }
            }
        }
        Some(HarnessGateConfig { fail_on, writes })
    }

    fn harness_fail_on(&mut self, obj: P<Node>, label: &str) -> Option<String> {
        let fail_on = tsutil::get_property_value(obj, "failOn").as_string();
        if !is_severity(&fail_on) {
            self.log.critical(
                codes::INVALID_VALUE,
                format!("{label} has no failOn of 'low', 'medium' or 'high' readable from source. It is the lowest finding severity that fails the gate."),
            );
            return None;
        }
        Some(fail_on)
    }

    fn harness_state(&mut self) -> &mut Harness {
        self.state.harness.get_or_insert_with(Harness::default)
    }

    pub fn add_harness(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) || !node.expression().is_some_and(ast::is_identifier) {
            return;
        }
        let callee = node.expression().unwrap().text();
        if callee != HARNESS_WRAPPER && callee != HARNESS_GATE_AGENT_WRAPPER {
            return;
        }
        let args = node.arguments();
        if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
            return;
        }
        let obj = args[0];
        let label = if callee == HARNESS_GATE_AGENT_WRAPPER { "Harness gate agent" } else { "Harness" };
        let name = tsutil::get_property_value(obj, "name").as_string();
        if name.is_empty() {
            self.log.critical(codes::MISSING_NAME, format!("{label} is missing the required 'name' property."));
            return;
        }
        let description = tsutil::get_property_value(obj, "description");
        if !description.truthy() {
            self.log.critical(codes::MISSING_DESCRIPTION, format!("{label} '{name}' is missing the required 'description' property."));
            return;
        }
        let exported_name = self.extract_function_name(node).exported_name;
        let source_file = file_name_of(node).to_string();

        if callee == HARNESS_GATE_AGENT_WRAPPER {
            self.add_harness_gate_agent(obj, name, truthy_string(&description), source_file, exported_name);
            return;
        }

        let Some(model) = self.harness_model(object_property(obj, "agent"), &format!("Harness '{name}' has no agent model")) else { return };
        let Some(gates) = self.resolve_harness_gates(obj, &name) else { return };
        let meta = HarnessMeta {
            name: name.clone(),
            description: truthy_string(&description),
            harness: true,
            agent: HarnessAgentMeta { model },
            gates,
            source_file,
            exported_name,
        };
        self.harness_state().harnesses_meta.set(name, meta);
    }

    fn add_harness_gate_agent(&mut self, obj: P<Node>, name: String, description: String, source_file: String, exported_name: String) {
        let label = format!("Harness gate agent '{name}'");
        if let Some(gate) = self.state.functions.meta.get(&name) {
            if gate.harness.is_some() {
                let gate_file = gate.source_file.clone();
                self.log.critical(
                    codes::DUPLICATE_FUNCTION_NAME,
                    format!("{label} has the name of the harness gate in '{gate_file}'. A harness names its gates, so the two must differ."),
                );
                return;
            }
        }
        let Some(model) = self.harness_model(Some(obj), &format!("{label} has no model")) else { return };
        let goal = tsutil::get_property_value(obj, "goal").as_string();
        if goal.is_empty() {
            self.log.critical(codes::INVALID_VALUE, format!("{label} has no goal readable from source. The goal is what the reviewer is asked to check."));
            return;
        }
        let Some(fail_on) = self.harness_fail_on(obj, &label) else { return };
        let meta = HarnessGateAgentMeta { name: name.clone(), description, harness: true, model, goal, fail_on, source_file, exported_name };
        self.harness_state().gate_agents_meta.set(name, meta);
    }

    /// The string literal `model` of obj.
    fn harness_model(&mut self, obj: Option<P<Node>>, missing: &str) -> Option<String> {
        let model = obj.map(|o| tsutil::get_property_value(o, "model").as_string()).unwrap_or_default();
        if model.is_empty() {
            self.log.critical(codes::MISSING_MODEL, format!("{missing} readable from source. Give `model` as a string literal."));
            return None;
        }
        Some(model)
    }

    /// Go `resolveHarnessGates`: gate names, references to declared gates and
    /// gate agents, `.with({ failOn })` on such a reference, and spreads of
    /// const arrays of these, followed to their declarations.
    fn resolve_harness_gates(&mut self, obj: P<Node>, harness_name: &str) -> Option<Vec<HarnessGateEntry>> {
        let Some(p) = tsutil::find_property_assignment(obj, "gates") else {
            self.log.critical(codes::INVALID_VALUE, format!("Harness '{harness_name}' has no gates. List the gates that must pass, by name or by reference."));
            return None;
        };
        let mut gates = Vec::new();
        let mut seen = HashSet::new();
        self.collect_harness_gates(p.initializer().unwrap(), harness_name, &mut gates, &mut seen).then_some(gates)
    }

    fn collect_harness_gates(&mut self, list: P<Node>, harness_name: &str, out: &mut Vec<HarnessGateEntry>, seen: &mut HashSet<P<Node>>) -> bool {
        let Some(arr) = self.const_array_literal(list, seen) else {
            self.not_static_gates(harness_name, list);
            return false;
        };
        for el in arr.elements() {
            let el = *el;
            if ast::is_spread_element(el) {
                if !self.collect_harness_gates(el.expression().unwrap(), harness_name, out, seen) {
                    return false;
                }
                continue;
            }
            let Some(entry) = self.harness_gate_entry(el) else {
                self.not_static_gates(harness_name, el);
                return false;
            };
            out.push(entry);
        }
        true
    }

    fn not_static_gates(&mut self, harness_name: &str, n: P<Node>) {
        self.log.critical(
            codes::INVALID_VALUE,
            format!(
                "Harness '{harness_name}' lists gates that are not readable from source: `{}`. Use a gate name, a declared gate or gate agent (optionally `.with({{ failOn }})`), or a spread of a const array of these.",
                node_text(n)
            ),
        );
    }

    /// n when it is an inline array, or the array a const identifier is
    /// initialised with.
    fn const_array_literal(&mut self, n: P<Node>, seen: &mut HashSet<P<Node>>) -> Option<P<Node>> {
        let n = unwrap_as(tsutil::unwrap_non_null_parens(n));
        if ast::is_array_literal_expression(n) {
            return Some(n);
        }
        let init = self.const_initializer(n)?;
        if !seen.insert(init) {
            return None;
        }
        let init = unwrap_as(init);
        ast::is_array_literal_expression(init).then_some(init)
    }

    /// The initializer of the const an identifier refers to.
    fn const_initializer(&mut self, n: P<Node>) -> Option<P<Node>> {
        if !ast::is_identifier(n) {
            return None;
        }
        let sym = self.symbol_at(n);
        let decls = self.resolve_alias(sym).map(|s| s.declarations().to_vec()).unwrap_or_default();
        decls.into_iter().find_map(|decl| {
            let list = decl.parent()?;
            (ast::is_variable_declaration(decl) && ast::is_variable_declaration_list(list) && list.flags().intersects(NodeFlags::Const))
                .then(|| decl.initializer())
                .flatten()
        })
    }

    fn harness_gate_entry(&mut self, el: P<Node>) -> Option<HarnessGateEntry> {
        let el = unwrap_as(el);
        if ast::is_string_literal(el) {
            return Some(HarnessGateEntry { name: el.text().to_string(), fail_on: String::new() });
        }
        if ast::is_call_expression(el) {
            let callee = el.expression()?;
            if ast::is_property_access_expression(callee) && callee.name().is_some_and(|n| n.text() == "with") {
                let name = self.harness_gate_reference(callee.expression()?)?;
                let args = el.arguments();
                if args.len() != 1 || !ast::is_object_literal_expression(args[0]) {
                    return None;
                }
                let fail_on = tsutil::get_property_value(args[0], "failOn").as_string();
                return is_severity(&fail_on).then_some(HarnessGateEntry { name, fail_on });
            }
        }
        let name = self.harness_gate_reference(el)?;
        Some(HarnessGateEntry { name, fail_on: String::new() })
    }

    /// The name of the gate or gate agent an identifier refers to.
    fn harness_gate_reference(&mut self, n: P<Node>) -> Option<String> {
        let init = self.const_initializer(n)?;
        if !ast::is_call_expression(init) || !init.expression().is_some_and(ast::is_identifier) {
            return None;
        }
        let callee = init.expression().unwrap().text();
        if callee != HARNESS_GATE_WRAPPER && callee != HARNESS_GATE_AGENT_WRAPPER {
            return None;
        }
        let args = init.arguments();
        if args.is_empty() || !ast::is_object_literal_expression(args[0]) {
            return None;
        }
        let name = tsutil::get_property_value(args[0], "name").as_string();
        (!name.is_empty()).then_some(name)
    }
}
