//! Port of the Go analyze tests for the classification scan and the addon
//! bans (`internal/analyze/classification_test.go`, the addon-bans golden),
//! plus a differential fixture for the addon loader: `inspector-parity/fixtures/addon-load`
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
    copy(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../../inspector-parity/fixtures/addon-load"), &dst);
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
        &std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../inspector-parity/fixtures/addon-load/go.golden.json")).unwrap(),
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

/// Same sources and wording as Go's `TestWireContributorsRefusesWhatItCannotRead`.
#[test]
fn wire_contributors_refuses_what_it_cannot_read() {
    let root = std::env::temp_dir().join(format!("pikku-rs-wire-contributors-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("src")).unwrap();
    for (name, text) in [
        (
            "tsconfig.json",
            r#"{"compilerOptions":{"target":"ES2022","module":"Node16","moduleResolution":"Node16","strict":true,"noEmit":true,"skipLibCheck":true},"include":["src"]}"#,
        ),
        (
            "src/first.ts",
            "import { wireContributors } from '@pikku/core/contributors'\n\nwireContributors({ package: '@fixture/shop-addon', contributors: ['inbox'] })\n",
        ),
        (
            "src/second.ts",
            "import { wireContributors } from '@pikku/core/contributors'\n\ndeclare const contributors: string[]\ndeclare const options: { contributors?: string[] }\n\nwireContributors({ package: '@fixture/shop-addon', contributors: ['cache'] })\nwireContributors({ package: '@fixture/other-addon', contributors })\nwireContributors({ package: '@fixture/other-addon', contributors: ['a'], ...options })\n",
        ),
    ] {
        std::fs::write(root.join(name), text).unwrap();
    }
    let root = root.canonicalize().unwrap();
    let options = Options {
        root_dir: root.to_string_lossy().into_owned(),
        tsconfig: root.join("tsconfig.json").to_string_lossy().into_owned(),
        ..Default::default()
    };
    let req = Request {
        route_files: ["src/first.ts", "src/second.ts"].iter().map(|f| root.join(f).to_string_lossy().into_owned()).collect(),
        options,
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap_or_else(|e| panic!("{e}"));
    let got: Vec<String> =
        res.diagnostics.iter().filter(|d| d.code.as_deref() == Some("PKU362")).map(|d| d.message.clone()).collect();
    assert_eq!(
        got,
        [
            "wireContributors is called twice for package '@fixture/shop-addon' (src/first.ts:3 and src/second.ts:6). Call it once with every contributor to opt in to.",
            "wireContributors' properties must be plain `key: value` entries, got: contributors",
            "wireContributors' properties must be plain `key: value` entries, got: ...options",
        ]
    );
    let _ = std::fs::remove_dir_all(&root);
}

/// Same sources and wording as Go's `TestWiringsAreTopLevel`.
#[test]
fn wirings_are_top_level() {
    let root = std::env::temp_dir().join(format!("pikku-rs-wiring-top-level-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("src")).unwrap();
    for (name, text) in [
        (
            "tsconfig.json",
            r#"{"compilerOptions":{"target":"ES2022","module":"Node16","moduleResolution":"Node16","strict":true,"noEmit":true,"skipLibCheck":true},"include":["src"]}"#,
        ),
        (
            "src/nested.ts",
            "import { wireContributors } from '@pikku/core/contributors'\nimport { wireHTTP } from '@pikku/core/http'\n\nexport function optInToJobs() {\n  wireContributors({ package: '@fixture/shop-addon', contributors: ['jobs'] })\n}\n\nexport const addRoute = () => {\n  wireHTTP({ route: '/a', func: {} as any })\n}\n",
        ),
        (
            "src/enclosures.ts",
            "import { wireHTTP as wire } from '@pikku/core/http'\n\nclass Wirer {\n  attach() {\n    wire({ route: '/b', func: {} as any })\n  }\n}\n\nexport const later = function () {\n  wire({ route: '/c', func: {} as any })\n}\n\nvoid Wirer\n",
        ),
        (
            "src/wrapper.ts",
            "import { wireHTTP as coreWireHTTP } from '@pikku/core/http'\n\nexport const wireHTTP = (config: any) => {\n  coreWireHTTP(config)\n}\n",
        ),
        (
            "src/top.ts",
            "import { wireContributors } from '@pikku/core/contributors'\n\nwireContributors({ package: '@fixture/top-addon', contributors: ['inbox'] })\n",
        ),
    ] {
        std::fs::write(root.join(name), text).unwrap();
    }
    let root = root.canonicalize().unwrap();
    let options = Options {
        root_dir: root.to_string_lossy().into_owned(),
        tsconfig: root.join("tsconfig.json").to_string_lossy().into_owned(),
        ..Default::default()
    };
    let req = Request {
        route_files: ["src/nested.ts", "src/enclosures.ts", "src/top.ts", "src/wrapper.ts"].iter().map(|f| root.join(f).to_string_lossy().into_owned()).collect(),
        options,
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap_or_else(|e| panic!("{e}"));
    let got: Vec<String> =
        res.diagnostics.iter().filter(|d| d.code.as_deref() == Some("PKU367")).map(|d| d.message.clone()).collect();
    assert_eq!(
        got,
        [
            "wireHTTP must be called at the top level of a file, not inside a function (inside attach, src/enclosures.ts:4)",
            "wireHTTP must be called at the top level of a file, not inside a function (inside later, src/enclosures.ts:9)",
            "wireContributors must be called at the top level of a file, not inside a function (inside optInToJobs, src/nested.ts:4)",
            "wireHTTP must be called at the top level of a file, not inside a function (inside addRoute, src/nested.ts:8)",
        ]
    );
    let _ = std::fs::remove_dir_all(&root);
}
