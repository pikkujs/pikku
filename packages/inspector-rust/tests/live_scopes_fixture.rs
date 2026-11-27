//! Runs `inspector-parity/fixtures/live_scopes` through analysis and finalize
//! and compares the scope definitions, each function's `liveScopes` and the
//! errors against `expected.json`. The expectations follow Go's
//! `visit/group_scope.go` and `finalize/scopes.go`.

use std::path::Path;

use pikku_inspect::analyze;
use pikku_inspect::protocol::{Options, Request};
use serde_json::{Map, Value};

#[test]
fn marks_the_functions_that_require_a_live_scope() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../inspector-parity/fixtures/live_scopes").canonicalize().unwrap();
    let mut files: Vec<String> = std::fs::read_dir(root.join("src"))
        .unwrap()
        .flatten()
        .map(|e| e.path().to_string_lossy().to_string())
        .filter(|p| p.ends_with(".ts"))
        .collect();
    files.sort();
    let req = Request {
        route_files: files,
        options: Options {
            root_dir: root.to_string_lossy().to_string(),
            tsconfig: root.join("tsconfig.json").to_string_lossy().to_string(),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let mut res = analyze::run(&req, None).unwrap_or_else(|e| panic!("{e}"));
    pikku_inspect::finalize::response(&mut res, &req.options).unwrap();
    let text = pikku_inspect::jsjson::to_string(res.state.as_ref().unwrap().as_ref()).unwrap();
    let state: Value = serde_json::from_str(&text).unwrap();
    let want: Value = serde_json::from_slice(&std::fs::read(root.join("expected.json")).unwrap()).unwrap();

    // Compared as text, so the key order is held too.
    let mut definitions = state["scopes"]["definitions"].clone();
    for definition in definitions.as_array_mut().unwrap() {
        let definition = definition.as_object_mut().unwrap();
        definition.shift_remove("sourceFile");
        definition.shift_remove("origin");
    }
    assert_eq!(definitions.to_string(), want["scopes"].to_string(), "scope definitions");

    let marks: Map<String, Value> = want["liveScopes"]
        .as_object()
        .unwrap()
        .keys()
        .map(|id| {
            let meta = &state["functions"]["meta"][id];
            assert!(meta.is_object(), "no function meta for {id}");
            (id.clone(), meta["liveScopes"].clone())
        })
        .collect();
    assert_eq!(Value::Object(marks).to_string(), want["liveScopes"].to_string(), "liveScopes");

    let errors: Vec<String> = res
        .diagnostics
        .iter()
        .map(|d| serde_json::to_value(d).unwrap())
        .filter(|d| d.to_string().contains("`live`"))
        .map(|d| d["message"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(Value::from(errors), want["errors"], "errors");
}
