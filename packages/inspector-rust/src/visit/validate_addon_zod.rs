//! Port of Go `visit/validate_addon_zod.go` (utils/validate-addon-zod-contract.ts).

use std::collections::{BTreeSet, HashSet};

use super::addon_resolve::find_package_name_for_file;
use crate::typesmap::TypesMap;

/// Core by its install path or by the name in the nearest package.json, never
/// by a directory name an addon could also use.
pub fn is_pikku_core_path(path: &str) -> bool {
    // `[\\/]node_modules[\\/]@pikku[\\/]core[\\/]`
    path.replace('\\', "/").contains("/node_modules/@pikku/core/") || find_package_name_for_file(path) == "@pikku/core"
}

pub fn named_source_types(tm: &TypesMap, names: &[String]) -> Vec<String> {
    fn visit(tm: &TypesMap, name: &str, seen: &mut HashSet<String>, found: &mut BTreeSet<String>) {
        if !seen.insert(name.to_string()) {
            return;
        }
        if let Some(custom) = tm.custom_type(name) {
            for r in &custom.references {
                visit(tm, r, seen, found);
            }
            return;
        }
        let Ok(meta) = tm.get_type_meta(name) else { return };
        if let Some(p) = meta.path.as_deref().filter(|p| !p.is_empty())
            && !is_pikku_core_path(p)
        {
            found.insert(meta.original_name);
        }
    }
    let mut found = BTreeSet::new();
    for n in names {
        visit(tm, n, &mut HashSet::new(), &mut found);
    }
    // sort.Strings is a byte-wise sort, which BTreeSet<String> also is.
    found.into_iter().collect()
}

#[derive(Clone, Debug, Default)]
pub struct AddonContractTypeSource {
    pub name: String,
    pub uses_generics: bool,
    pub has_input_schema: bool,
    pub has_output_schema: bool,
    pub input_names: Vec<String>,
    pub output_names: Vec<String>,
}

pub fn addon_zod_contract_violation(tm: &TypesMap, f: &AddonContractTypeSource) -> String {
    let mut problems: Vec<String> = Vec::new();
    if f.uses_generics {
        problems.push("declares its input/output with TypeScript generics".into());
    }
    let mut named: Vec<String> = Vec::new();
    if !f.has_input_schema {
        named.extend(named_source_types(tm, &f.input_names));
    }
    if !f.has_output_schema {
        named.extend(named_source_types(tm, &f.output_names));
    }
    if !named.is_empty() {
        let mut uniq: Vec<String> = Vec::new();
        for n in named {
            if !uniq.contains(&n) {
                uniq.push(n);
            }
        }
        problems.push(format!("types its input/output with named source types ({})", uniq.join(", ")));
    }
    if problems.is_empty() {
        return String::new();
    }
    format!(
        "Addon function '{}' is remote: true but {}. A remote addon's contract ships as a types-only SDK, so its input and output must be zod schemas: export each schema as a zod variable from a file that does not import #pikku (a sibling <fn>.schemas.ts), reference it as `input:` / `output:` on the function, and drop the generics. TypeScript types would make the SDK import from the addon's src/, which the consumer does not have.",
        f.name,
        problems.join(" and ")
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::visit::addon_load::tests::{temp_dir, write_files};

    #[test]
    fn named_source_types_follow_custom_types_and_skip_core() {
        let mut tm = TypesMap::new();
        tm.add_type("Note", "/app/src/notes.ts");
        tm.add_type("MCPToolResponse", "/app/node_modules/@pikku/core/dist/mcp.d.ts");
        tm.add_custom_type("ListNotesOutput", "Note[]", vec!["Note".into()]);
        tm.add_custom_type("GetNoteOutput", "{ body: string }", vec![]);
        assert_eq!(named_source_types(&tm, &["ListNotesOutput".into(), "string".into()]), ["Note"]);
        let none = named_source_types(&tm, &["GetNoteOutput".into(), "MCPToolResponse".into(), "Missing".into()]);
        assert!(none.is_empty(), "inline, core and unknown types are not source types: {none:?}");
    }

    #[test]
    fn zod_contract_violation_names_the_problems() {
        let mut tm = TypesMap::new();
        tm.add_type("Note", "/app/src/notes.ts");
        let ok = addon_zod_contract_violation(&tm, &AddonContractTypeSource {
            name: "getNote".into(),
            has_input_schema: true,
            has_output_schema: true,
            input_names: vec!["GetNoteInput".into()],
            output_names: vec!["Note".into()],
            ..Default::default()
        });
        assert_eq!(ok, "", "zod contract refused");
        let v = addon_zod_contract_violation(&tm, &AddonContractTypeSource {
            name: "getNote".into(),
            uses_generics: true,
            output_names: vec!["Note".into()],
            ..Default::default()
        });
        for want in ["'getNote' is remote: true", "TypeScript generics", "named source types (Note)", "must be zod schemas"] {
            assert!(v.contains(want), "violation {v:?} lacks {want:?}");
        }
    }

    #[test]
    fn core_is_known_by_package_name() {
        let root = temp_dir("zod-core");
        let declare_in = |dir: &str, pkg: &str| {
            write_files(&root, &[(&format!("{dir}/package.json"), &format!(r#"{{"name":"{pkg}"}}"#)), (&format!("{dir}/src/types.ts"), "")]);
            root.join(dir).join("src/types.ts").to_string_lossy().into_owned()
        };
        let mut tm = TypesMap::new();
        let note = declare_in("packages/core", "@acme/core");
        tm.add_type("Note", &note);
        let core = declare_in("pikku/core", "@pikku/core");
        tm.add_type("MCPToolResponse", &core);
        assert_eq!(
            named_source_types(&tm, &["Note".into(), "MCPToolResponse".into()]),
            ["Note"],
            "an addon's own packages/core is source, @pikku/core is not"
        );
    }
}
