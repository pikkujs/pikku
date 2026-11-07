//! Port of Go `visit/group_mcp.go`: add/add-mcp-resource.ts (addMCPResource),
//! add/add-mcp-prompt.ts (addMCPPrompt). The MCP tool branch of add-functions.ts
//! (`addMCPTool`) lives in `boundary.rs`.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::group_schedule::or_null;
use super::util_shared::wiring_call;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::{MCPPromptMeta, MCPResourceMeta};
use crate::tsutil::{self, file_name_of};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addMCPResource", phase: Phase::Routes, order: order::ADD_MCP_RESOURCE, visit: |c, n| c.add_mcp_resource(n) });
    r.register(Visitor { name: "addMCPPrompt", phase: Phase::Routes, order: order::ADD_MCP_PROMPT, visit: |c, n| c.add_mcp_prompt(n) });
}

/// `list?.[0] || null`.
fn first_or_nil(list: &[String]) -> Option<String> {
    match list.first() {
        Some(s) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

impl Context<'_> {
    /// The part addMCPResource and addMCPPrompt share: resolve the `func`, its
    /// id (falling back to `mcp:<kind>:<key>` for an inline one) and the addon
    /// it comes from, and make sure it has function metadata.
    fn mcp_endpoint_func(&mut self, obj: P<Node>, kind: &str, label: &str, key: &str) -> Option<(String, String)> {
        let Some(func_init) = self.get_property_assignment_initializer(obj, "func", true) else {
            self.log.critical(codes::MISSING_FUNC, format!("No valid 'func' property for {label} '{}'.", or_null(key)));
            return None;
        };
        let extracted = self.extract_function_name(func_init);
        let mut pikku_func_id = extracted.pikku_func_id;
        if pikku_func_id.starts_with("__temp_") && !key.is_empty() {
            pikku_func_id = format!("mcp:{kind}:{key}");
        }
        let package_name = if ast::is_identifier(func_init) { self.resolve_addon_name(func_init) } else { String::new() };
        self.ensure_function_metadata(&pikku_func_id, key, Some(func_init), extracted.is_helper);
        Some((pikku_func_id, package_name))
    }

    /// Reads the endpoint's input/output schema from its function metadata,
    /// defaulting the function's output to the MCP response type; `None` after
    /// logging when there is none.
    fn mcp_function_schemas(&mut self, pikku_func_id: &str, response_type: &str) -> Option<(Option<String>, Option<String>)> {
        let Some(fm) = self.state.functions.meta.get_mut(pikku_func_id) else {
            self.log.critical(codes::FUNCTION_METADATA_NOT_FOUND, format!("No function metadata found for '{pikku_func_id}'."));
            return None;
        };
        let input = first_or_nil(&fm.inputs);
        let output = first_or_nil(&fm.outputs);
        if fm.output_schema_name.as_deref().is_none_or(|s| s.is_empty()) {
            fm.output_schema_name = Some(response_type.to_string());
            fm.outputs = vec![response_type.to_string()];
        }
        Some((input, output))
    }

    pub fn add_mcp_resource(&mut self, node: P<Node>) {
        let Some(obj) = wiring_call(node, "wireMCPResource") else { return };
        let uri = tsutil::get_property_value(obj, "uri").as_string();
        let title = tsutil::get_property_value(obj, "title").as_string();
        let cm = self.wire_meta_data(obj, "MCP resource", &uri);
        if cm.disabled {
            return;
        }
        let streaming = tsutil::get_property_value(obj, "streaming");
        if streaming.bool == Some(true) {
            self.log.warn(format!("MCP resource '{}' has streaming enabled, but streaming is not yet supported.", or_null(&uri)));
        }
        let Some((pikku_func_id, package_name)) = self.mcp_endpoint_func(obj, "resource", "MCP resource", &uri) else { return };
        if uri.is_empty() {
            self.log.critical(codes::MISSING_URI, "MCP resource is missing the required 'uri' property.");
            return;
        }
        if title.is_empty() {
            self.log.critical(codes::MISSING_TITLE, format!("MCP resource '{uri}' is missing the required 'title' property."));
            return;
        }
        let description = match cm.description.as_deref() {
            Some(d) if !d.is_empty() => d.to_string(),
            _ => {
                self.log.critical(codes::MISSING_DESCRIPTION, format!("MCP resource '{uri}' is missing a description."));
                return;
            }
        };
        let Some((input, output)) = self.mcp_function_schemas(&pikku_func_id, "MCPResourceResponse") else { return };
        let middleware = self.resolve_middleware(obj, cm.tags_or_nil());
        let permissions = self.resolve_permissions(obj);
        self.state.service_aggregation.used_functions.add(pikku_func_id.clone());
        self.add_used_wires(&middleware, &permissions);
        self.state.mcp_endpoints.files.add(file_name_of(node));

        let m = MCPResourceMeta {
            pikku_func_id,
            package_name,
            uri: uri.clone(),
            title,
            description,
            summary: cm.summary.clone(),
            errors: if cm.has_errors { cm.errors.clone() } else { vec![] },
            streaming: streaming.bool,
            tags: if cm.has_tags { cm.tags.clone() } else { vec![] },
            input_schema: input,
            output_schema: output,
            middleware,
        };
        self.state.mcp_endpoints.resources_meta.set(uri, m);
    }

    pub fn add_mcp_prompt(&mut self, node: P<Node>) {
        let Some(obj) = wiring_call(node, "wireMCPPrompt") else { return };
        let name = tsutil::get_property_value(obj, "name").as_string();
        let cm = self.wire_meta_data(obj, "MCP prompt", &name);
        if cm.disabled {
            return;
        }
        let Some((pikku_func_id, package_name)) = self.mcp_endpoint_func(obj, "prompt", "MCP prompt", &name) else { return };
        if name.is_empty() {
            self.log.critical(codes::MISSING_NAME, "MCP prompt is missing the required 'name' property.");
            return;
        }
        let description = match cm.description.as_deref() {
            Some(d) if !d.is_empty() => d.to_string(),
            _ => {
                self.log.critical(codes::MISSING_DESCRIPTION, format!("MCP prompt '{name}' is missing a description."));
                return;
            }
        };
        let Some((input, output)) = self.mcp_function_schemas(&pikku_func_id, "MCPPromptResponse") else { return };
        let middleware = self.resolve_middleware(obj, cm.tags_or_nil());
        let permissions = self.resolve_permissions(obj);
        self.state.service_aggregation.used_functions.add(pikku_func_id.clone());
        self.add_used_wires(&middleware, &permissions);
        self.state.mcp_endpoints.files.add(file_name_of(node));

        let m = MCPPromptMeta {
            pikku_func_id,
            package_name,
            name: name.clone(),
            description,
            summary: cm.summary.clone(),
            errors: if cm.has_errors { cm.errors.clone() } else { vec![] },
            tags: if cm.has_tags { cm.tags.clone() } else { vec![] },
            input_schema: input,
            output_schema: output,
            arguments: vec![],
            middleware,
        };
        self.state.mcp_endpoints.prompts_meta.set(name, m);
    }
}
