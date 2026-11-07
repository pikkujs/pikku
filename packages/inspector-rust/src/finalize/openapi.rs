//! Port of Go `finalize/openapi.go` (utils/serialize-openapi-json.ts
//! generateOpenAPISpec).

use std::collections::HashSet;

use super::jsval::{number_string, V};
use super::openapi_convert::convert_schema_to_openapi;
use crate::diag::Logger;
use crate::state::{Raw, State};

fn is_primitive_schema_name(s: &str) -> bool {
    matches!(s, "boolean" | "string" | "number")
}

/// `routeParamRe.ReplaceAllString(route, "{$1}")` for `:(\w+)`.
fn replace_route_params(route: &str) -> String {
    let c: Vec<char> = route.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if c[i] == ':' {
            let mut j = i + 1;
            while j < c.len() && (c[j].is_ascii_alphanumeric() || c[j] == '_') {
                j += 1;
            }
            if j > i + 1 {
                out.push('{');
                out.extend(&c[i + 1..j]);
                out.push('}');
                i = j;
                continue;
            }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// Builds state.openAPISpec from options.openAPI (`{ additionalInfo, errors }`).
pub fn generate_openapi_spec(log: &mut Logger, st: &mut State, open_api: &serde_json::Value) -> Result<(), String> {
    let opts = V::from_json(open_api);
    let info = opts.get("additionalInfo");
    if !info.is_obj() {
        return Err("TypeError: Cannot read properties of undefined (reading 'info')".to_string());
    }
    // pikkuState(null, 'misc', 'errors') entries: { name, status, message }.
    let mut registry: Vec<(String, f64, V)> = Vec::new();
    let errors = opts.get("errors");
    if !errors.nullish() {
        if !errors.is_arr() {
            return Err("openAPI.errors: json: cannot unmarshal into Go value of type []finalize.OpenAPIError".to_string());
        }
        for e in errors.items() {
            registry.push((
                e.get("name").as_str().unwrap_or("").to_string(),
                e.get("status").as_f64().unwrap_or(0.0),
                e.get("message"),
            ));
        }
    }

    let paths = V::obj();
    for (_, routes) in st.http.meta.iter() {
        for (_, meta) in routes.iter() {
            let Some(func) = st.functions.meta.get(&meta.pikku_func_id) else {
                log.error(format!("\u{2022} No function metadata found for '{}' in route '{}'.", meta.pikku_func_id, meta.route));
                continue;
            };
            let output = func.outputs.first().cloned();
            let path = replace_route_params(&meta.route);
            if !paths.get(&path).truthy() {
                paths.set(&path, V::obj());
            }

            let responses = V::obj();
            for e in &meta.errors {
                if let Some((_, status, message)) = registry.iter().find(|(n, _, _)| n == e) {
                    responses.set(&number_string(*status), V::of(vec![("description", message.clone())]));
                }
            }
            let mut content = V::Undef;
            if let Some(name) = output.as_deref().filter(|n| !n.is_empty()) {
                let schema = if is_primitive_schema_name(name) {
                    V::of(vec![("type", V::str(name))])
                } else {
                    V::of(vec![("$ref", V::str(format!("#/components/schemas/{name}")))])
                };
                content = V::of(vec![("application/json", V::of(vec![("schema", schema)]))]);
            }
            responses.set("200", V::of(vec![("description", V::str("Successful response")), ("content", content)]));

            let mut description = meta.description.clone().unwrap_or_default();
            if description.is_empty() {
                description = format!("This endpoint handles the {} request for the route {}.", meta.method.to_uppercase(), meta.route);
            }
            let tags: Vec<V> = match &meta.tags {
                Some(t) => t.iter().map(V::str).collect(),
                None => {
                    let parts: Vec<&str> = meta.route.split('/').collect();
                    let mut seg = if parts.len() > 1 { parts[1] } else { "" };
                    if seg.is_empty() {
                        seg = "default";
                    }
                    vec![V::str(seg)]
                }
            };
            let mut parameters = Vec::new();
            for p in &meta.params {
                parameters.push(V::of(vec![
                    ("name", V::str(p)),
                    ("in", V::str("path")),
                    ("required", V::Bool(true)),
                    ("schema", V::of(vec![("type", V::str("string"))])),
                ]));
            }
            for q in &meta.query {
                parameters.push(V::of(vec![
                    ("name", V::str(q)),
                    ("in", V::str("query")),
                    ("required", V::Bool(false)),
                    ("schema", V::of(vec![("type", V::str("string"))])),
                ]));
            }
            let operation = V::of(vec![
                ("description", V::str(description)),
                ("tags", V::arr(tags)),
                ("parameters", V::arr(parameters)),
                ("responses", responses),
            ]);
            paths.get(&path).set(&meta.method, operation);
        }
    }

    let schemas = convert_schemas_to_body_payloads(st)?;
    let mut security_schemes = info.get("securitySchemes");
    if !security_schemes.truthy() {
        security_schemes = V::of(vec![
            ("ApiKeyAuth", V::of(vec![("type", V::str("apiKey")), ("in", V::str("header")), ("name", V::str("x-api-key"))])),
            ("BearerAuth", V::of(vec![("type", V::str("http")), ("scheme", V::str("bearer"))])),
        ]);
    }
    let mut security = info.get("security");
    if !security.truthy() {
        security = V::arr(vec![
            V::of(vec![("ApiKeyAuth", V::arr(vec![]))]),
            V::of(vec![("BearerAuth", V::arr(vec![]))]),
        ]);
    }
    let spec = V::of(vec![
        ("openapi", V::str("3.1.0")),
        ("info", info.get("info")),
        ("servers", info.get("servers")),
        ("paths", paths),
        (
            "components",
            V::of(vec![
                ("schemas", schemas),
                ("responses", V::obj()),
                ("parameters", V::obj()),
                ("examples", V::obj()),
                ("requestBodies", V::obj()),
                ("headers", V::obj()),
                ("securitySchemes", security_schemes),
            ]),
        ),
        ("security", security),
        ("tags", info.get("tags")),
        ("externalDocs", info.get("externalDocs")),
    ]);
    spec.stringify()?;
    st.open_api_spec = Raw::of(spec.to_json());
    Ok(())
}

/// Converts every schema a route's output names. (Request bodies would add
/// inputTypes.body, which http meta never carries.)
fn convert_schemas_to_body_payloads(st: &State) -> Result<V, String> {
    let mut required: HashSet<String> = HashSet::new();
    for (_, routes) in st.http.meta.iter() {
        for (_, meta) in routes.iter() {
            if let Some(f) = st.functions.meta.get(&meta.pikku_func_id) {
                if let Some(o) = f.outputs.first().filter(|o| !o.is_empty()) {
                    required.insert(o.clone());
                }
            }
        }
    }
    let out = V::obj();
    for (key, raw) in st.schemas.iter() {
        if !required.contains(key) {
            continue;
        }
        let schema = match raw.value() {
            Some(j) => V::from_json(j),
            None => V::Null,
        };
        let converted = convert_schema_to_openapi(&schema).map_err(|e| format!("converting schema '{key}' to OpenAPI: {e}"))?;
        out.set(key, converted);
    }
    Ok(out)
}
