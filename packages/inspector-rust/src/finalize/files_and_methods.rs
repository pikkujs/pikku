//! Port of Go `finalize/files_and_methods.go` (utils/get-files-and-methods.ts).

use super::jsval::V;
use crate::state::{Map, PathToNameAndType, Raw, Record, State};

fn get_meta_types(
    typ: &str,
    m: &PathToNameAndType,
    desired: &str,
    errs: Option<&mut Map<PathToNameAndType>>,
) -> Result<Option<Raw>, String> {
    if !desired.is_empty() {
        for file in m.keys() {
            for e in m.get(file).unwrap() {
                if e.ty.as_deref() != Some(desired) {
                    continue;
                }
                let Some(type_path) = &e.type_path else {
                    return Err(format!("Unknown state due to metaType calculation: entryType or typePath is null for {desired} in {file}"));
                };
                return Ok(Some(Raw::of(
                    V::of(vec![
                        ("file", V::str(file)),
                        ("variable", V::str(&e.variable)),
                        ("type", V::str(e.ty.as_deref().unwrap())),
                        ("typePath", V::str(type_path)),
                    ])
                    .to_json(),
                )));
            }
        }
        if let Some(errs) = errs {
            errs.set(format!("No {typ} found that extends {desired}"), m.clone());
        }
        return Ok(None);
    }

    let total: usize = m.iter().map(|(_, v)| v.len()).sum();
    match total {
        0 => {
            let mut msg = format!("No {typ} found");
            if typ == "CoreConfig" {
                msg = format!(
                    "No {typ} found. Make sure you have exported a createConfig function in your codebase:\n\nexport const createConfig = pikkuConfig(async () => {{\n  return {{}}\n}})\n\nPossible issues:\n- srcDirectories in pikku.config.json doesn't include the file with the createConfig method"
                );
            }
            if let Some(errs) = errs {
                errs.set(msg, m.clone());
            }
        }
        1 => {
            let Some(file) = m.keys().next() else { return Ok(None) };
            let entries = m.get(file).unwrap();
            let Some(e) = entries.first() else {
                return Err(format!("Cannot destructure an empty entry list for {typ} in {file}"));
            };
            let (Some(ty), Some(type_path)) = (&e.ty, &e.type_path) else {
                return Err(format!("Unknown state due to metaType calculation: entryType or typePath is null for {typ} in {file}"));
            };
            return Ok(Some(Raw::of(
                V::of(vec![("file", V::str(file)), ("type", V::str(ty)), ("variable", V::str(&e.variable)), ("typePath", V::str(type_path))]).to_json(),
            )));
        }
        _ => {
            if let Some(errs) = errs {
                errs.set(format!("More than one {typ} found"), m.clone());
            }
        }
    }
    Ok(None)
}

/// Writes state.filesAndMethods / filesAndMethodsErrors.
pub fn get_files_and_methods(st: &mut State, types: Option<&serde_json::Value>) -> Result<(), String> {
    let get = |k: &str| -> Result<String, String> {
        match types {
            None | Some(serde_json::Value::Null) => Ok(String::new()),
            Some(serde_json::Value::Object(o)) => match o.get(k) {
                None | Some(serde_json::Value::Null) => Ok(String::new()),
                Some(serde_json::Value::String(s)) => Ok(s.clone()),
                Some(_) => Err(format!("types: json: cannot unmarshal into Go struct field TypesOptions.{k} of type string")),
            },
            Some(_) => Err("types: json: cannot unmarshal into Go value of type finalize.TypesOptions".to_string()),
        }
    };
    let config_file_type = get("configFileType")?;
    let user_session_type = get("userSessionType")?;
    let singleton_factory_type = get("singletonServicesFactoryType")?;
    let wire_factory_type = get("wireServicesFactoryType")?;

    let mut errs: Map<PathToNameAndType> = Map::new();
    let mut result: Record<Raw> = Record::new();
    let specs: [(&str, &str, &str, &PathToNameAndType, bool); 8] = [
        ("userSessionType", "CoreUserSession", &user_session_type, &st.user_session_type_import_map, false),
        ("singletonServicesType", "CoreSingletonServices", "", &st.singleton_services_type_import_map, false),
        ("wireServicesType", "CoreServices", "", &st.wire_services_type_import_map, false),
        ("pikkuConfigType", "CoreConfig", "", &st.config_type_import_map, false),
        ("pikkuConfigFactory", "CoreConfig", &config_file_type, &st.config_factories, false),
        ("singletonServicesFactory", "CreateSingletonServices", &singleton_factory_type, &st.singleton_services_factories, false),
        ("wireServicesFactory", "CreateWireServices", &wire_factory_type, &st.wire_services_factories, false),
        ("serverLifecycleFactory", "ServerLifecycle", "", &st.server_lifecycle_factories, true),
    ];
    for (key, typ, desired, m, no_errors) in specs {
        let meta = get_meta_types(typ, m, desired, if no_errors { None } else { Some(&mut errs) })?;
        if let Some(meta) = meta {
            result.set(key, meta);
        }
    }
    st.files_and_methods = result;
    st.files_and_methods_errors = errs;
    Ok(())
}
