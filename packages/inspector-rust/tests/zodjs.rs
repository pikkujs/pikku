//! Port of Go internal/schemas/zodjs/converter_test.go over the same fixture
//! project (packages/inspector-go/internal/schemas/zodjs/testdata/project).
//! They skip when zod is not installed (bun install).

use std::path::{Path, PathBuf};
use std::time::Duration;

use pikku_inspect::schemas::vendor::{VendorRef, VendorResult, VendorSchemaConverter};
use pikku_inspect::schemas::zodjs::ZodjsConverter;
use pikku_inspect::state::meta::SchemaRef;

fn fixture() -> Option<PathBuf> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../inspector-go/internal/schemas/zodjs/testdata/project");
    let dir = dir.canonicalize().ok()?;
    let mut d: &Path = &dir;
    loop {
        if d.join("node_modules/zod/package.json").exists() {
            return Some(dir);
        }
        d = d.parent()?;
    }
}

fn reference(dir: &Path, name: &str, file: &str, variable: &str) -> VendorRef {
    VendorRef {
        name: name.into(),
        schema_ref: SchemaRef {
            variable_name: variable.into(),
            source_file: dir.join(file).to_string_lossy().into_owned(),
            vendor: "zod".into(),
        },
    }
}

fn convert(dir: &Path, refs: &[VendorRef]) -> VendorResult {
    let conv = ZodjsConverter { dir: dir.to_string_lossy().into_owned(), tsconfig: dir.join("tsconfig.json").to_string_lossy().into_owned() };
    match conv.convert(refs, Duration::from_secs(60)) {
        Ok(r) => r,
        Err(_) => panic!("conversion failed"),
    }
}

fn names(res: &VendorResult) -> Vec<&str> {
    res.schemas.iter().map(|s| s.name.as_str()).collect()
}

#[test]
fn converts_as_vendor_schemas_does() {
    let Some(dir) = fixture() else { return };
    let res = convert(&dir, &[reference(&dir, "OrderInput", "plain.ts", "Order")]);
    assert!(res.errors.is_empty(), "{:?}", res.errors);
    let got: serde_json::Value = res.schemas[0].schema.value().unwrap().clone();
    let want: serde_json::Value = serde_json::from_str(
        r#"{
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
            "id": {"type": "string", "maxLength": 36},
            "placedAt": {"type": "string", "format": "date-time"},
            "quantity": {"type": "integer", "minimum": -9007199254740991, "maximum": 9007199254740991, "default": 1},
            "status": {"type": "string", "enum": ["open", "closed"]}
        },
        "required": ["id", "placedAt", "status"],
        "additionalProperties": false
    }"#,
    )
    .unwrap();
    assert_eq!(got, want);
    assert!(res.schemas[0].type_text.contains("placedAt: Date"), "{}", res.schemas[0].type_text);
}

#[test]
fn refuses_schemas_built_from_a_stubbed_package() {
    let Some(dir) = fixture() else { return };
    let refs: Vec<VendorRef> = ["CurrencyField", "Amount", "Address", "Described", "Note"]
        .iter()
        .map(|n| reference(&dir, n, "from-package.ts", n))
        .collect();
    let res = convert(&dir, &refs);
    assert_eq!(names(&res), vec!["Note"]);
    assert_eq!(res.errors.len(), 4, "{:?}", res.errors);
    for m in &res.errors {
        assert!(m.contains("without Node") && m.contains("'some-shared-schemas'"), "{m}");
    }
}

#[test]
fn refuses_a_module_that_turns_a_stub_into_a_string() {
    let Some(dir) = fixture() else { return };
    let res = convert(
        &dir,
        &[
            reference(&dir, "Row", "loads-badly.ts", "Row"),
            reference(&dir, "CurrencyCode", "enum-from-package.ts", "CurrencyCode"),
        ],
    );
    assert!(res.schemas.is_empty());
    assert_eq!(res.errors.len(), 2, "{:?}", res.errors);
    assert!(res.errors[0].contains("'some-config'"), "{}", res.errors[0]);
    assert!(res.errors[1].contains("'some-shared-schemas'"), "{}", res.errors[1]);
}

#[test]
fn reports_what_node_would_report() {
    let Some(dir) = fixture() else { return };
    let res = convert(
        &dir,
        &[reference(&dir, "Trimmed", "transform.ts", "Trimmed"), reference(&dir, "Missing", "plain.ts", "Missing")],
    );
    assert_eq!(res.errors.len(), 2, "{:?}", res.errors);
    assert!(res.errors[0].contains("[PKU491] 'Trimmed' contains a .transform()"), "{}", res.errors[0]);
    assert!(res.errors[1].contains("Could not find exported schema 'Missing'"), "{}", res.errors[1]);
}

#[test]
fn a_module_that_does_not_load_costs_only_its_own_schemas() {
    let Some(dir) = fixture() else { return };
    let tmp = std::env::temp_dir().join(format!("zodjs-broken-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    std::fs::write(tmp.join("broken.ts"), "export const X = (").unwrap();
    let refs = [
        reference(&tmp, "X", "broken.ts", "X"),
        reference(&dir, "OrderInput", "plain.ts", "Order"),
    ];
    let res = convert(&dir, &refs);
    assert_eq!(names(&res), vec!["OrderInput"]);
    assert_eq!(res.errors.len(), 1, "{:?}", res.errors);
    assert!(res.errors[0].contains("broken.ts"), "{}", res.errors[0]);
    let _ = std::fs::remove_dir_all(&tmp);
}

/// The zod the repo installed, or the one `PIKKU_TEST_ZOD` names.
fn zod() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("PIKKU_TEST_ZOD") {
        return PathBuf::from(dir).canonicalize().ok();
    }
    let mut d: &Path = Path::new(env!("CARGO_MANIFEST_DIR"));
    loop {
        let candidate = d.join("node_modules/zod");
        if candidate.join("package.json").exists() {
            return candidate.canonicalize().ok();
        }
        d = d.parent()?;
    }
}

/// A project outside any repo: `zod` is linked where the test says, and every
/// other file is written as given.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Scratch {
        let dir = std::env::temp_dir().join(format!("zodjs-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("tsconfig.json"), "{}").unwrap();
        Scratch(dir)
    }

    fn write(&self, rel: &str, text: &str) {
        let path = self.0.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    fn link_zod(&self, zod: &Path, at: &str) {
        let link = self.0.join(at).join("node_modules/zod");
        std::fs::create_dir_all(link.parent().unwrap()).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(zod, link).unwrap();
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn finds_zod_installed_beside_the_schema_and_not_at_the_project_root() {
    let Some(zod) = zod() else { return };
    let project = Scratch::new("nested-zod");
    project.link_zod(&zod, "packages/functions");
    project.write("packages/functions/schema.ts", "import { z } from 'zod'\nexport const Name = z.object({ name: z.string() })\n");
    let res = convert(&project.0, &[reference(&project.0, "NameInput", "packages/functions/schema.ts", "Name")]);
    assert!(res.errors.is_empty(), "{:?}", res.errors);
    assert_eq!(names(&res), vec!["NameInput"]);
}

#[test]
fn builds_a_schema_from_a_package_under_node_modules() {
    let Some(zod) = zod() else { return };
    let project = Scratch::new("package-schema");
    project.link_zod(&zod, ".");
    project.write(
        "node_modules/define-events/package.json",
        r#"{ "name": "define-events", "type": "module", "exports": { ".": "./dist/index.js" } }"#,
    );
    project.write("node_modules/define-events/dist/index.js", "export const defineEvents = (events) => events\n");
    project.write(
        "events.ts",
        "import { z } from 'zod'\nimport { defineEvents } from 'define-events'\n\
         export const events = defineEvents({ viewed: z.object({ page: z.string() }) })\n\
         export const Viewed = z.object(events.viewed.shape)\n",
    );
    let res = convert(&project.0, &[reference(&project.0, "ViewedInput", "events.ts", "Viewed")]);
    assert!(res.errors.is_empty(), "{:?}", res.errors);
    assert_eq!(names(&res), vec!["ViewedInput"]);
    let schema = res.schemas[0].schema.value().unwrap();
    assert_eq!(schema["properties"]["page"]["type"], "string");
}

#[test]
fn stubs_a_package_that_cannot_load_so_the_rest_of_the_module_still_converts() {
    let Some(zod) = zod() else { return };
    let project = Scratch::new("package-throws");
    project.link_zod(&zod, ".");
    project.write(
        "node_modules/needs-node/package.json",
        r#"{ "name": "needs-node", "type": "module", "exports": { ".": "./index.js" } }"#,
    );
    project.write("node_modules/needs-node/index.js", "throw new Error('needs Node')\nexport const client = 1\n");
    project.write(
        "mixed.ts",
        "import { z } from 'zod'\nimport { client } from 'needs-node'\n\
         export const Uses = z.object({ n: z.number().max(client) })\n\
         export const Note = z.string()\n",
    );
    let refs = [reference(&project.0, "Uses", "mixed.ts", "Uses"), reference(&project.0, "Note", "mixed.ts", "Note")];
    let res = convert(&project.0, &refs);
    assert_eq!(names(&res), vec!["Note"]);
    assert_eq!(res.errors.len(), 1, "{:?}", res.errors);
    assert!(res.errors[0].contains("'needs-node'"), "{}", res.errors[0]);
}

#[test]
fn keeps_a_package_that_imports_node_as_a_stub() {
    let Some(zod) = zod() else { return };
    let project = Scratch::new("package-imports-node");
    project.link_zod(&zod, ".");
    project.write(
        "node_modules/uses-fs/package.json",
        r#"{ "name": "uses-fs", "type": "module", "exports": { ".": "./index.js" } }"#,
    );
    project.write("node_modules/uses-fs/index.js", "import { readFileSync } from 'node:fs'\nexport const limit = readFileSync ? 5 : 1\n");
    project.write("limited.ts", "import { z } from 'zod'\nimport { limit } from 'uses-fs'\nexport const Limited = z.string().max(limit)\n");
    let res = convert(&project.0, &[reference(&project.0, "Limited", "limited.ts", "Limited")]);
    assert!(res.schemas.is_empty());
    assert_eq!(res.errors.len(), 1, "{:?}", res.errors);
    assert!(res.errors[0].contains("'uses-fs'"), "{}", res.errors[0]);
}
