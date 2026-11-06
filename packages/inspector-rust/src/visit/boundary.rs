//! Functions that live in Go files owned by other porters but that the core
//! groups call (check_disabled.go, validate.go, addon_resolve.go,
//! group_mcp.go, validate_addon_zod.go). Each is either a faithful port of the
//! (small) Go function or a documented stub; the owner of the Go file replaces
//! it in the same commit that ports the file.

use serde_json::Value;
use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::Context;
use crate::diag::codes;
use crate::state::{DisabledFunctionMeta, FunctionMeta, MCPToolMeta, MCPToolMetaFields};
use crate::tsutil;
use crate::typesmap::TypesMap;

/// Go `addonContractTypeSource` (validate_addon_zod.go).
#[derive(Clone, Debug, Default)]
pub struct AddonContractTypeSource {
    pub name: String,
    pub uses_generics: bool,
    pub has_input_schema: bool,
    pub has_output_schema: bool,
    pub input_names: Vec<String>,
    pub output_names: Vec<String>,
}

/// Go `addonZodContractViolation` (validate_addon_zod.go).
///
/// STUB: always "" (no violation). Needs `findPackageNameForFile`
/// (addon_resolve.go); the addon porter replaces this. It only matters for
/// `isAddon` projects with `remote: true` functions.
pub fn addon_zod_contract_violation(_tm: &TypesMap, _fn: &AddonContractTypeSource) -> String {
    String::new()
}

impl Context<'_> {
    /// Go `resolveAddonName` (addon_resolve.go, utils/resolve-addon-package.ts).
    ///
    /// STUB: "" (Go also answers "" while no addon was loaded, which holds until
    /// `load_addon_functions_meta` / addon_* is ported).
    pub fn resolve_addon_name(&mut self, _ident: P<Node>) -> String {
        String::new()
    }

    /// Go `checkClassification` (check_classification.go): add-functions.ts's
    /// classificationCheck block (PKU953 / PKU954 / PKU910), run under
    /// `pikku all --security`.
    ///
    /// STUB: logs nothing until check_classification.go is ported (it needs the
    /// checker-driven sink and PII scans).
    pub fn check_classification(&mut self, _name: &str, _handler: P<Node>, _sessionless: bool) {}

    /// The package name an addon namespace was wired to (`s.addons[ns].pkg` in Go;
    /// filled by `wireAddon`, group_wire_addon.go).
    ///
    /// STUB: `None` until the wireAddon group is ported.
    pub fn addon_package(&self, _namespace: &str) -> Option<String> {
        None
    }

    /// `resolveFunctionMeta` is utils/resolve-function-meta.ts (addon_resolve.go).
    pub fn resolve_function_meta(&self, id: &str) -> Option<FunctionMeta> {
        if let Some(m) = self.state.functions.meta.get(id) {
            return Some(m.clone());
        }
        let i = id.find(':')?;
        let fns = self.state.addon_functions.get(&id[..i])?;
        fns.get(&id[i + 1..]).cloned()
    }

    /// `validateAuthSessionless` ports utils/validate-auth-sessionless.ts (validate.go).
    pub fn validate_auth_sessionless(&mut self, obj: P<Node>, func_name: &str, wire_description: &str, inherited_auth: Option<bool>) -> bool {
        let Some(fn_meta) = self.resolve_function_meta(func_name) else { return true };
        let resolved_auth = tsutil::get_property_value(obj, "auth").bool.or(inherited_auth);
        if resolved_auth == Some(false) && fn_meta.sessionless == Some(false) {
            self.log.critical(
                codes::AUTH_DISABLED_REQUIRES_SESSIONLESS,
                format!(
                    "{wire_description} has auth disabled but function '{func_name}' uses pikkuFunc (requires session). Use pikkuSessionlessFunc instead."
                ),
            );
            return false;
        }
        true
    }

    /// `readFunctionDisabled` (check_disabled.go) reads a function's `disabled`:
    /// `true`, or a non-empty string saying why. Anything else the build cannot
    /// read is refused rather than taken as enabled. `Some(reason)` when
    /// disabled (the reason may be "").
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

    /// `recordDisabledFunction` (check_disabled.go) records a function declared
    /// `disabled` in place of everything addFunctions would otherwise record.
    /// One defined inline in what uses it is referenced by that, so it is
    /// refused instead.
    pub fn record_disabled_function(&mut self, node: P<Node>, pikku_func_id: &str, meta: DisabledFunctionMeta) {
        if let Some(parent) = node.parent() {
            if ast::is_variable_declaration(parent) && parent.initializer() == Some(node) {
                self.state.functions.disabled.get_or_insert_with(Default::default).set(pikku_func_id, meta);
                return;
            }
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

    /// `addMCPTool` (group_mcp.go) is the `if (mcpEnabled)` branch of
    /// addFunctions. A declared `name` is the label an AI client calls the tool
    /// by; it does not change the pikkuFuncId.
    pub fn add_mcp_tool(&mut self, object_node: Option<P<Node>>, source_file: &str, name: &str, m: &FunctionMeta) {
        let mut tool_name = name.to_string();
        if let Some(o) = object_node {
            if let Some(s) = tsutil::get_property_value(o, "name").str {
                if !s.is_empty() {
                    tool_name = s;
                }
            }
        }
        if m.description.as_deref().unwrap_or("").is_empty() {
            self.log.warn(format!("MCP tool '{tool_name}' is missing a description."));
        }
        self.state.mcp_endpoints.files.add(source_file);
        let mut tool = MCPToolMetaFields {
            pikku_func_id: m.pikku_func_id.clone(),
            name: tool_name.clone(),
            summary: m.summary.clone(),
            errors: m.errors.clone(),
            tags: m.tags.clone().unwrap_or_default(),
            input_schema: m.input_schema_name.clone(),
            output_schema: m.output_schema_name.clone(),
            middleware: m.middleware.clone(),
            ..Default::default()
        };
        if m.title.as_deref().is_some_and(|t| !t.is_empty()) {
            tool.title = m.title.clone();
        }
        if m.description.as_deref().is_some_and(|t| !t.is_empty()) {
            tool.description = m.description.clone();
        }
        self.state.mcp_endpoints.tools_meta.set(tool_name, MCPToolMeta { fields: tool, from_addon: false });
    }
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

#[allow(dead_code)]
fn _v(_: Value) {}
