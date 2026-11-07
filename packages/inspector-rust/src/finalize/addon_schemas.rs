//! Port of Go `finalize/addon_schemas.go` (load-addon-functions-meta.ts
//! loadAddonSchemas): each local addon's generated
//! `schemas/schemas/*.schema.json` is merged into state.schemas, without
//! overwriting a schema the project already has.

use super::jsval::V;
use super::resolve::resolve_addon_file;
use super::utils::{clean, dir_of, path_join};
use super::jv;
use crate::state::{Raw, State};

pub fn load_addon_schemas(st: &mut State) {
    if st.rpc.wire_addon_declarations.is_empty() {
        return;
    }
    let decls: Vec<V> = st.rpc.wire_addon_declarations.iter().map(|(_, r)| jv(r)).collect();
    for decl in decls {
        if decl.get("remote").truthy() {
            continue;
        }
        let pkg = decl.get("package").as_str().unwrap_or("").to_string();
        let file = decl.get("file").as_str().unwrap_or("").to_string();
        let meta_path = resolve_addon_file(
            &st.root_dir,
            if file.is_empty() { None } else { Some(file.as_str()) },
            &format!("{pkg}/.pikku/function/pikku-functions-meta.gen.json"),
        );
        if meta_path.is_empty() {
            continue;
        }
        let schemas_dir = clean(&path_join(&[&dir_of(&meta_path), "..", "schemas", "schemas"]));
        let Ok(rd) = std::fs::read_dir(&schemas_dir) else { continue };
        let mut names: Vec<String> = rd.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_string()).collect();
        names.sort();
        for file in names {
            if !file.ends_with(".schema.json") {
                continue;
            }
            let name = file.replacen(".schema.json", "", 1);
            if let Some(existing) = st.schemas.get(&name) {
                let truthy = match existing.value() {
                    Some(v) => V::from_json(v).truthy(),
                    None => false,
                };
                if truthy {
                    continue;
                }
            }
            let Ok(b) = std::fs::read(path_join(&[&schemas_dir, &file])) else { break };
            let Ok(v) = serde_json::from_slice::<serde_json::Value>(&b) else { break };
            st.schemas.set(name.as_str(), Raw::of(V::from_json(&v).to_json()));
        }
    }
}
