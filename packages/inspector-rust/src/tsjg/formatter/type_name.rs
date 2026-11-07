//! Port of Go `tsjg/formatter/type_name.go`.

use serde_json::Value;

/// The JSON type name of a JS value.
pub fn type_name(value: &Value) -> String {
    match value {
        Value::Null => "null",
        Value::String(_) => "string",
        Value::Number(_) => "number",
        Value::Bool(_) => "boolean",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
    .to_string()
}

/// Unwraps the slice if it contains only one type name (src/TypeFormatter/EnumTypeFormatter.ts).
pub fn to_enum_type(names: &[String]) -> Value {
    if names.len() == 1 {
        return Value::String(names[0].clone());
    }
    Value::Array(names.iter().cloned().map(Value::String).collect())
}
