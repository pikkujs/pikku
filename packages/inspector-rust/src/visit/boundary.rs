//! Functions that live in Go files owned by other porters but that the core
//! groups call (group_mcp.go). check_disabled.go, validate.go, addon_resolve.go
//! and validate_addon_zod.go are now ported in their own modules; the zod
//! contract check is re-exported here for the callers that import it from
//! this module.

use tsrs_ast::Node;
use tsrs_core::P;

use super::Context;
use crate::state::{FunctionMeta, MCPToolMeta, MCPToolMetaFields};
use crate::tsutil;

pub use super::validate_addon_zod::{AddonContractTypeSource, addon_zod_contract_violation};

impl Context<'_> {
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

