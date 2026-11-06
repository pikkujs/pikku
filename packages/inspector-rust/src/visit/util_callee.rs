//! Port of Go `visit/util_callee.go`: resolve-callee-name.ts. A helper is
//! identified by what its callee resolves to, not by how it is spelled, so
//! `import { addTagMiddleware as guard }` and `mw.addTagMiddleware(...)` are
//! seen for what they are.

use tsrs_ast::{self as ast, Node, NodeFlags, Symbol, SymbolFlags};
use tsrs_core::P;

use super::Context;

const MAX_CALLEE_DEPTH: usize = 8;

/// Go `middlewareHelpers`.
pub fn is_middleware_helper(name: &str) -> bool {
    matches!(
        name,
        "pikkuMiddleware"
            | "pikkuMiddlewareFactory"
            | "addTagMiddleware"
            | "addGlobalMiddleware"
            | "addHTTPMiddleware"
            | "pikkuChannelMiddleware"
            | "pikkuChannelMiddlewareFactory"
            | "pikkuAgentMiddleware"
            | "addChannelMiddleware"
    )
}

/// Go `permissionHelpers`.
pub fn is_permission_helper(name: &str) -> bool {
    matches!(name, "pikkuPermission" | "pikkuAuth" | "pikkuPermissionFactory" | "addGlobalPermission")
}

/// `unwrapExpression`: parentheses, `as`, `satisfies`, `!` and `<T>` casts.
pub fn unwrap_expression(mut n: P<Node>) -> P<Node> {
    while ast::is_parenthesized_expression(n)
        || crate::tsutil::is_as_expression(n)
        || ast::is_satisfies_expression(n)
        || ast::is_non_null_expression(n)
        || n.kind() == tsrs_ast::Kind::TypeAssertionExpression
    {
        n = n.expression().unwrap();
    }
    n
}

pub fn is_better_auth(name: &str) -> bool {
    name == "betterAuth"
}
pub fn is_pikku_better_auth(name: &str) -> bool {
    name == "pikkuBetterAuth"
}
pub fn is_pikku_func(name: &str) -> bool {
    name == "pikkuFunc"
}

impl Context<'_> {
    /// `isNamespaceReceiver` is true for `mw` in `mw.addTagMiddleware`, when
    /// `mw` is a namespace import or otherwise names a module.
    fn is_namespace_receiver(&mut self, receiver: P<Node>) -> bool {
        if !ast::is_identifier(receiver) {
            return false;
        }
        let Some(sym) = self.symbol_at(receiver) else { return false };
        if sym.declarations().iter().any(|d| ast::is_namespace_import(*d)) {
            return true;
        }
        self.resolve_alias(Some(sym)).is_some_and(|s| s.flags().intersects(SymbolFlags::ValueModule))
    }

    fn follow_callee_symbol(&mut self, sym: Option<P<Symbol>>, mut names: Vec<String>, depth: usize) -> Vec<String> {
        let Some(sym) = sym else { return names };
        if depth > MAX_CALLEE_DEPTH {
            return names;
        }
        let mut target = sym;
        if sym.flags().intersects(SymbolFlags::Alias) {
            if let Some(d) = sym.declarations().first() {
                if ast::is_import_specifier(*d) || ast::is_export_specifier(*d) {
                    names.push(d.property_name_or_name().unwrap().text().to_string());
                }
            }
            target = self.checker.get_aliased_symbol(sym);
            // An import from a module the program cannot resolve: the specifier's
            // own exported name is the only identity there is.
            if target.declarations().is_empty() {
                return names;
            }
            names.push(target.name().to_string());
        }
        if let Some(d) = target.value_declaration() {
            if ast::is_variable_declaration(d)
                && d.initializer().is_some()
                && ast::get_combined_node_flags(d).intersects(NodeFlags::Const)
            {
                names = self.collect_callee_names(Some(d.initializer().unwrap()), names, depth + 1);
            }
        }
        names
    }

    fn collect_callee_names(&mut self, expression: Option<P<Node>>, mut names: Vec<String>, depth: usize) -> Vec<String> {
        let Some(expression) = expression else { return names };
        let callee = unwrap_expression(expression);
        if ast::is_identifier(callee) {
            names.push(callee.text().to_string());
            let sym = self.symbol_at(callee);
            names = self.follow_callee_symbol(sym, names, depth);
        } else if ast::is_property_access_expression(callee)
            && self.is_namespace_receiver(unwrap_expression(callee.expression().unwrap()))
        {
            let name = callee.name().unwrap();
            names.push(name.text().to_string());
            let sym = self.symbol_at(name);
            names = self.follow_callee_symbol(sym, names, depth);
        }
        names
    }

    /// `calleeNames` is every name a callee answers to, from its spelling at
    /// the call site to the declaration it resolves to.
    pub fn callee_names(&mut self, expression: P<Node>) -> Vec<String> {
        self.collect_callee_names(Some(expression), Vec::new(), 0)
    }

    /// `resolveCalleeName` is the pikku helper a call invokes, or "". The
    /// deepest known name wins, because it is the declaration's own. A call
    /// inside the body of a helper's own declaration (the generated `#pikku`
    /// wrappers forwarding to `@pikku/core`) keeps the meaning its literal
    /// spelling gives it.
    pub fn resolve_callee_name(&mut self, call: P<Node>, is_known: &dyn Fn(&str) -> bool) -> String {
        if !ast::is_call_expression(call) {
            return String::new();
        }
        let names = self.callee_names(call.expression().unwrap());
        let Some(resolved) = names.iter().rev().find(|n| is_known(n)).cloned() else { return String::new() };
        let spelled = call.expression().filter(|e| ast::is_identifier(*e)).map(|e| e.text()).unwrap_or("");
        if resolved != spelled && is_inside_declaration_of(call, is_known) {
            if !spelled.is_empty() && is_known(spelled) {
                return spelled.to_string();
            }
            return String::new();
        }
        resolved
    }
}

fn is_inside_declaration_of(node: P<Node>, is_known: &dyn Fn(&str) -> bool) -> bool {
    let mut cur = node.parent();
    while let Some(c) = cur {
        if (ast::is_variable_declaration(c) || ast::is_function_declaration(c))
            && c.name().is_some_and(|n| ast::is_identifier(n) && is_known(n.text()))
        {
            return true;
        }
        cur = c.parent();
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_sets() {
        assert!(is_middleware_helper("addTagMiddleware"));
        assert!(!is_middleware_helper("addTagPermission"));
        assert!(is_permission_helper("pikkuAuth"));
        assert!(is_pikku_func("pikkuFunc") && !is_pikku_func("pikkuSessionlessFunc"));
    }
}
