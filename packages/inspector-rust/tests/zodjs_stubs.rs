//! A module that declares a Zod schema and also imports a package that is not
//! installed still converts: the import is stubbed (Go: zodjs.Converter). Under
//! plain Node the same module fails to load. This is what `pikku all` hits in a
//! checkout whose workspace packages are not built.

use std::path::{Path, PathBuf};
use std::time::Duration;

use pikku_inspect::schemas::vendor::{VendorRef, VendorSchemaConverter};
use pikku_inspect::schemas::zodjs::Converter;
use pikku_inspect::state::meta::SchemaRef;

fn repo_zod() -> Option<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../node_modules/zod");
    root.exists().then(|| root.canonicalize().unwrap())
}

fn project(source: &str) -> Option<(PathBuf, PathBuf)> {
    let zod = repo_zod()?;
    if std::process::Command::new("node").arg("--version").output().is_err() {
        return None;
    }
    let dir = std::env::temp_dir().join(format!("zodjs-stubs-{}-{}", std::process::id(), source.len()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("node_modules")).unwrap();
    std::os::unix::fs::symlink(zod, dir.join("node_modules/zod")).unwrap();
    let file = dir.join("schemas.ts");
    std::fs::write(&file, source).unwrap();
    Some((dir, file))
}

fn refs(file: &Path, names: &[&str]) -> Vec<VendorRef> {
    names
        .iter()
        .map(|n| VendorRef {
            name: n.to_string(),
            schema_ref: SchemaRef { variable_name: n.to_string(), source_file: file.display().to_string(), vendor: "zod".into() },
        })
        .collect()
}

fn converter(dir: &Path) -> Converter {
    Converter { dir: dir.display().to_string(), tsconfig: String::new(), bases: vec![format!("{}/../../", env!("CARGO_MANIFEST_DIR"))], fallback: None }
}

#[test]
fn an_unresolvable_import_is_stubbed_not_fatal() {
    let Some((dir, file)) = project(
        "import { z } from 'zod'\nimport { client } from '@missing/package/dist/index.js'\nexport const FooInput = z.object({ a: z.string() })\nexport const used = client\n",
    ) else {
        return;
    };
    let res = converter(&dir).convert(&refs(&file, &["FooInput"]), Duration::from_secs(60)).unwrap_or_else(|e| panic!("{}", match e { pikku_inspect::schemas::vendor::ConvertError::Failed(m) => m, _ => "timeout".into() }));
    assert_eq!(res.errors, Vec::<String>::new());
    assert_eq!(res.schemas.len(), 1);
    assert_eq!(res.schemas[0].name, "FooInput");
    assert!(res.schemas[0].schema.value().unwrap()["properties"]["a"]["type"] == "string");
}

#[test]
fn a_schema_built_from_a_stub_is_refused_without_node() {
    let Some((dir, file)) = project(
        "import { z } from 'zod'\nimport { values } from '@missing/enums'\nexport const BarInput = z.enum(Object.values(values) as any)\n",
    ) else {
        return;
    };
    let res = converter(&dir).convert(&refs(&file, &["BarInput"]), Duration::from_secs(60)).unwrap_or_else(|e| panic!("{}", match e { pikku_inspect::schemas::vendor::ConvertError::Failed(m) => m, _ => "timeout".into() }));
    assert!(res.schemas.is_empty());
    assert_eq!(res.errors.len(), 1);
    assert!(res.errors[0].starts_with("Could not convert Zod schema 'BarInput' without Node:"), "{:?}", res.errors);
}
