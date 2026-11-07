//! Runs the Go inspector's own fixtures (`packages/inspector-go/testdata/*`)
//! through the Rust analysis and compares the state keys the core visitor
//! groups own against Go's `inspect.golden.json`.
//!
//! The goldens are finalized states, so the fields finalize adds after
//! analysis are stripped from the comparison: `singletonServicesOnly` and the
//! contract hashes on `functions.meta[*]`, `requiresSession` on
//! `http.meta[*][*]`. Everything else under the owned keys must be equal.

use std::path::{Path, PathBuf};

use pikku_inspect::analyze;
use pikku_inspect::protocol::{Options, Request};
use serde_json::Value;

const OWNED_KEYS: &[&str] = &[
    "singletonServicesTypeImportMap",
    "wireServicesTypeImportMap",
    "userSessionTypeImportMap",
    "configTypeImportMap",
    "singletonServicesFactories",
    "wireServicesFactories",
    "wireServicesMeta",
    "configFactories",
    "serverLifecycleFactories",
    "outgoingWebhooks",
    "http",
    "scheduledTasks",
    "queueWorkers",
    "nodes",
    "serviceTypes",
    "coreTypeProperties",
    "rpc",
    "functions",
];

fn testdata() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../inspector-go/testdata")
}

fn source_files(root: &Path, src_dirs: &[String]) -> Vec<String> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<String>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let mut entries: Vec<_> = rd.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if p.is_dir() {
                if p != base && (name.starts_with('.') || name == "node_modules" || name == "dist") {
                    continue;
                }
                walk(base, &p, out);
            } else if !name.starts_with('.') && name.ends_with(".ts") && !name.ends_with(".test.ts") && !name.ends_with(".spec.ts") {
                out.push(p.to_string_lossy().to_string());
            }
        }
    }
    let mut out = Vec::new();
    for d in src_dirs {
        let base = root.join(d);
        walk(&base, &base, &mut out);
    }
    out
}

fn strip(state: &mut Value) {
    if let Some(meta) = state.pointer_mut("/functions/meta").and_then(Value::as_object_mut) {
        for (_, m) in meta.iter_mut() {
            if let Some(o) = m.as_object_mut() {
                for k in ["singletonServicesOnly", "contractHash", "inputHash", "outputHash"] {
                    o.shift_remove(k);
                }
            }
        }
    }
    if let Some(http) = state.pointer_mut("/http/meta").and_then(Value::as_object_mut) {
        for (_, routes) in http.iter_mut() {
            if let Some(routes) = routes.as_object_mut() {
                for (_, r) in routes.iter_mut() {
                    if let Some(o) = r.as_object_mut() {
                        o.shift_remove("requiresSession");
                    }
                }
            }
        }
    }
}

fn check_fixture(name: &str, skip: &[&str]) {
    let root = testdata().join(name).canonicalize().unwrap();
    let config: Value = serde_json::from_slice(&std::fs::read(root.join("pikku.config.json")).unwrap()).unwrap();
    let src: Vec<String> =
        config["srcDirectories"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
    let tsconfig = root.join(config["tsconfig"].as_str().unwrap());
    let root_s = root.to_string_lossy().to_string();
    let req = Request {
        route_files: source_files(&root, &src),
        options: Options {
            root_dir: root_s.clone(),
            tsconfig: tsconfig.to_string_lossy().to_string(),
            is_addon: config["addon"].as_bool().unwrap_or(false),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap_or_else(|e| panic!("{name}: {e}"));
    let text = pikku_inspect::jsjson::to_string(res.state.as_ref().unwrap().as_ref()).unwrap().replace(&root_s, "<fixture>");
    let mut got: Value = serde_json::from_str(&text).unwrap();
    let golden: Value = serde_json::from_slice(&std::fs::read(root.join("inspect.golden.json")).unwrap()).unwrap();
    let mut want = golden["state"].clone();
    strip(&mut got);
    strip(&mut want);
    for key in OWNED_KEYS {
        if skip.contains(key) {
            continue;
        }
        // The golden's unique type names hash the fixture path; mask both sides.
        let g = mask_hashes(got.get(*key).unwrap_or(&Value::Null).to_string());
        let w = mask_hashes(want.get(*key).unwrap_or(&Value::Null).to_string());
        assert_eq!(g, w, "{name}: state.{key} differs from Go's golden");
    }
}

fn mask_hashes(s: String) -> String {
    // `<Name>_<12 hex>` -> `<Name>_<pathhash>`
    let b = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'_' && i + 13 <= b.len() && b[i + 1..i + 13].iter().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) && !b.get(i + 13).is_some_and(|c| c.is_ascii_alphanumeric() || *c == b'_') {
            out.push_str("_<pathhash>");
            i += 13;
        } else {
            out.push(b[i] as char);
            i += 1;
        }
    }
    out
}

#[test]
fn nodes_fixture() {
    check_fixture("nodes", &[]);
}

#[test]
fn hidden_factory_fixture() {
    check_fixture("hidden-factory", &[]);
}

#[test]
fn governance_fixture() {
    check_fixture("governance", &[]);
}

#[test]
fn permissions_in_body_fixture() {
    check_fixture("permissions-in-body", &[]);
}

#[test]
fn classification_fixture() {
    check_fixture("classification", &[]);
}
