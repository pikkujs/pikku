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

#[test]
fn wire_rules_fixture() {
    // queueWorkers is derived from workflows in finalize, which this harness skips.
    check_fixture("wire-rules", &["queueWorkers"]);
}

/// The diagnostics of `wire-rules` must match Go's byte for byte
/// (inspector-go/internal/analyze/classification_test.go `wireRulesWant`).
#[test]
fn wire_rules_diagnostics() {
    let root = testdata().join("wire-rules").canonicalize().unwrap();
    let req = Request {
        route_files: source_files(&root, &["src".to_string()]),
        options: Options {
            root_dir: root.to_string_lossy().to_string(),
            tsconfig: root.join("tsconfig.json").to_string_lossy().to_string(),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap();
    let mut got: Vec<String> = res
        .diagnostics
        .iter()
        .filter(|d| matches!(d.code.as_deref(), Some("PKU941" | "PKU942" | "PKU943")))
        .map(|d| {
            assert_eq!(format!("{:?}", d.level), "Critical", "{:?} must be critical", d.code);
            format!("{} {}", d.code.as_deref().unwrap(), d.message)
        })
        .collect();
    got.sort();
    let tail = " \u{2014} a wire stays bound to the function. What the callee does with it is invisible to the inspector (gates, wiring, rpc and workflow edges), so nothing can check it. Make the call in the handler itself, or pass plain data.";
    let mut want = vec![
        "PKU941 \u{2022} computedNames calls rpc.invoke(name) with a computed name \u{2014} the deploy planner cannot bind its unit to the callee's, so the call fails with \"No service binding\" if the two are deployed apart. Use a literal RPC name.".to_string(),
        "PKU941 \u{2022} computedNames calls rpc.mesh(`x:${name}`) with a computed name \u{2014} the deploy planner cannot bind its unit to the callee's, so the call fails with \"No service binding\" if the two are deployed apart. Use a literal RPC name.".to_string(),
        "PKU941 \u{2022} computedNames calls rpc.startWorkflow(name) with a computed name \u{2014} the deploy planner cannot bundle that workflow's meta into computedNames's unit, so the deployed call fails with \"Workflow not found\" unless the unit has it for another reason. Use a literal workflow name.".to_string(),
    ];
    for (f, w, c) in [
        ("leaksWires", "the wire", "helper"),
        ("leaksWires", "wire.rpc", "helper"),
        ("leaksWires", "wire.channel", "helper"),
        ("leaksWires", "wire.http", "helper"),
        ("leaksWires", "wire.workflow", "helper"),
        ("leaksWires", "wire.rpc", "util.run"),
        ("leaksWires", "wire.rpc", "new Keeper"),
        ("leaksDestructured", "wire.rpc", "helper"),
        ("closures", "wire.rpc", "helper"),
        ("localForwards", "wire.rpc", "helper"),
        ("callsModuleHelper", "wire.rpc", "moduleHelper"),
        ("callsUserHelper", "wire.rpc", "helper"),
        ("callsUnresolved", "wire.rpc", "untyped.run"),
        ("callsUnresolved", "wire.rpc", "untyped['run']"),
        ("callsWrapper", "wire.rpc", "wrapper"),
    ] {
        want.push(format!("PKU942 \u{2022} {f} passes {w} to {c}(){tail}"));
    }
    want.push("PKU943 \u{2022} Workflow 'templateStep' calls workflow.do(`prefix:${data.name}`) with an rpc name the inspector cannot read. The step would be missing from the workflow graph, so it cannot be replayed, migrated or found by `pikku graph`. Use a string literal or a const of one.".to_string());
    want.sort();
    assert_eq!(got, want);
}
