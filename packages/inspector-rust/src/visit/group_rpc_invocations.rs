//! Port of Go `visit/group_rpc_invocations.go`: add/add-rpc-invocations.ts.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::{Map, Set};
use crate::tsutil::{self, file_name_of, node_text};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addRPCInvocations",
        phase: Phase::Setup,
        order: order::ADD_RPC_INVOCATIONS,
        visit: |c, n| c.visit_rpc_invocations(n),
    });
}

impl Context<'_> {
    /// `visitRPCInvocations` ports add/add-rpc-invocations.ts addRPCInvocations.
    pub fn visit_rpc_invocations(&mut self, node: P<Node>) {
        if !ast::is_call_expression(node) {
            return;
        }
        let expr = node.expression().unwrap();
        let args = node.arguments();
        let first = args.first().copied();

        if ast::is_identifier(expr) {
            match expr.text() {
                "ref" => {
                    if let Some(f) = first.filter(|f| ast::is_string_literal(*f)) {
                        let r = f.text();
                        self.state.rpc.invoked_functions.add(r);
                        if let Some(ns) = rpc_namespace(r) {
                            self.state.rpc.used_addons.add(ns);
                        }
                    }
                }
                "workflow" | "workflowStart" | "workflowRun" | "workflowStatus" | "graphStart" => {
                    if let Some(f) = first.filter(|f| ast::is_string_literal(*f)) {
                        self.state.workflows.invoked_workflows.add(f.text());
                    }
                }
                _ => {}
            }
        }

        // rpc.startWorkflow('...'), workflowService.startWorkflow('...') and
        // workflowService.runToCompletion('...') start a workflow by name.
        if ast::is_property_access_expression(expr) {
            match expr.name().unwrap().text() {
                "startWorkflow" | "runToCompletion" => {
                    if let Some(f) = first.filter(|f| ast::is_string_literal(*f) || ast::is_no_substitution_template_literal(*f)) {
                        self.state.workflows.invoked_workflows.add(f.text());
                    }
                }
                _ => {}
            }
        }

        if is_agent_invocation(expr) {
            if let Some(f) = first {
                if ast::is_string_literal(f) {
                    let file = file_name_of(node);
                    add_to_file_set(&mut self.state.agents.invoked_agents_by_file, file, f.text());
                } else if ast::is_template_expression(f) || ast::is_no_substitution_template_literal(f) {
                    self.log.warn(format!("• Found dynamic agent invocation: {}", node_text(f)));
                    self.log.warn("\tYou can only use string literals for agent names, with ' or \" and not `");
                }
            }
        }

        if !ast::is_property_access_expression(expr) || expr.name().unwrap().text() != "invoke" {
            return;
        }
        let recv = tsutil::unwrap_non_null_parens(expr.expression().unwrap());
        if !ast::is_identifier(recv) || recv.text() != "rpc" {
            return;
        }
        let file = file_name_of(node);
        if !file.ends_with(".gen.ts") && !file.ends_with(".gen.js") {
            if has_type_cast(outer_parent(node)) {
                self.log.critical(
                    codes::RPC_INVOCATION_TYPE_CAST,
                    "rpc.invoke() result is type-cast — remove the 'as' expression and rely on Pikku's generated types",
                );
            }
            for a in args {
                if has_type_cast(Some(*a)) {
                    self.log.critical(
                        codes::RPC_INVOCATION_TYPE_CAST,
                        "rpc.invoke() has a type cast on an argument — remove the 'as' expression and rely on Pikku's generated types",
                    );
                    break;
                }
            }
        }
        let Some(first) = first else { return };
        if ast::is_string_literal(first) || ast::is_no_substitution_template_literal(first) {
            let r = first.text();
            self.state.rpc.invoked_functions.add(r);
            add_to_file_set(&mut self.state.rpc.invoked_functions_by_file, file, r);
            if let Some(ns) = rpc_namespace(r) {
                self.state.rpc.used_addons.add(ns);
                self.state.service_aggregation.used_functions.add(r);
            }
        } else if ast::is_template_expression(first) {
            self.log.warn(format!("• Found dynamic RPC invocation: {}", node_text(first)));
            self.log.warn("\tYou can only use literal RPC function names, without ${...} substitutions");
        }
    }
}

fn add_to_file_set(m: &mut Map<Set>, file: &str, v: &str) {
    if !m.has(file) {
        m.set(file, Set::new());
    }
    m.get_mut(file).unwrap().add(v);
}

fn rpc_namespace(r: &str) -> Option<&str> {
    r.find(':').map(|i| &r[..i])
}

fn has_type_cast(n: Option<P<Node>>) -> bool {
    n.is_some_and(|n| tsutil::is_as_expression(n) || n.kind() == ast::Kind::TypeAssertionExpression)
}

fn outer_parent(n: P<Node>) -> Option<P<Node>> {
    let mut p = n.parent();
    while let Some(x) = p {
        if ast::is_await_expression(x) || ast::is_parenthesized_expression(x) {
            p = x.parent();
        } else {
            break;
        }
    }
    p
}

/// `isAgentInvocation` is agentInvocationName != null: runAgent / streamAgent,
/// or rpc.agent.run / rpc.agent.stream through `!` and parentheses.
fn is_agent_invocation(expr: P<Node>) -> bool {
    if ast::is_identifier(expr) {
        return expr.text() == "runAgent" || expr.text() == "streamAgent";
    }
    if !ast::is_property_access_expression(expr) {
        return false;
    }
    let m = expr.name().unwrap().text();
    if m != "run" && m != "stream" {
        return false;
    }
    let agent = tsutil::unwrap_non_null_parens(expr.expression().unwrap());
    if !ast::is_property_access_expression(agent) || agent.name().unwrap().text() != "agent" {
        return false;
    }
    tsutil::is_rpc_expr(agent.expression().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn namespaces() {
        assert_eq!(rpc_namespace("stripe:charge"), Some("stripe"));
        assert_eq!(rpc_namespace("charge"), None);
    }
}
