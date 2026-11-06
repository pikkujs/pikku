//! Port of Go `visit/group_functions_node.go`: the node half of add-functions.ts.
//! A function's `node: { displayName, category, type, errorOutput }` config
//! becomes a state.nodes.meta entry.

use serde_json::Value;
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::Context;
use super::util_shared::{JsObject, strs_value};
use crate::diag::codes;
use crate::state::FunctionMeta;
use crate::tsutil;

#[derive(Clone, Debug, Default)]
pub struct NodeConfig {
    pub display_name: String,
    pub category: String,
    pub node_type: String,
    pub error_output: Option<bool>,
}

impl Context<'_> {
    /// `readNodeConfig` reads the first `node: { ... }` object literal property
    /// and reports what it is missing. `None` when there is no such property.
    pub fn read_node_config(&mut self, obj: P<Node>, name: &str) -> Option<NodeConfig> {
        for p in obj.properties() {
            if !ast::is_property_assignment(*p)
                || !p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == "node")
                || !ast::is_object_literal_expression(p.initializer().unwrap())
            {
                continue;
            }
            let node_obj = p.initializer().unwrap();
            let cfg = NodeConfig {
                display_name: tsutil::get_property_value(node_obj, "displayName").as_string(),
                category: tsutil::get_property_value(node_obj, "category").as_string(),
                node_type: tsutil::get_property_value(node_obj, "type").as_string(),
                error_output: tsutil::get_property_value(node_obj, "errorOutput").bool,
            };
            if cfg.display_name.is_empty() {
                self.log.critical(codes::MISSING_NAME, format!("Function '{name}' node config is missing the required 'displayName' property."));
            }
            if cfg.category.is_empty() {
                self.log.critical(codes::MISSING_NAME, format!("Function '{name}' node config is missing the required 'category' property."));
            }
            match cfg.node_type.as_str() {
                "" => self.log.critical(codes::MISSING_NAME, format!("Function '{name}' node config is missing the required 'type' property.")),
                "trigger" | "action" | "end" => {}
                other => self.log.critical(
                    codes::INVALID_VALUE,
                    format!("Function '{name}' node config has invalid type '{other}'. Must be 'trigger', 'action', or 'end'."),
                ),
            }
            return Some(cfg);
        }
        None
    }

    /// `addNodeMeta` records the node when its config is complete. An invalid
    /// type is still recorded, as in TS: only the critical above flags it.
    pub fn add_node_meta(&mut self, cfg: &NodeConfig, file: &str, pikku_func_id: &str, m: &FunctionMeta) {
        if cfg.display_name.is_empty() || cfg.category.is_empty() || cfg.node_type.is_empty() {
            return;
        }
        self.state.nodes.files.add(file);
        let mut o = JsObject::new();
        o.set_str("name", pikku_func_id);
        o.set_str("displayName", &cfg.display_name);
        o.set_str("category", &cfg.category);
        o.set_str("type", &cfg.node_type);
        o.set_str("rpc", pikku_func_id);
        if let Some(d) = &m.description {
            o.set_str("description", d);
        }
        o.set("errorOutput", Some(Value::from(cfg.error_output == Some(true))));
        // Go passes the *string through an `any`: a nil pointer is not an untyped
        // nil, so it is written as null rather than dropped.
        o.set("inputSchemaName", Some(m.input_schema_name.as_deref().map(Value::from).unwrap_or(Value::Null)));
        o.set("outputSchemaName", Some(m.output_schema_name.as_deref().map(Value::from).unwrap_or(Value::Null)));
        if let Some(t) = &m.tags {
            o.set("tags", Some(strs_value(t)));
        }
        self.state.nodes.meta.set(pikku_func_id, o.raw());
    }
}
