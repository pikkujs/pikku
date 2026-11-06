//! Port of Go `visit/usage_sweeps.go`: `SweepUsage`, the per-file pass
//! inspector.ts runs before visitSetup: utils/extract-secret-usage.ts into
//! `secrets.usage` and utils/extract-surface-usage.ts into `surfaceUsage`.

use std::collections::{BTreeSet, HashMap};

use tsrs_ast::{self as ast, Node, SourceFile};
use tsrs_core::P;

use super::Context;
use crate::state::{Record, SecretUsage, SurfaceUsage};
use crate::tsutil::{self, base_path, dir_path, node_start, node_text, rel_path, sort_strings_js};

impl Context<'_> {
    /// `SweepUsage`.
    pub fn sweep_usage(&mut self, files: &[P<SourceFile>]) {
        let mut area_cache: HashMap<String, Option<String>> = HashMap::new();
        for sf in files {
            let u = extract_secret_usage(*sf);
            if !u.keys.is_empty() || !u.dynamic.is_empty() {
                self.state.secrets.usage.set(sf.file_name(), u);
            }
            let rel = rel_path(&self.root_dir, sf.file_name()).unwrap_or_default();
            let area = surface_usage_area(sf.file_name(), &self.root_dir, &mut area_cache);
            accumulate_surface_usage(*sf, &area, &rel, &mut self.state.surface_usage);
        }
    }
}

fn secret_literal_key(n: Option<P<Node>>) -> Option<String> {
    let n = n?;
    if ast::is_string_literal(n) || ast::is_no_substitution_template_literal(n) {
        Some(n.text().to_string())
    } else {
        None
    }
}

/// `ExtractSecretUsage` is extract-secret-usage.ts extractSecretUsage.
pub fn extract_secret_usage(sf: P<SourceFile>) -> SecretUsage {
    let mut keys: BTreeSet<String> = BTreeSet::new();
    let mut dynamic: BTreeSet<String> = BTreeSet::new();
    let record = |call: P<Node>, arg: Option<P<Node>>, dynamic: &mut BTreeSet<String>| {
        let line = tsrs_scanner::get_ecma_line_of_position(sf.get(), node_start(call) as u32);
        let target = arg.unwrap_or(call);
        dynamic.insert(format!("{}:{}", line + 1, node_text(target)));
    };
    tsutil::walk_self(sf.as_node(), &mut |n| {
        if !ast::is_call_expression(n) || !ast::is_property_access_expression(n.expression().unwrap()) {
            return;
        }
        let method = n.expression().unwrap().name().unwrap().text();
        let first = n.arguments().first().copied();
        match method {
            "getSecret" | "hasSecret" => match first {
                None => record(n, None, &mut dynamic),
                Some(f) => match secret_literal_key(Some(f)) {
                    Some(key) => {
                        keys.insert(key);
                    }
                    None => record(n, Some(f), &mut dynamic),
                },
            },
            "getSecrets" => {
                if let Some(f) = first.filter(|f| ast::is_array_literal_expression(*f)) {
                    for el in f.elements() {
                        match secret_literal_key(Some(*el)) {
                            Some(key) => {
                                keys.insert(key);
                            }
                            None => record(n, Some(*el), &mut dynamic),
                        }
                    }
                } else {
                    record(n, first, &mut dynamic);
                }
            }
            _ => {}
        }
    });
    SecretUsage { keys: js_sorted(keys), dynamic: js_sorted(dynamic) }
}

/// `jsSortedKeys` sorts like Array.prototype.sort's default comparison (UTF-16
/// code units).
fn js_sorted(set: BTreeSet<String>) -> Vec<String> {
    let mut v: Vec<String> = set.into_iter().collect();
    sort_strings_js(&mut v);
    v
}

/// `leafSpecifierOf` maps a `#pikku/*` specifier to the leaf it counts against.
pub fn leaf_specifier_of(specifier: &str) -> Option<String> {
    let rest = specifier.strip_prefix("#pikku/")?;
    let leaf = rest.split('/').next().unwrap_or("");
    if leaf.is_empty() || leaf.ends_with(".js") {
        return None;
    }
    Some(format!("#pikku/{leaf}"))
}

fn package_name_at(dir: &str, cache: &mut HashMap<String, Option<String>>) -> Option<String> {
    if let Some(name) = cache.get(dir) {
        return name.clone();
    }
    let name = std::fs::read(format!("{dir}/package.json")).ok().and_then(|b| {
        let v: serde_json::Value = serde_json::from_slice(&b).ok()?;
        v.get("name")?.as_str().filter(|s| !s.is_empty()).map(str::to_string)
    });
    cache.insert(dir.to_string(), name.clone());
    name
}

/// `surfaceUsageArea` is extract-surface-usage.ts surfaceUsageArea: the
/// workspace package a file belongs to (the root package excluded), else its
/// top-level source directory.
pub fn surface_usage_area(file_name: &str, root_dir: &str, cache: &mut HashMap<String, Option<String>>) -> String {
    let mut dir = dir_path(file_name);
    while dir.starts_with(root_dir) && dir != root_dir {
        if let Some(name) = package_name_at(&dir, cache) {
            return name;
        }
        dir = dir_path(&dir);
    }
    let rel = rel_path(root_dir, file_name).unwrap_or_default();
    let segment = rel.split('/').next().unwrap_or("");
    if !segment.is_empty() && segment != base_path(file_name) {
        return segment.to_string();
    }
    base_path(root_dir)
}

fn binding_names_of(clause: Option<P<Node>>) -> Vec<String> {
    let Some(c) = clause else { return vec![] };
    if !ast::is_named_imports(c) && !ast::is_named_exports(c) {
        return vec![];
    }
    c.elements()
        .iter()
        .map(|el| el.property_name().or_else(|| el.name()).unwrap().text().to_string())
        .collect()
}

/// `accumulateSurfaceUsage` is extract-surface-usage.ts accumulateSurfaceUsage.
pub fn accumulate_surface_usage(sf: P<SourceFile>, area: &str, file: &str, into: &mut Record<Record<SurfaceUsage>>) {
    for stmt in sf.statements().nodes() {
        let stmt = *stmt;
        let (specifier, names) = if ast::is_import_declaration(stmt) {
            let names = stmt
                .import_clause()
                .map(|ic| binding_names_of(ic.as_import_clause().named_bindings()))
                .unwrap_or_default();
            (stmt.module_specifier(), names)
        } else if ast::is_export_declaration(stmt) && stmt.module_specifier().is_some() {
            (stmt.module_specifier(), binding_names_of(stmt.as_export_declaration().export_clause()))
        } else {
            continue;
        };
        let Some(specifier) = specifier else { continue };
        if names.is_empty() || !ast::is_string_literal(specifier) {
            continue;
        }
        let Some(leaf) = leaf_specifier_of(specifier.text()) else { continue };
        if !into.has(&leaf) {
            into.set(leaf.clone(), Record::new());
        }
        let symbols = into.get_mut(&leaf).unwrap();
        for name in names {
            if !symbols.has(&name) {
                symbols.set(name.clone(), SurfaceUsage { imports: 0, seen_in: vec![], files: vec![] });
            }
            let usage = symbols.get_mut(&name).unwrap();
            usage.imports += 1;
            if !usage.seen_in.iter().any(|a| a == area) {
                usage.seen_in.push(area.to_string());
            }
            if !usage.files.iter().any(|f| f == file) {
                usage.files.push(file.to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaf_specifiers() {
        assert_eq!(leaf_specifier_of("#pikku/http/x"), Some("#pikku/http".into()));
        assert_eq!(leaf_specifier_of("#pikku/http"), Some("#pikku/http".into()));
        assert_eq!(leaf_specifier_of("#pikku/index.js"), None);
        assert_eq!(leaf_specifier_of("@pikku/core"), None);
        assert_eq!(leaf_specifier_of("#pikku/"), None);
    }

    #[test]
    fn usage_area_falls_back_to_top_level_dir() {
        let mut cache = HashMap::new();
        assert_eq!(surface_usage_area("/proj/src/a/b.ts", "/proj", &mut cache), "src");
        assert_eq!(surface_usage_area("/proj/b.ts", "/proj", &mut cache), "proj");
    }
}
