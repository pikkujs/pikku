//! Port of Go `finalize/finalize_b.go` (types.go): the type, schema and
//! middleware-group steps of utils/post-process.ts.

use super::jsval::V;
use super::{jv, Options};
use crate::diag::{codes, Level, Logger};
use crate::state::{
    ChannelMiddlewareGroups, FunctionMeta, MiddlewareGroupMeta, MiddlewareGroupsMeta, PermissionsGroupsMeta, Raw, Record, ResolvedIoType, Set, State,
};
use crate::typesmap::TypesMap;

/// `try { typesMap.getUniqueName(name) } catch { name }`.
pub fn unique_name_or(tm: &TypesMap, name: &str) -> String {
    tm.get_unique_name(name).unwrap_or_else(|_| name.to_string())
}

pub fn first(list: &[String]) -> &str {
    list.first().map(String::as_str).unwrap_or("")
}

pub fn compute_resolved_io_types(st: &mut State) {
    let keys: Vec<String> = st.functions.meta.keys().into_iter().map(String::from).collect();
    for id in keys {
        let tm = &st.functions.types_map;
        let meta: &mut FunctionMeta = st.functions.meta.get_mut(&id).unwrap();
        let mut input_type = "null".to_string();
        let mut output_type = "null".to_string();
        if !first(&meta.inputs).is_empty() {
            input_type = unique_name_or(tm, first(&meta.inputs));
        }
        if !first(&meta.outputs).is_empty() {
            output_type = unique_name_or(tm, first(&meta.outputs));
        }
        st.resolved_io_types.set(id.as_str(), ResolvedIoType { input_type: input_type.clone(), output_type: output_type.clone() });

        if meta.input_schema_name.as_deref().is_some_and(|s| !s.is_empty()) && input_type != "null" {
            meta.input_schema_name = Some(input_type.clone());
        }
        if meta.output_schema_name.as_deref().is_some_and(|s| !s.is_empty()) && output_type != "null" {
            meta.output_schema_name = Some(output_type.clone());
        }
        for name in meta.inputs.iter_mut() {
            *name = unique_name_or(tm, name);
        }
        for name in meta.outputs.iter_mut() {
            *name = unique_name_or(tm, name);
        }
    }
}

/// serializeGroupMap's literal, in its key order.
const GROUP_META_KEYS: [&str; 7] = ["exportName", "sourceFile", "position", "services", "count", "instanceIds", "isFactory"];

fn serialize_group_map<'a>(groups: impl Iterator<Item = (&'a str, &'a MiddlewareGroupMeta)>) -> Record<Raw> {
    let mut out = Record::new();
    for (key, g) in groups {
        let input = jv(g);
        let o = V::obj();
        for k in GROUP_META_KEYS {
            if input.has(k) {
                o.set(k, input.get(k));
            }
        }
        let additional = input.get("additionalRegistrations");
        if input.has("additionalRegistrations") && additional.truthy() {
            o.set("additionalRegistrations", additional);
        }
        out.set(key, Raw::of(o.to_json()));
    }
    out
}

fn raw_record<T: serde::Serialize>(r: &Record<T>) -> Record<Raw> {
    let mut out = Record::new();
    for (k, v) in r.iter() {
        out.set(k, Raw::of(serde_json::to_value(v).unwrap()));
    }
    out
}

pub fn compute_middleware_groups_meta(st: &mut State) {
    st.middleware_groups_meta = MiddlewareGroupsMeta {
        definitions: raw_record(&st.middleware.definitions),
        instances: raw_record(&st.middleware.instances),
        http_groups: serialize_group_map(st.http.route_middleware.iter()),
        tag_groups: serialize_group_map(st.middleware.tag_middleware.iter()),
        channel_middleware: ChannelMiddlewareGroups {
            definitions: raw_record(&st.channel_middleware.definitions),
            instances: raw_record(&st.channel_middleware.instances),
            tag_groups: serialize_group_map(st.channel_middleware.tag_middleware.iter()),
        },
    };
}

pub fn compute_permissions_groups_meta(st: &mut State) {
    st.permissions_groups_meta = PermissionsGroupsMeta { definitions: raw_record(&st.permissions.definitions) };
}

pub fn is_primitive_type(s: &str) -> bool {
    matches!(s, "boolean" | "string" | "number" | "null" | "undefined" | "void" | "any" | "unknown" | "never")
}

pub fn compute_required_schemas(st: &mut State, opts: &Options) {
    let tm = &st.functions.types_map;
    let mut required = Set::new();
    for (_, meta) in st.functions.meta.iter() {
        for name in [first(&meta.inputs), first(&meta.outputs)] {
            if name.is_empty() {
                continue;
            }
            let resolved = unique_name_or(tm, name);
            if !resolved.is_empty() && !is_primitive_type(&resolved) {
                required.add(resolved);
            }
        }
    }
    for k in tm.custom_type_keys() {
        required.add(k);
    }
    if let Some(sc) = &opts.schema_config {
        for s in &sc.schemas_from_types {
            required.add(s.clone());
        }
    }
    for k in st.schema_lookup.keys() {
        required.add(k);
    }
    st.required_schemas = required;
}

fn unresolved_schema_references(st: &State) -> Vec<String> {
    let tm = &st.functions.types_map;
    let mut unresolved = Vec::new();
    for (func_name, meta) in st.functions.meta.iter() {
        for (role, declared) in [("input", first(&meta.inputs)), ("output", first(&meta.outputs))] {
            if declared.is_empty() || is_primitive_type(declared) {
                continue;
            }
            let resolved = unique_name_or(tm, declared);
            if is_primitive_type(&resolved) || st.schemas.has(&resolved) {
                continue;
            }
            unresolved.push(format!("{func_name}.{role} \u{2192} '{resolved}'"));
        }
    }
    unresolved
}

pub fn validate_schema_references(log: &mut Logger, st: &State) {
    let unresolved = unresolved_schema_references(st);
    let n = unresolved.len();
    if n == 0 {
        return;
    }
    let plural = |one: &'static str, many: &'static str| if n == 1 { one } else { many };
    log.diagnostic(
        Level::Error,
        codes::SCHEMA_REFERENCE_UNRESOLVED,
        format!(
            "{n} function contract{} name{} a schema that was never generated, so calling {} fails at runtime with MissingSchemaError: {}. The usual cause is a named type used as the function's input/output that is declared but not exported \u{2014} export it, or inline the type at the call site.",
            plural("", "s"),
            plural("s", ""),
            plural("it", "them"),
            unresolved.join(", ")
        ),
    );
}
