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
