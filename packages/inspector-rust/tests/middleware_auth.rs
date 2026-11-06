//! Port of Go's `analyze/global_permission_test.go`, the registration cases of
//! `analyze/aliased_registrations_test.go`, and a check of the state keys the
//! middleware / permission / auth / scope / system-role / keyed groups own
//! against `inspector-go/testdata/*/inspect.golden.json`.

use std::path::{Path, PathBuf};

use pikku_inspect::analyze;
use pikku_inspect::diag::Level;
use pikku_inspect::protocol::{Options, Request, Response};
use serde_json::Value;

fn inspect_files(files: &[(&str, &[&str])]) -> Response {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let root = std::env::temp_dir()
        .join(format!(".tmp-middleware-auth-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::SeqCst)));
    std::fs::create_dir_all(&root).unwrap();
    let mut paths = Vec::new();
    for (name, lines) in files {
        let p = root.join(name);
        std::fs::write(&p, lines.join("\n")).unwrap();
        paths.push(p.to_string_lossy().to_string());
    }
    let req = Request {
        route_files: paths,
        options: Options { root_dir: root.to_string_lossy().to_string(), ..Default::default() },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap_or_else(|e| panic!("{e}"));
    let _ = std::fs::remove_dir_all(&root);
    res
}

fn registrations(res: &Response) -> Vec<(Option<String>, Vec<String>)> {
    res.state.as_ref().unwrap().permissions.global.iter().map(|g| (g.export_name.clone(), g.definition_ids.clone())).collect()
}

fn warnings(res: &Response) -> Vec<String> {
    res.diagnostics.iter().filter(|d| d.level == Level::Warn).map(|d| d.message.clone()).collect()
}

#[test]
fn global_permission_top_level_registration() {
    let res = inspect_files(&[(
        "security.ts",
        &[
            "import { addGlobalPermission, pikkuPermission } from '#pikku/auth'",
            "addGlobalPermission([",
            "  pikkuPermission(async ({ kysely }, _data, { session }) => !!session && !!kysely),",
            "])",
        ],
    )]);
    let st = res.state.as_ref().unwrap();
    assert_eq!(st.permissions.global.len(), 1);
    let g = &st.permissions.global[0];
    assert!(g.source_file.ends_with("security.ts") && g.export_name.is_none() && g.definition_ids.len() == 1);
    let def = st.permissions.definitions.get(&g.definition_ids[0]).expect("definition");
    assert_eq!(def.services.services, ["kysely"]);
    for d in &res.diagnostics {
        assert!(d.level == Level::Debug, "an inline permission in the global array is not an unassigned one: {}", d.message);
    }
}

#[test]
fn global_permission_factory_and_references() {
    let res = inspect_files(&[(
        "security.ts",
        &[
            "import { addGlobalPermission as everywhere, pikkuAuth } from '#pikku/auth'",
            "export const signedIn = pikkuAuth(async (_s, session) => !!session)",
            "export const globalGate = () => everywhere([signedIn])",
        ],
    )]);
    assert_eq!(registrations(&res), [(Some("globalGate".to_string()), vec!["signedIn".to_string()])]);
}

const HEADER: [&str; 2] = [
    "import { addGlobalPermission, pikkuAuth } from '#pikku/auth'",
    "export const signedIn = pikkuAuth(async (_s, session) => !!session)",
];

fn with_header(lines: &[&str]) -> Vec<String> {
    HEADER.iter().chain(lines.iter()).map(|s| s.to_string()).collect()
}

fn inspect_one(lines: Vec<String>) -> Response {
    let refs: Vec<&str> = lines.iter().map(String::as_str).collect();
    inspect_files(&[("security.ts", &refs)])
}

#[test]
fn global_permission_factory_shapes() {
    let cases: [(&str, &[&str], Option<&str>); 4] = [
        ("block-bodied exported arrow", &["export const globalGate = () => {", "  addGlobalPermission([signedIn])", "}"], Some("globalGate")),
        ("exported function declaration", &["export function globalGate() {", "  addGlobalPermission([signedIn])", "}"], Some("globalGate")),
        (
            "function exported through an export list",
            &["function globalGate() {", "  addGlobalPermission([signedIn])", "}", "export { globalGate }"],
            Some("globalGate"),
        ),
        ("function invoked where it is written", &[";(() => {", "  addGlobalPermission([signedIn])", "})()"], None),
    ];
    for (label, lines, want) in cases {
        let res = inspect_one(with_header(lines));
        assert_eq!(registrations(&res), [(want.map(String::from), vec!["signedIn".to_string()])], "{label}");
        assert!(warnings(&res).is_empty(), "{label}: {:?}", warnings(&res));
    }
}

#[test]
fn global_permission_unreachable() {
    let cases: [(&str, &[&str]); 3] = [
        ("not exported", &["function gate() {", "  addGlobalPermission([signedIn])", "}"]),
        ("takes a parameter", &["export const gate = (flag: boolean) => {", "  if (flag) addGlobalPermission([signedIn])", "}"]),
        ("default export", &["export default function () {", "  addGlobalPermission([signedIn])", "}"]),
    ];
    for (label, lines) in cases {
        let res = inspect_one(with_header(lines));
        assert!(registrations(&res).is_empty(), "{label}");
        let w = warnings(&res);
        assert!(w.len() == 1 && w[0].contains("NOT registered"), "{label}: {w:?}");
    }
}

#[test]
fn global_permission_argument_in_a_variable() {
    let want = [(None, vec!["audited".to_string()])];
    let res = inspect_files(&[(
        "security.ts",
        &[
            "import { addGlobalPermission, pikkuPermission } from '#pikku/auth'",
            "export const audited = pikkuPermission(async ({ auditLog }) => !!auditLog)",
            "const gates = [audited] as const",
            "addGlobalPermission(gates)",
        ],
    )]);
    assert_eq!(registrations(&res), want);
    assert!(warnings(&res).is_empty());

    let res = inspect_files(&[
        (
            "gates.ts",
            &[
                "import { pikkuPermission } from '#pikku/auth'",
                "export const audited = pikkuPermission(async ({ auditLog }) => !!auditLog)",
                "export const gates = { audited }",
            ],
        ),
        (
            "security.ts",
            &[
                "import { addGlobalPermission } from '#pikku/auth'",
                "import { gates } from './gates'",
                "addGlobalPermission(gates)",
            ],
        ),
    ]);
    assert_eq!(registrations(&res), want);
    assert!(warnings(&res).is_empty());
}

#[test]
fn global_permission_argument_it_cannot_follow() {
    let res = inspect_files(&[(
        "security.ts",
        &[
            "import { addGlobalPermission } from '#pikku/auth'",
            "declare const build: () => never[]",
            "addGlobalPermission(build())",
        ],
    )]);
    let w = warnings(&res);
    assert!(w.len() == 1 && w[0].contains("cannot be seen"), "{w:?}");
}

#[test]
fn aliased_tag_middleware_registers() {
    let res = inspect_files(&[(
        "gate.ts",
        &[
            "import { addTagMiddleware as guard, pikkuMiddleware as mw } from '#pikku'",
            "export const lockGate = () =>",
            "  guard('todos', [mw(async (_s, _w, next) => next())])",
        ],
    )]);
    let g = res.state.as_ref().unwrap().middleware.tag_middleware.get("todos").expect("todos tag").clone();
    assert_eq!(g.count, 1);
    assert_eq!(g.export_name.as_deref(), Some("lockGate"));
}

#[test]
fn namespaced_tag_middleware_registers() {
    let res = inspect_files(&[(
        "gate.ts",
        &[
            "import * as pikku from '#pikku'",
            "export const lockGate = () =>",
            "  pikku.addTagMiddleware('todos', [",
            "    pikku.pikkuMiddleware(async (_s, _w, next) => next()),",
            "  ])",
        ],
    )]);
    assert_eq!(res.state.as_ref().unwrap().middleware.tag_middleware.get("todos").map(|g| g.count), Some(1));
}

#[test]
fn aliased_route_and_global_middleware_register() {
    let res = inspect_files(&[(
        "gates.ts",
        &[
            "import { addHTTPMiddleware as onRoute, addGlobalMiddleware as everywhere, pikkuMiddleware } from '#pikku'",
            "const pass = pikkuMiddleware(async (_s, _w, next) => next())",
            "export const routeGate = () => onRoute('/admin/*', [pass])",
            "everywhere([pass])",
        ],
    )]);
    let st = res.state.as_ref().unwrap();
    assert!(st.http.route_middleware.has("/admin/*"));
    assert_eq!(st.middleware.global_files.len(), 1);
}

#[test]
fn const_bound_helper_registers() {
    let res = inspect_files(&[(
        "gate.ts",
        &[
            "import { addTagMiddleware, pikkuMiddleware } from '#pikku'",
            "const guard = addTagMiddleware",
            "export const lockGate = () =>",
            "  guard('todos', [pikkuMiddleware(async (_s, _w, next) => next())])",
        ],
    )]);
    assert!(res.state.as_ref().unwrap().middleware.tag_middleware.has("todos"));
}

#[test]
fn scopes_roles_and_keyed_definitions_are_recorded() {
    let res = inspect_files(&[(
        "gov.ts",
        &[
            "import { defineScope, defineSystemRole } from '#pikku'",
            "defineScope({ todos: { displayName: 'Todos', scopes: { read: { description: 'Read' } } } })",
            "defineScope({ 'bad:name': { displayName: 'x' } })",
            "defineSystemRole({ admin: { scopes: ['todos'] }, broken: {} })",
        ],
    )]);
    let st = res.state.as_ref().unwrap();
    let mut def = st.scopes.definitions[0].value().unwrap().clone();
    assert!(def.as_object_mut().unwrap().remove("sourceFile").is_some());
    assert_eq!(
        def,
        serde_json::json!({"name":"todos","displayName":"Todos","scopes":{"read":{"description":"Read"}},"origin":{"kind":"app"}})
    );
    assert_eq!(st.scopes.definitions.len(), 1);
    assert_eq!(st.system_roles.definitions.len(), 1);
    let msgs: Vec<_> = res.diagnostics.iter().filter(|d| d.level == Level::Critical).map(|d| d.message.as_str()).collect();
    assert!(msgs.iter().any(|m| m.contains("Scope segment 'bad:name'")), "{msgs:?}");
    assert!(msgs.iter().any(|m| m.contains("System role 'broken' has no 'scopes'")), "{msgs:?}");
}

// ---- goldens ---------------------------------------------------------

const OWNED_KEYS: &[&str] = &[
    "middleware",
    "middlewareGroupsMeta",
    "channelMiddleware",
    "agentMiddleware",
    "permissions",
    "permissionsGroupsMeta",
    "auth",
    "scopes",
    "systemRoles",
    "credentials",
    "secrets",
    "variables",
];

fn testdata() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../inspector-go/testdata")
}

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
        } else if !name.starts_with('.') && name.ends_with(".ts") && !name.ends_with(".test.ts") {
            out.push(p.to_string_lossy().to_string());
        }
    }
}

fn check_fixture(name: &str) {
    let root = testdata().join(name).canonicalize().unwrap();
    let config: Value = serde_json::from_slice(&std::fs::read(root.join("pikku.config.json")).unwrap()).unwrap();
    let mut files = Vec::new();
    for d in config["srcDirectories"].as_array().unwrap() {
        let base = root.join(d.as_str().unwrap());
        walk(&base, &base, &mut files);
    }
    let root_s = root.to_string_lossy().to_string();
    let req = Request {
        route_files: files,
        options: Options {
            root_dir: root_s.clone(),
            tsconfig: root.join(config["tsconfig"].as_str().unwrap()).to_string_lossy().to_string(),
            is_addon: config["addon"].as_bool().unwrap_or(false),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap_or_else(|e| panic!("{name}: {e}"));
    let text = pikku_inspect::jsjson::to_string(res.state.as_ref().unwrap().as_ref()).unwrap().replace(&root_s, "<fixture>");
    let got: Value = serde_json::from_str(&text).unwrap();
    let mut golden: Value = serde_json::from_slice(&std::fs::read(root.join("inspect.golden.json")).unwrap()).unwrap();
    // The golden is finalized: applyDeclaredScopes appends the scopes that
    // declareScopes named but nothing defined (they carry no `origin`).
    if let Some(defs) = golden.pointer_mut("/state/scopes/definitions").and_then(Value::as_array_mut) {
        defs.retain(|d| d.get("origin").is_some());
    }
    for key in OWNED_KEYS {
        let g = got.get(*key).unwrap_or(&Value::Null).to_string();
        let w = golden["state"].get(*key).unwrap_or(&Value::Null).to_string();
        assert_eq!(g, w, "{name}: state.{key} differs from Go's golden");
    }
}

#[test]
fn governance_fixture() {
    check_fixture("governance");
}

#[test]
fn classification_fixture() {
    check_fixture("classification");
}

#[test]
fn permissions_in_body_fixture() {
    check_fixture("permissions-in-body");
}

#[test]
fn nodes_fixture() {
    check_fixture("nodes");
}
