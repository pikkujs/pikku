//! A schema for an interface that extends another type. tsrs parses the
//! heritage elements of an interface as type references, where Go's
//! typescript-go has ExpressionWithTypeArguments; reading them as the latter
//! panicked in the schema generator (found by the real-CLI parity run on
//! packages/addon/pikku-console). Expected values are what Go produces for the
//! same fixture.

use std::path::{Path, PathBuf};

use pikku_inspect::analyze;
use pikku_inspect::protocol::{Options, Request, SchemaConfig};
use serde_json::Value;

fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/interface_extends").canonicalize().unwrap()
}

#[test]
fn interface_extends_converts_to_a_schema() {
    let root = fixture();
    let tsconfig = root.join("tsconfig.json").to_string_lossy().to_string();
    let req = Request {
        route_files: vec![root.join("src/types.ts").to_string_lossy().to_string()],
        options: Options {
            root_dir: root.to_string_lossy().to_string(),
            tsconfig: tsconfig.clone(),
            schema_config: Some(SchemaConfig {
                tsconfig,
                ..Default::default()
            }),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap_or_else(|e| panic!("{e}"));
    let text = pikku_inspect::jsjson::to_string(res.state.as_ref().unwrap().as_ref()).unwrap();
    let state: Value = serde_json::from_str(&text).unwrap();
    let input = &state["schemas"]["ReadOutInput"];
    // Go's output for the same fixture.
    let want: Value = serde_json::from_str(
        r##"{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"out":{"$ref":"#/definitions/Out"},"items":{"$ref":"#/definitions/Items"}},"required":["out","items"],"additionalProperties":false,"definitions":{"Out":{"type":"object","properties":{"a":{"type":"string"},"b":{"type":"number"}},"required":["a","b"],"additionalProperties":false},"Items":{"type":"array","items":{"type":"string"}}}}"##,
    )
    .unwrap();
    assert_eq!(input.to_string(), want.to_string());

    // An interface extending a type that resolves to nothing fails in Go (with a
    // Go runtime error and stack, which cannot be reproduced) and gets no schema.
    let names: Vec<&str> = state["schemas"].as_object().unwrap().keys().map(String::as_str).collect();
    assert_eq!(names, ["ReadOutInput", "ReadOutOutput", "ReadOrphanOutput"]);
    let diags = serde_json::to_value(&res.diagnostics).unwrap().to_string();
    assert!(diags.contains("Error generating schema: ReadOrphanInput"), "{diags}");
}
