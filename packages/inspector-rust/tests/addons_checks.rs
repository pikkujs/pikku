//! Port of the Go analyze tests for the classification scan and the addon
//! bans (`internal/analyze/classification_test.go`, the addon-bans golden),
//! plus a differential fixture for the addon loader: `tests/fixtures/addon-load`
//! is run through the Go inspector and the keys the loader owns are stored in
//! `go.golden.json` (with the fixture root as `<ROOT>`).

use std::path::{Path, PathBuf};

use pikku_inspect::analyze;
use pikku_inspect::protocol::{Options, Request};
use serde_json::Value;

fn go_testdata(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../inspector-go/testdata").join(name).canonicalize().unwrap()
}

fn ts_files(dir: &Path) -> Vec<String> {
    fn walk(dir: &Path, out: &mut Vec<String>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let mut entries: Vec<_> = rd.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let p = e.path();
            if p.is_dir() {
                walk(&p, out);
            } else if p.to_string_lossy().ends_with(".ts") {
                out.push(p.to_string_lossy().into_owned());
            }
        }
    }
    let mut out = Vec::new();
    walk(dir, &mut out);
    out
}

fn run(root: &Path, opts: impl FnOnce(&mut Options)) -> pikku_inspect::protocol::Response {
    let mut options = Options {
        root_dir: root.to_string_lossy().into_owned(),
        tsconfig: root.join("tsconfig.json").to_string_lossy().into_owned(),
        ..Default::default()
    };
    opts(&mut options);
    let req = Request { route_files: ts_files(&root.join("src")), options, changed_files: vec![] };
    analyze::run(&req, None).unwrap_or_else(|e| panic!("{e}"))
}

/// diagnostics.golden.json is the TypeScript inspector's output for the
/// fixture, so this is a parity check on the messages byte for byte.
#[test]
fn classification_scan_matches_the_ts_golden() {
    let root = go_testdata("classification");
    let res = run(&root, |o| o.classification_check = true);
    let got: Vec<(String, String)> = res
        .diagnostics
        .iter()
        .filter(|d| matches!(d.code.as_deref(), Some("PKU953" | "PKU954" | "PKU910")))
        .map(|d| (d.code.clone().unwrap(), d.message.clone()))
        .collect();
    let want: Vec<Value> = serde_json::from_slice(&std::fs::read(root.join("diagnostics.golden.json")).unwrap()).unwrap();
    let want: Vec<(String, String)> =
        want.iter().map(|w| (w["code"].as_str().unwrap().to_string(), w["message"].as_str().unwrap().to_string())).collect();
    assert_eq!(got.len(), want.len(), "diagnostic count");
    for (i, (g, w)) in got.iter().zip(&want).enumerate() {
        assert_eq!(g, w, "diagnostic {i}");
    }
}

/// Off by default: it is a `pikku all --security` lint, not codegen.
#[test]
fn classification_scan_is_opt_in() {
    let res = run(&go_testdata("classification"), |_| {});
    assert!(!res.diagnostics.iter().any(|d| matches!(d.code.as_deref(), Some("PKU953" | "PKU954" | "PKU910"))));
}

#[test]
fn addon_bans_match_the_golden() {
    let root = go_testdata("addon-bans");
    let res = run(&root, |o| o.is_addon = true);
    let root_s = root.to_string_lossy().into_owned();
    let got: Vec<(Option<String>, String)> = res
        .diagnostics
        .iter()
        .filter(|d| matches!(d.code.as_deref(), Some("PKU920" | "PKU921")) || d.message.starts_with("wireAddon("))
        .map(|d| (d.code.clone(), d.message.replace(&root_s, "<fixture>")))
        .collect();
    let golden: Value = serde_json::from_slice(&std::fs::read(root.join("inspect.golden.json")).unwrap()).unwrap();
    let want: Vec<(Option<String>, String)> = golden["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|d| matches!(d["code"].as_str(), Some("PKU920" | "PKU921")) || d["message"].as_str().unwrap().starts_with("wireAddon("))
        .map(|d| (d["code"].as_str().map(String::from), d["message"].as_str().unwrap().to_string()))
        .collect();
    assert_eq!(got, want);
    // A non-addon project is not subject to the bans.
    let res = run(&root, |_| {});
    assert!(!res.diagnostics.iter().any(|d| matches!(d.code.as_deref(), Some("PKU920" | "PKU921"))));
}

/// Copies the fixture to a temp dir, renaming `modules` to `node_modules` and
/// `dot-pikku` to `.pikku` (both are ignored or hidden in a checkout).
fn materialise_addon_fixture() -> PathBuf {
    fn copy(from: &Path, to: &Path) {
        std::fs::create_dir_all(to).unwrap();
        for e in std::fs::read_dir(from).unwrap().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let target_name = match name.as_str() {
                "modules" => "node_modules".to_string(),
                "dot-pikku" => ".pikku".to_string(),
                _ => name,
            };
            let (src, dst) = (e.path(), to.join(target_name));
            if src.is_dir() {
                copy(&src, &dst);
            } else {
                std::fs::copy(&src, &dst).unwrap();
            }
        }
    }
    let dst = std::env::temp_dir().join(format!("pikku-rs-addon-load-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dst);
    copy(&Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/addon-load"), &dst);
    dst.canonicalize().unwrap()
}

#[test]
fn addon_loader_matches_go_on_the_fixture() {
    let root = materialise_addon_fixture();
    let res = run(&root, |_| {});
    let root_s = root.to_string_lossy().into_owned();
    let text = pikku_inspect::jsjson::to_string(res.state.as_ref().unwrap().as_ref()).unwrap();
    let state: Value = serde_json::from_str(&text.replace(&root_s, "<ROOT>")).unwrap();
    let golden: Value = serde_json::from_slice(
        &std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/addon-load/go.golden.json")).unwrap(),
    )
    .unwrap();
    for (key, want) in golden.as_object().unwrap() {
        if key == "diagnostics" {
            continue;
        }
        let got = match key.split_once('.') {
            Some((a, b)) => state.get(a).and_then(|v| v.get(b)),
            None => state.get(key),
        };
        // Compare the serialised text: key order is part of the output.
        assert_eq!(
            got.map(|v| v.to_string()).unwrap_or_default(),
            want.to_string(),
            "state.{key} differs from Go"
        );
    }
    let diags: Vec<(Option<String>, String)> = res
        .diagnostics
        .iter()
        .filter(|d| matches!(d.code.as_deref(), Some("PKU356" | "PKU363" | "PKU343" | "PKU364")) || d.message.starts_with("wireAddon("))
        .map(|d| (d.code.clone(), d.message.replace(&root_s, "<ROOT>")))
        .collect();
    let want: Vec<(Option<String>, String)> = golden["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| (d["code"].as_str().map(String::from), d["message"].as_str().unwrap().to_string()))
        .collect();
    assert_eq!(diags, want);
    let _ = std::fs::remove_dir_all(&root);
}
