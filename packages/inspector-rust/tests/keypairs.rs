//! The `keypairs` and `secret-generate` fixtures are shared with Go (`inspector-go/testdata`).
//! Every `defineKeyPair` field has to reach `state.keyPairs`, and
//! `defineSecret` has to carry `generate` and accept `rotationPeriod: 'never'`.

use std::path::{Path, PathBuf};

use pikku_inspect::analyze;
use pikku_inspect::protocol::{Options, Request, Response};
use serde_json::Value;

fn root(fixture: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../inspector-go/testdata").join(fixture).canonicalize().unwrap()
}

fn inspect(fixture: &str, files: &[&str]) -> (Response, Value) {
    let root = root(fixture);
    let req = Request {
        route_files: files.iter().map(|f| root.join(f).to_string_lossy().to_string()).collect(),
        options: Options {
            root_dir: root.to_string_lossy().to_string(),
            tsconfig: root.join("tsconfig.json").to_string_lossy().to_string(),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap();
    let state: Value = serde_json::from_str(&pikku_inspect::jsjson::to_string(res.state.as_ref().unwrap().as_ref()).unwrap()).unwrap();
    (res, state)
}

#[test]
fn every_key_pair_field_reaches_state() {
    let (res, st) = inspect("keypairs", &["src/keys.ts"]);
    let defs = st["keyPairs"]["definitions"].as_array().expect("state.keyPairs.definitions");
    assert_eq!(defs.len(), 3, "the nameless one is an error: {defs:?}");
    let full = &defs[0];
    for (k, v) in [
        ("name", "console-auth"),
        ("displayName", "Console auth"),
        ("description", "Signs console tokens"),
        ("algorithm", "rs256"),
        ("purpose", "signing"),
        ("rotationPeriod", "90day"),
        ("verifyGrace", "1d"),
        ("signedLifetime", "1h"),
        ("scope", "keyed"),
        ("custody", "wrapped"),
        ("public", "jwks"),
        ("signedFormat", "jws"),
        ("docsUrl", "https://example.com/keys"),
    ] {
        assert_eq!(full[k], v, "field {k} lost");
    }
    // rotationMode is read so that validation can refuse it by name
    assert_eq!(defs[1]["rotationPeriod"], "never");
    assert_eq!(defs[1]["rotationMode"], "pinned");
    // a non-literal is passed as its text for validation to refuse
    assert_eq!(defs[2]["algorithm"], "ALGORITHM");
    assert_eq!(st["keyPairs"]["files"].as_array().unwrap().len(), 1);
    assert!(res.diagnostics.iter().any(|d| d.message.starts_with("Key pair is missing the required 'name'")));
}

#[test]
fn define_secret_carries_generate_and_accepts_never() {
    let (res, st) = inspect("secret-generate", &["src/secrets.ts"]);
    assert!(res.diagnostics.is_empty(), "rotationPeriod 'never' was refused: {:?}", res.diagnostics.iter().map(|d| &d.message).collect::<Vec<_>>());
    let defs = st["secrets"]["definitions"].as_array().unwrap();
    assert_eq!(defs.len(), 1);
    assert_eq!(defs[0]["rotationPeriod"], "never");
    assert_eq!(defs[0]["generate"], serde_json::json!({ "size": 32 }), "generate lost");
}
