//! The list-func fixture (`packages/inspector-go/testdata/list-func`): a list
//! function's input schema comes from its ListInput, and PKU492 flags a
//! generated schema that admits anything or nothing where its source did not
//! say `unknown`. The schemas are compared with Go's `golden.json`.

use std::path::{Path, PathBuf};

use pikku_inspect::analyze;
use pikku_inspect::protocol::{Options, Request, SchemaConfig};
use serde_json::{Map, Value};

fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../inspector-go/testdata/list-func").canonicalize().unwrap()
}

fn ts_files(dir: &Path, out: &mut Vec<String>) {
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            ts_files(&p, out);
        } else if p.extension().is_some_and(|x| x == "ts") {
            out.push(p.to_string_lossy().into_owned());
        }
    }
}

fn run() -> pikku_inspect::protocol::Response {
    let root = fixture();
    let mut files = Vec::new();
    ts_files(&root.join("src"), &mut files);
    files.sort();
    let tsconfig = root.join("tsconfig.json").to_string_lossy().into_owned();
    let req = Request {
        route_files: files,
        options: Options {
            root_dir: root.to_string_lossy().into_owned(),
            tsconfig: tsconfig.clone(),
            schema_config: Some(SchemaConfig { tsconfig, ..Default::default() }),
            ..Default::default()
        },
        changed_files: vec![],
    };
    analyze::run(&req, None).unwrap_or_else(|e| panic!("{e}"))
}

#[test]
fn list_schemas_match_go_golden() {
    let res = run();
    let st = res.state.as_ref().unwrap();
    let mut got = Map::new();
    for n in ["ListItemsInput", "ListItemsOutput", "ListTagsInput"] {
        got.insert(n.to_string(), st.schemas.get(n).unwrap_or_else(|| panic!("no schema {n}")).value().unwrap().clone());
    }
    let want: Value = serde_json::from_slice(&std::fs::read(fixture().join("golden.json")).unwrap()).unwrap();
    assert_eq!(Value::Object(got), want);
}

#[test]
fn generated_schema_unknown_never() {
    let res = run();
    let got: Vec<_> = res.diagnostics.iter().filter(|d| d.code.as_deref() == Some("PKU492")).collect();
    assert_eq!(got.len(), 1, "{got:?}");
    assert_eq!(got[0].level, pikku_inspect::diag::Level::Error);
    assert!(got[0].message.contains("'readGone' output schema"), "{}", got[0].message);
    assert!(got[0].message.contains("at '.tags[]'"), "{}", got[0].message);
}

/// The PKU492 entries of Go's `inspect.golden.json` for a fixture inspected
/// with schemas on.
fn golden_pku492(name: &str) -> Vec<Value> {
    let root = fixture().parent().unwrap().join(name).canonicalize().unwrap();
    let golden: Value = serde_json::from_slice(&std::fs::read(root.join("inspect.golden.json")).unwrap()).unwrap();
    let want: Vec<Value> =
        golden["diagnostics"].as_array().unwrap().iter().filter(|d| d["code"] == "PKU492").cloned().collect();

    let config: Value = serde_json::from_slice(&std::fs::read(root.join("pikku.config.json")).unwrap()).unwrap();
    let tsconfig = root.join(config["tsconfig"].as_str().unwrap()).to_string_lossy().into_owned();
    let mut files = Vec::new();
    ts_files(&root, &mut files);
    files.retain(|f| !f.contains("/node_modules/") && !f.ends_with(".test.ts"));
    files.sort();
    let req = Request {
        route_files: files,
        options: Options {
            root_dir: root.to_string_lossy().into_owned(),
            tsconfig: tsconfig.clone(),
            is_addon: config["addon"].as_bool().unwrap_or(false),
            schema_config: Some(SchemaConfig { tsconfig, ..Default::default() }),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap_or_else(|e| panic!("{e}"));
    let got: Vec<Value> = res
        .diagnostics
        .iter()
        .filter(|d| d.code.as_deref() == Some("PKU492"))
        .map(|d| serde_json::to_value(d).unwrap())
        .collect();
    assert_eq!(got, want, "{name}");
    want
}

#[test]
fn pku492_matches_go_goldens() {
    assert_eq!(golden_pku492("classification").len(), 1);
    assert_eq!(golden_pku492("wirings-addons").len(), 1);
}
