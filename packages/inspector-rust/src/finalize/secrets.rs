//! Port of Go `finalize/secrets.go`: the secret steps and computeDiagnostics
//! of utils/post-process.ts.

use std::collections::HashSet;

use super::jsval::V;
use super::utils::{js_relative, quote_each};
use super::jv;
use crate::diag::{codes, Level, Logger};
use crate::state::{InspectorDiagnostic, Raw, State};

pub fn validate_no_secret_alias_services(log: &mut Logger, st: &State) {
    let Some(types) = &st.service_types else { return };
    if types.secret_aliases.is_empty() {
        return;
    }
    let aliases = &types.secret_aliases;
    let mut report = |kind: &str, id: &str, services: &[String]| {
        let used: Vec<String> = services.iter().filter(|s| aliases.contains(s)).cloned().collect();
        if used.is_empty() {
            return;
        }
        let verb = if used.len() == 1 { "is" } else { "are" };
        log.critical(
            codes::SECRET_SERVICE_ALIASED,
            format!(
                "{kind} '{id}' receives {}, which {verb} a SecretService under another name. SecretService is confined to pikkuServices, pikkuWireServices, addon service factories and middleware \u{2014} give a service the secret value when you construct it and expose only what the function needs.",
                quote_each(&used).join(", ")
            ),
        );
    };
    for (id, meta) in st.functions.meta.iter() {
        report("Function", id, &meta.services.services);
    }
    for (id, d) in st.permissions.definitions.iter() {
        report("Permission", id, &d.services.services);
    }
}

fn set_defined(o: &V, k: &str, from: &V, src: &str) {
    if from.has(src) {
        o.set(k, from.get(src));
    }
}

/// @pikku/core/secret deriveOAuth2AppSecrets.
fn derive_oauth2_app_secrets(credentials: &[Raw], declared: &[Raw]) -> Vec<Raw> {
    let key_of = |v: &V| if v.is_undef() { String::new() } else { v.stringify().unwrap_or_default() };
    let mut covered: HashSet<String> = HashSet::new();
    for r in declared {
        covered.insert(key_of(&jv(r).get("secretId")));
    }
    let mut derived = Vec::new();
    for r in credentials {
        let cred = jv(r);
        let o = cred.get("oauth2");
        if !o.is_obj() {
            continue;
        }
        let key = key_of(&o.get("appCredentialSecretId"));
        if covered.contains(&key) {
            continue;
        }
        covered.insert(key);

        let display_name = cred.get("displayName").template_string();
        let secret = V::obj();
        secret.set("name", V::str(format!("{}App", cred.get("name").template_string())));
        secret.set("displayName", V::str(format!("{display_name} OAuth App")));
        secret.set("description", V::str(format!("OAuth2 app client id and secret for {display_name}.")));
        set_defined(&secret, "secretId", &o, "appCredentialSecretId");
        secret.set("optional", V::Bool(true));
        set_defined(&secret, "docsUrl", &cred, "docsUrl");
        let oauth2 = V::obj();
        for k in ["tokenSecretId", "authorizationUrl", "tokenUrl", "scopes", "scopeSeparator", "pkce", "additionalParams"] {
            set_defined(&oauth2, k, &o, k);
        }
        secret.set("oauth2", oauth2);
        set_defined(&secret, "sourceFile", &cred, "sourceFile");
        derived.push(Raw::of(secret.to_json()));
    }
    derived
}

pub fn register_derived_oauth2_app_secrets(st: &mut State) {
    let derived = derive_oauth2_app_secrets(&st.credentials.definitions, &st.secrets.definitions);
    st.secrets.definitions.extend(derived);
}

pub fn validate_secret_usage(log: &mut Logger, st: &State) {
    let mut declared: HashSet<String> = HashSet::new();
    for r in &st.secrets.definitions {
        let d = jv(r);
        if let Some(s) = d.get("secretId").as_str() {
            declared.insert(s.to_string());
        }
        let o = d.get("oauth2");
        if o.is_obj() && o.get("tokenSecretId").truthy() {
            declared.insert(o.get("tokenSecretId").template_string());
        }
    }
    if st.auth.definition.is_some() {
        declared.insert("BETTER_AUTH_SECRET".into());
    }

    for (file, usage) in st.secrets.usage.iter() {
        let relative_file = js_relative(&st.root_dir, file);
        let undeclared: Vec<String> = usage.keys.iter().filter(|k| !declared.contains(*k)).cloned().collect();
        if !undeclared.is_empty() {
            log.diagnostic(
                Level::Warn,
                codes::SECRET_NOT_DECLARED,
                format!(
                    "{relative_file} reads {}, which no defineSecret declares. Declare it so it is validated at deploy time and shown to whoever has to provision it.",
                    quote_each(&undeclared).join(", ")
                ),
            );
        }
        if !usage.dynamic.is_empty() {
            log.diagnostic(
                Level::Warn,
                codes::SECRET_KEY_NOT_STATIC,
                format!(
                    "{relative_file} reads a secret with a non-literal key ({}). The deployment cannot narrow its secret scope around a key it cannot see.",
                    usage.dynamic.join(", ")
                ),
            );
        }
    }
}

pub fn compute_diagnostics(st: &mut State) {
    let mut out: Vec<InspectorDiagnostic> = Vec::new();
    let mut add = |code: &str, msg: String, source_file: &str, position: i64| {
        out.push(InspectorDiagnostic { code: code.to_string(), message: msg, source_file: source_file.to_string(), position });
    };

    for (id, meta) in st.functions.meta.iter() {
        if meta.source_file.is_empty() || meta.source_file.ends_with(".gen.ts") || meta.function_type == "inline" || meta.function_type == "helper" {
            continue;
        }
        if !meta.services.optimized {
            add(
                codes::SERVICES_NOT_DESTRUCTURED,
                format!("Function '{id}' does not destructure its services parameter, preventing tree-shaking optimization."),
                &meta.pikku_func_id,
                0,
            );
        }
        if meta.wires.as_ref().is_some_and(|w| !w.optimized) {
            add(
                codes::WIRES_NOT_DESTRUCTURED,
                format!("Function '{id}' does not destructure its wires parameter, preventing tree-shaking optimization."),
                &meta.pikku_func_id,
                0,
            );
        }
        if st.functions.dynamic_import_ids.has(id) {
            add(
                codes::FUNCTION_DYNAMIC_IMPORT,
                format!("Function '{id}' performs a runtime dynamic 'import(...)' in its body. Move the import to the top of the module (static import) or into your services/wireServices setup \u{2014} function bodies run on every invocation, so a dynamic import there adds latency and defeats bundling/tree-shaking."),
                &meta.pikku_func_id,
                0,
            );
        }
    }

    let defs = |kind: &str, defs: &crate::state::Record<crate::state::MiddlewareDefinition>, add: &mut dyn FnMut(&str, String, &str, i64)| {
        for (id, d) in defs.iter() {
            if !d.services.optimized {
                add(
                    codes::SERVICES_NOT_DESTRUCTURED,
                    format!("{kind} '{id}' does not destructure its services parameter, preventing tree-shaking optimization."),
                    &d.source_file,
                    d.position,
                );
            }
            if d.wires.as_ref().is_some_and(|w| !w.optimized) {
                add(
                    codes::WIRES_NOT_DESTRUCTURED,
                    format!("{kind} '{id}' does not destructure its wires parameter, preventing tree-shaking optimization."),
                    &d.source_file,
                    d.position,
                );
            }
        }
    };
    defs("Middleware", &st.middleware.definitions, &mut add);
    defs("Permission", &st.permissions.definitions, &mut add);

    for (file, usage) in st.service_bypass.iter() {
        let relative_file = js_relative(&st.root_dir, file);
        if !usage.content.is_empty() {
            add(
                codes::DIRECT_CONTENT_ACCESS,
                format!(
                    "{relative_file} uses the filesystem directly ({}). Use the `content` service instead: it is keyed, project-scoped, and issues signed reads and writes. Set lint.enforceContentService to 'warn' or 'off' in pikku.config.json to relax this.",
                    describe_bypass(&usage.content)
                ),
                file,
                0,
            );
        }
        if !usage.variables.is_empty() {
            add(
                codes::DIRECT_ENV_ACCESS,
                format!(
                    "{relative_file} reads process.env directly ({}). Use the `variables` service for non-secret values and the `secrets` service for secrets. Set lint.enforceVariablesService to 'warn' or 'off' in pikku.config.json to relax this.",
                    describe_bypass(&usage.variables)
                ),
                file,
                0,
            );
        }
    }

    st.diagnostics = out;
}

/// Renders `line:snippet` entries as `line N snippet`, capped so one file stays
/// one line.
fn describe_bypass(entries: &[String]) -> String {
    let mut shown: Vec<String> = entries
        .iter()
        .take(5)
        .map(|e| {
            let (line, snippet) = e.split_once(':').unwrap_or((e, ""));
            format!("line {line} {snippet}")
        })
        .collect();
    if entries.len() > shown.len() {
        shown.push(format!("and {} more", entries.len() - shown.len()));
    }
    shown.join(", ")
}
