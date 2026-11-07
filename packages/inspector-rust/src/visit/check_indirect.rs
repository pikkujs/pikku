//! Port of Go `visit/check_indirect.go` (add/check-indirect-registrations.ts):
//! a middleware or permission helper passed around as a value registers
//! nothing codegen can see, so a gate that never runs is reported instead of
//! generated silently open.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use tsrs_ast::{self as ast, Kind, NodeFlags, SourceFile};
use tsrs_checker::{SignatureKind, TypeFlags};
use tsrs_core::P;

use super::order;
use super::util_callee::{is_inside_declaration_of, is_middleware_helper, is_permission_helper};
use super::{Context, Phase, Registry, Visitor};
use crate::diag::{Level, codes};
use crate::tsutil;
use tsrs_ast::Node;

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "checkIndirectRegistrations",
        phase: Phase::Setup,
        order: order::CHECK_INDIRECT_REGISTRATIONS,
        visit: check_indirect_registrations,
    });
}

fn is_gate_helper(name: &str) -> bool {
    is_middleware_helper(name) || is_permission_helper(name)
}

thread_local! {
    /// Go `Context.gateNames`, keyed by the (arena, never freed) source file.
    static GATE_NAMES: RefCell<HashMap<P<Node>, HashSet<String>>> = RefCell::new(HashMap::new());
}

/// `localGateNames` is the names a file can reach a gate helper by: its own,
/// and its import aliases.
fn local_gate_names(sf: P<SourceFile>, name: &str) -> bool {
    let key = sf.as_node();
    GATE_NAMES.with(|c| {
        let mut c = c.borrow_mut();
        let names = c.entry(key).or_insert_with(|| {
            let mut names = HashSet::new();
            for st in sf.statements().nodes() {
                if !ast::is_import_declaration(*st) {
                    continue;
                }
                let Some(clause) = st.as_import_declaration().import_clause() else { continue };
                let Some(bindings) = clause.as_import_clause().named_bindings() else { continue };
                if !ast::is_named_imports(bindings) {
                    continue;
                }
                for el in bindings.as_named_imports().elements().nodes() {
                    if is_gate_helper(el.property_name_or_name().unwrap().text()) {
                        names.insert(el.name().unwrap().text().to_string());
                    }
                }
            }
            names
        });
        names.contains(name)
    })
}

/// `isAccountedFor` is whether a reference sits where the inspector already
/// sees it: called directly, imported or re-exported, bound to another const
/// name, named as a declaration, or used as a type.
fn is_accounted_for(reference: P<Node>) -> bool {
    let Some(parent) = reference.parent() else { return true };
    if ast::is_call_expression(parent) && parent.expression() == Some(reference) {
        return true;
    }
    if ast::is_import_specifier(parent)
        || ast::is_export_specifier(parent)
        || ast::is_import_clause(parent)
        || ast::is_namespace_import(parent)
        || ast::is_export_assignment(parent)
        || ast::is_qualified_name(parent)
        || ast::is_type_node(parent)
        || ast::is_expression_with_type_arguments(parent)
    {
        return true;
    }
    if ast::is_variable_declaration(parent)
        && parent.initializer() == Some(reference)
        && ast::get_combined_node_flags(parent).intersects(NodeFlags::Const)
    {
        return true;
    }
    if parent.name() == Some(reference) {
        return true;
    }
    is_inside_declaration_of(reference, &is_gate_helper)
}

fn check_indirect_registrations(ctx: &mut Context<'_>, node: P<Node>) {
    if !ast::is_identifier(node) {
        return;
    }
    let Some(sf) = ast::get_source_file_of_node(node) else { return };
    if sf.is_declaration_file() {
        return;
    }
    let name = node.text();
    if !is_gate_helper(name) && !local_gate_names(sf, name) {
        return;
    }

    let mut reference = node;
    let parent = node.parent().unwrap();
    if ast::is_property_access_expression(parent) {
        if parent.name() != Some(node) || !ctx.is_namespace_receiver(parent.expression().unwrap()) {
            return;
        }
        reference = parent;
    }
    if is_accounted_for(reference) {
        return;
    }

    let names = ctx.callee_names(reference);
    let Some(helper) = names.iter().rev().find(|n| is_gate_helper(n)).cloned() else { return };

    if let Some(sym) = ctx.symbol_at(node)
        && let Some(vd) = sym.value_declaration()
        && vd.kind() == Kind::Parameter
    {
        return;
    }
    let t = ctx.checker.get_type_at_location(reference);
    if ctx.checker.get_signatures_of_type_exported(t, SignatureKind::Call).is_empty() && !t.flags().intersects(TypeFlags::Any) {
        return;
    }

    let line = tsrs_scanner::get_ecma_line_of_position(sf.get(), tsutil::node_start(node) as u32) + 1;
    let msg = format!(
        "'{}' ({helper}) is used as a value at {}:{line}. The inspector records middleware and permissions only where {helper} is called directly, so whatever this registers is never imported by the generated code and does not run. Call {helper}(...) directly.",
        tsutil::node_text(reference),
        sf.file_name()
    );
    ctx.log.diagnostic(Level::Error, codes::REGISTRATION_NOT_A_DIRECT_CALL, msg);
}
