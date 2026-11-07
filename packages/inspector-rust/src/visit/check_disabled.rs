//! Port of Go `visit/check_disabled.go` (add/check-disabled-references.ts): a
//! function declared `disabled` is left out of the build, and anything still
//! referencing it is PKU562.

use std::collections::BTreeSet;

use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::order;
use super::{Context, Phase, Registry, Visitor};
use crate::diag::codes;
use crate::state::{DisabledFunctionMeta, Raw};
use crate::tsutil;

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "checkDisabledReferences",
        phase: Phase::Routes,
        order: order::CHECK_DISABLED_REFS,
        visit: check_disabled_references,
    });
}

/// `enclosingCallee` is the call a reference sits in, by its callee.
fn enclosing_callee(node: P<Node>) -> Option<String> {
    let mut current = node.parent();
    while let Some(c) = current {
        if ast::is_call_expression(c) {
            let callee = c.expression().unwrap();
            if ast::is_identifier(callee) || ast::is_property_access_expression(callee) {
                return Some(tsutil::node_text(callee).to_string());
            }
        }
        current = c.parent();
    }
    None
}

fn local_name(m: &DisabledFunctionMeta) -> &str {
    if m.exported_name.is_empty() { &m.name } else { &m.exported_name }
}

/// `invokedRpcName` is the name in `rpc.invoke('x')` / `rpc.mesh('x')`, seen
/// through `!` and parentheses.
fn invoked_rpc_name(node: P<Node>) -> Option<String> {
    let callee = node.expression()?;
    if !ast::is_property_access_expression(callee) {
        return None;
    }
    let method = callee.name()?.text();
    if method != "invoke" && method != "mesh" {
        return None;
    }
    let mut receiver = callee.expression()?;
    while ast::is_non_null_expression(receiver) || ast::is_parenthesized_expression(receiver) {
        receiver = receiver.expression()?;
    }
    let is_rpc = if ast::is_identifier(receiver) {
        receiver.text() == "rpc"
    } else if ast::is_property_access_expression(receiver) {
        receiver.name()?.text() == "rpc"
    } else {
        false
    };
    let args = node.arguments();
    if !is_rpc || args.is_empty() {
        return None;
    }
    let first = args[0];
    if !ast::is_string_literal(first) && !ast::is_no_substitution_template_literal(first) {
        return None;
    }
    Some(first.text().to_string())
}

fn is_not_a_disabled_reference(node: P<Node>) -> bool {
    let Some(parent) = node.parent() else { return true };
    if ast::is_import_specifier(parent)
        || ast::is_export_specifier(parent)
        || ast::is_import_clause(parent)
        || ast::is_namespace_import(parent)
        || ast::is_type_query_node(parent)
        || ast::is_qualified_name(parent)
    {
        return true;
    }
    if ast::is_shorthand_property_assignment(parent) {
        return false;
    }
    parent.name() == Some(node)
}

/// Whether a node sits in a generated file. This run rewrites those from its
/// own state, which leaves disabled functions out, so a reference there is the
/// last run's and is about to go.
fn is_generated_file(node: P<Node>) -> bool {
    let file = tsutil::file_name_of(node);
    file.ends_with(".gen.ts") || file.ends_with(".gen.js")
}

impl Context<'_> {
    /// `readFunctionDisabled` reads a function's `disabled`: `true`, or a
    /// non-empty string saying why. Anything else the build cannot read is
    /// refused rather than taken as enabled. `Some(reason)` when disabled (the
    /// reason may be "").
    pub fn read_function_disabled(&mut self, obj: P<Node>, name: &str) -> Option<String> {
        for p in obj.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == "disabled") {
                continue;
            }
            let init = p.initializer().unwrap();
            if init.kind() == Kind::TrueKeyword {
                return Some(String::new());
            }
            if init.kind() == Kind::FalseKeyword {
                return None;
            }
            if (ast::is_string_literal(init) || ast::is_no_substitution_template_literal(init)) && !init.text().is_empty() {
                return Some(init.text().to_string());
            }
            self.log.critical(
                codes::INVALID_VALUE,
                format!("'{name}' has a `disabled` the build cannot read. Use `true` or a non-empty string literal."),
            );
            return Some(String::new());
        }
        None
    }

    fn describe_disabled(&self, meta: &DisabledFunctionMeta) -> String {
        let reason = if meta.reason.is_empty() { String::new() } else { format!(" ({})", meta.reason) };
        format!("'{}' is disabled{reason} in {}", meta.name, self.rel_to_root(&meta.source_file))
    }

    /// `recordDisabledFunction` records a function declared `disabled` in place
    /// of everything addFunctions would otherwise record. One defined inline in
    /// what uses it is referenced by that, so it is refused instead.
    pub fn record_disabled_function(&mut self, node: P<Node>, pikku_func_id: &str, meta: DisabledFunctionMeta) {
        if let Some(parent) = node.parent()
            && ast::is_variable_declaration(parent)
            && parent.initializer() == Some(node)
        {
            self.state.functions.disabled.get_or_insert_with(Default::default).set(pikku_func_id, meta);
            return;
        }
        let inside = match enclosing_callee(node) {
            Some(call) => format!(" inside {call}(...)"),
            None => String::new(),
        };
        let pos = self.node_position(node);
        self.log.critical(
            codes::DISABLED_FUNCTION_REFERENCED,
            format!(
                "A function declared `disabled` is defined inline at {pos}{inside}, which still uses it. Remove what uses it, or remove `disabled`."
            ),
        );
    }

    /// `disabledByLocalName` indexes disabled functions by the name code
    /// reaches them by: the export, else the name. Go builds it once, after
    /// addFunctions; the disabled set is complete by the routes sweep that
    /// reads it, so it is rebuilt per call here (the set is tiny).
    fn disabled_by_local_name(&self, name: &str) -> Vec<DisabledFunctionMeta> {
        self.state
            .functions
            .disabled
            .as_ref()
            .map(|d| d.iter().filter(|(_, m)| local_name(m) == name).map(|(_, m)| m.clone()).collect())
            .unwrap_or_default()
    }

    /// Whether a node sits in a disabled function's own definition, whose body
    /// is dead too.
    fn is_inside_disabled(&self, node: P<Node>) -> bool {
        let file_name = tsutil::file_name_of(node);
        let mut current = node.parent();
        while let Some(c) = current {
            if ast::is_variable_declaration(c)
                && let Some(name) = c.name().filter(|n| ast::is_identifier(*n))
                && self.disabled_by_local_name(name.text()).iter().any(|m| m.source_file == file_name)
            {
                return true;
            }
            current = c.parent();
        }
        false
    }

    fn resolve_reference_declaration(&mut self, node: P<Node>) -> Option<P<Node>> {
        let parent = node.parent();
        let sym = if parent.is_some_and(ast::is_shorthand_property_assignment) {
            self.checker.get_shorthand_assignment_value_symbol(parent)
        } else {
            self.symbol_at(node)
        };
        let sym = self.resolve_alias(sym)?;
        sym.value_declaration().or_else(|| sym.declarations().first().copied())
    }

    fn disabled_by_name(&self, name: &str) -> Option<DisabledFunctionMeta> {
        self.state.functions.disabled.as_ref()?.iter().find(|(_, m)| m.name == name).map(|(_, m)| m.clone())
    }

    /// `CheckDisabledWorkflowSteps` is PKU562 for workflow steps, which name the
    /// function they call as a string the workflow meta already holds. Runs
    /// once, after the routes sweep.
    pub fn check_disabled_workflow_steps(&mut self) {
        if self.state.functions.disabled.as_ref().is_none_or(|d| d.is_empty()) {
            return;
        }
        let sections: [(&str, Vec<(String, Raw)>); 2] = [
            ("workflow", self.state.workflows.meta.iter().map(|(k, v)| (k.to_string(), v.clone())).collect()),
            ("workflow graph", self.state.workflows.graph_meta.iter().map(|(k, v)| (k.to_string(), v.clone())).collect()),
        ];
        for (kind, entries) in sections {
            for (workflow_name, raw) in entries {
                let Some(decoded) = raw.value() else { continue };
                let mut names = BTreeSet::new();
                collect_rpc_names(decoded, &mut names);
                // sort.Strings is a byte-wise sort, which BTreeSet<String> also is.
                for rpc_name in names {
                    let Some(target) = self.disabled_by_name(&rpc_name) else { continue };
                    let msg = format!(
                        "{}, but {kind} '{workflow_name}' calls it as a step. Remove the step, or remove `disabled`.",
                        self.describe_disabled(&target)
                    );
                    self.log.critical(codes::DISABLED_FUNCTION_REFERENCED, msg);
                }
            }
        }
    }
}

fn collect_rpc_names(value: &serde_json::Value, into: &mut BTreeSet<String>) {
    match value {
        serde_json::Value::Array(items) => items.iter().for_each(|i| collect_rpc_names(i, into)),
        serde_json::Value::Object(map) => {
            for (key, child) in map {
                match child.as_str() {
                    Some(name) if key == "rpcName" => {
                        into.insert(name.to_string());
                    }
                    _ => collect_rpc_names(child, into),
                }
            }
        }
        _ => {}
    }
}

fn check_disabled_references(ctx: &mut Context<'_>, node: P<Node>) {
    if ctx.state.functions.disabled.as_ref().is_none_or(|d| d.is_empty()) {
        return;
    }
    if is_generated_file(node) {
        return;
    }

    if ast::is_call_expression(node) {
        let Some(invoked) = invoked_rpc_name(node) else { return };
        let Some(meta) = ctx.disabled_by_name(&invoked) else { return };
        if ctx.is_inside_disabled(node) {
            return;
        }
        let msg = format!(
            "{}, but {}('{invoked}') calls it at {}. Remove the call, or remove `disabled`.",
            ctx.describe_disabled(&meta),
            tsutil::node_text(node.expression().unwrap()),
            ctx.node_position(node)
        );
        ctx.log.critical(codes::DISABLED_FUNCTION_REFERENCED, msg);
        return;
    }

    if !ast::is_identifier(node) {
        return;
    }
    let candidates = ctx.disabled_by_local_name(node.text());
    if candidates.is_empty() || is_not_a_disabled_reference(node) {
        return;
    }
    let Some(decl) = ctx.resolve_reference_declaration(node) else { return };
    if !ast::is_variable_declaration(decl) || !decl.name().is_some_and(ast::is_identifier) {
        return;
    }
    let decl_file = tsutil::file_name_of(decl);
    let decl_name = decl.name().unwrap().text();
    let Some(meta) = candidates.into_iter().find(|m| m.source_file == decl_file && local_name(m) == decl_name) else {
        return;
    };
    if ctx.is_inside_disabled(node) {
        return;
    }
    let what = match enclosing_callee(node) {
        Some(call) => format!("{call}(...) references it"),
        None => "it is referenced".to_string(),
    };
    let msg = format!(
        "{}, but {what} at {}. Remove the reference, or remove `disabled`.",
        ctx.describe_disabled(&meta),
        ctx.node_position(node)
    );
    ctx.log.critical(codes::DISABLED_FUNCTION_REFERENCED, msg);
}
