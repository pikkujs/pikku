//! Port of Go `visit/scope_addon.go`: the scopes part of
//! load-addon-functions-meta.ts. An addon's own scope trees join the host's
//! definitions, unless the host already defines one by that name, with an
//! origin naming the package the host installed it as.


use super::addon_json::{OJson, ojson_of_raw, parse_ojson};
use super::addon_load::{AddonDecl, Loader};
use super::addon_resolve::resolve_package_subpath;

impl Loader<'_> {
    pub(crate) fn load_addon_scopes(&mut self, decl: &AddonDecl, dir: &str) {
        let Some(path) = resolve_package_subpath(dir, &decl.pkg, ".pikku/scopes/pikku-scopes-meta.gen.json") else {
            return;
        };
        let Ok(bytes) = std::fs::read(path) else { return };
        let Ok(OJson::Obj(meta)) = parse_ojson(&bytes) else { return };
        for (key, def_raw) in meta.iter() {
            // Go decodes `{ name }` out of every existing definition for the check.
            let exists = self.state.scopes.definitions.iter().any(|existing| {
                ojson_of_raw(existing)
                    .and_then(|d| d.get("name").and_then(|n| n.str().map(String::from)))
                    .is_some_and(|n| n == key)
            });
            if exists {
                continue;
            }
            let OJson::Obj(_) = def_raw else { continue };
            let mut def = def_raw.clone();
            let mut origin = OJson::new_object();
            origin.set("kind", OJson::string("addon"));
            origin.set("package", OJson::string(&decl.pkg));
            let prev = def_raw.get("origin");
            if let Some(prev) = prev
                && prev.get("kind").and_then(OJson::str) == Some("addon")
                && let Some(display) = prev.get("displayName")
            {
                origin.set("displayName", display.clone());
            }
            def.set("origin", origin);
            self.state.scopes.definitions.push(def.raw());
        }
    }
}
