//! Runs `inspector-parity/fixtures/trigger_feature` through the Rust analysis and compares
//! the state and diagnostics of the trigger / feature / feature-flag /
//! virtual-user / analytics / defineContributors / definePlugin groups against
//! `expected.go.json`, which the Go inspector produced for the same files
//! (paths rewritten to `<fixture>`). The fixture hits every refusal the Go
//! groups have, not just the happy path.

use std::path::{Path, PathBuf};

use pikku_inspect::analyze;
use pikku_inspect::protocol::{Options, Request};
use serde_json::Value;

fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../inspector-parity/fixtures/trigger_feature").canonicalize().unwrap()
}

#[test]
fn matches_go() {
    let root = fixture();
    let root_s = root.to_string_lossy().to_string();
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
            root_dir: root_s.clone(),
            tsconfig: root.join("tsconfig.json").to_string_lossy().to_string(),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap_or_else(|e| panic!("{e}"));
    let text = pikku_inspect::jsjson::to_string(res.state.as_ref().unwrap().as_ref()).unwrap().replace(&root_s, "<fixture>");
    let state: Value = serde_json::from_str(&text).unwrap();
    let want: Value = serde_json::from_slice(&std::fs::read(root.join("expected.go.json")).unwrap()).unwrap();

    for (key, expected) in want["state"].as_object().unwrap() {
        let got = match key.split_once('.') {
            Some((a, b)) => &state[a][b],
            None => &state[key.as_str()],
        };
        assert_eq!(got.to_string(), expected.to_string(), "state.{key} differs from Go");
    }

    // Diagnostics owned by other groups (the virtual-user role check) are not
    // part of this fixture's claim.
    let not_mine = |m: &str| m.contains("which is not declared with defin");
    let diags = |v: &Value| -> Vec<String> {
        v.as_array()
            .unwrap()
            .iter()
            .filter(|d| !not_mine(d["message"].as_str().unwrap_or("")))
            .map(|d| d.to_string())
            .collect()
    };
    let got: Vec<Value> = res.diagnostics.iter().map(|d| serde_json::to_value(d).unwrap()).collect();
    let got = Value::Array(got);
    let got_s = diags(&got).join("\n").replace(&root_s, "<fixture>");
    let want_s = diags(&want["diagnostics"]).join("\n");
    assert_eq!(got_s, want_s, "diagnostics differ from Go");
}
