//! Port of Go `visit/util_wire_meta.go`.

use serde_json::Value;
use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::Context;
use super::util_props::CommonMeta;
use super::util_shared::{JsObject, strs_value};
use crate::diag::codes;
use crate::state::WireRef;
use crate::tsutil::PropValue;

impl Context<'_> {
    /// `wireMetaData` is getCommonWireMetaData with its logger: the metadata
    /// plus the diagnostics TS reports for a non-literal name and for tags /
    /// errors that are not arrays. `wiring_name` is "" for TS's null.
    pub fn wire_meta_data(&mut self, obj: P<Node>, wiring_type: &str, wiring_name: &str) -> CommonMeta {
        self.assert_string_literal_property(obj, "name", wiring_type);
        let shown = if wiring_name.is_empty() { "null" } else { wiring_name };
        for p in obj.properties() {
            if !ast::is_property_assignment(*p)
                || !p.name().is_some_and(ast::is_identifier)
                || ast::is_array_literal_expression(p.initializer().unwrap())
            {
                continue;
            }
            match p.name().unwrap().text() {
                "tags" => self.log.critical(
                    codes::INVALID_TAGS_TYPE,
                    format!("{wiring_type} '{shown}' has invalid 'tags' property - must be an array of strings."),
                ),
                "errors" => self.log.critical(
                    codes::INVALID_TAGS_TYPE,
                    format!("{wiring_type} '{shown}' has invalid 'errors' property - must be an array of error identifiers."),
                ),
                _ => {}
            }
        }
        self.get_common_wire_meta_data(obj)
    }

    /// `wiringFuncId` is extractFunctionName plus the context-based id TS gives
    /// an inline function. Returns `(id, isHelper)`.
    pub fn wiring_func_id(&mut self, func_init: P<Node>, wiring_type: &str, name: &str) -> (String, bool) {
        let extracted = self.extract_function_name(func_init);
        let mut id = extracted.pikku_func_id;
        if super::util_channel_cli::is_temp_id(&id) && !name.is_empty() {
            id = super::util_channel_cli::make_context_based_id(wiring_type, &[name]);
        }
        (id, extracted.is_helper)
    }
}

impl JsObject {
    /// `setCommon` writes summary, description, errors and tags the way the
    /// wiring meta literals spread them (undefined members dropped).
    pub fn set_common(&mut self, cm: &CommonMeta) {
        self.set("summary", cm.summary.as_deref().map(Value::from));
        self.set("description", cm.description.as_deref().map(Value::from));
        if cm.has_errors {
            self.set("errors", Some(strs_value(&cm.errors)));
        }
        if cm.has_tags {
            self.set("tags", Some(strs_value(&cm.tags)));
        }
    }
}

/// `propValue` is getPropertyValue's result as a JSON value (`None` for null).
pub fn prop_value(v: &PropValue) -> Option<Value> {
    if !v.present {
        return None;
    }
    if let Some(s) = &v.str {
        return Some(Value::from(s.as_str()));
    }
    if let Some(n) = v.num {
        return Some(num_value(n));
    }
    if let Some(b) = v.bool {
        return Some(Value::from(b));
    }
    v.strs.as_ref().map(|s| strs_value(s))
}

/// A JS number as a JSON value: integers stay integers.
pub fn num_value(n: f64) -> Value {
    if n.is_finite() && n == n.trunc() && n.abs() < 9e15 {
        Value::from(n as i64)
    } else {
        serde_json::Number::from_f64(n).map(Value::Number).unwrap_or(Value::Null)
    }
}

/// `middlewareValue` is the middleware member: undefined when there is none.
pub fn middleware_value(m: &[WireRef]) -> Option<Value> {
    if m.is_empty() {
        None
    } else {
        Some(serde_json::to_value(m).expect("WireRef serialises"))
    }
}
