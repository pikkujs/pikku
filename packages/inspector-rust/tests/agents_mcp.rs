//! Port of Go `cmd/pikku-inspect/agents_mcp_test.go`, plus the fixture's golden
//! (`inspect.golden.json`) for the keys the channel, CLI, gateway, MCP and agent
//! groups own. `testdata/agents-mcp` is self-contained (local stand-ins for the
//! `#pikku` wrappers), so it needs no install or codegen.

use std::path::{Path, PathBuf};

use pikku_inspect::analyze;
use pikku_inspect::protocol::{Options, Request, Response};
use serde_json::Value;

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../inspector-go/testdata/agents-mcp").canonicalize().unwrap()
}

fn source_files(dir: &Path, out: &mut Vec<String>) {
    let mut entries: Vec<_> = std::fs::read_dir(dir).unwrap().flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let p = e.path();
        if p.is_dir() {
            source_files(&p, out);
        } else if p.to_string_lossy().ends_with(".ts") {
            out.push(p.to_string_lossy().to_string());
        }
    }
}

fn inspect() -> (Response, Value, String) {
    let root = fixture_root();
    let root_s = root.to_string_lossy().to_string();
    let mut files = Vec::new();
    source_files(&root.join("src"), &mut files);
    let req = Request {
        route_files: files,
        options: Options {
            root_dir: root_s.clone(),
            tsconfig: root.join("tsconfig.json").to_string_lossy().to_string(),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap();
    let state: Value = serde_json::from_str(&pikku_inspect::jsjson::to_string(res.state.as_ref().unwrap().as_ref()).unwrap()).unwrap();
    (res, state, root_s)
}

fn assert_diagnostics(res: &Response, want: &[&str]) {
    for w in want {
        assert!(res.diagnostics.iter().any(|d| d.message.starts_with(w)), "missing diagnostic {w:?}");
    }
}

#[test]
fn agents_and_scorers() {
    let (res, st, _) = inspect();
    let agents = &st["agents"]["agentsMeta"];
    let shop = &agents["shopAgent"];
    assert!(shop.is_object(), "shopAgent missing: {:?}", agents.as_object().map(|o| o.keys().collect::<Vec<_>>()));
    assert_eq!(shop["tools"].to_string(), r#"["lookupItem","searchItems","external","workflow:checkout"]"#);
    assert_eq!(shop["workflows"].to_string(), r#"["reviewFlow","unnamedGraph","refFlow"]"#);
    // JS key order: integer-like keys first; `as const` unwrapped.
    assert_eq!(
        shop["providerOptions"].to_string(),
        r#"{"openai":{"reasoningEffort":"high","tags":["a",1,true,null],"n":-2},"x-y":{"1":"one"}}"#
    );
    assert_eq!(shop["maxSteps"].to_string(), "5");
    assert_eq!(shop["toolChoice"].to_string(), r#""auto""#);
    assert!(st["rpc"]["internalFiles"].get("lookupItem").is_some() || st["rpc"]["internalFiles"].to_string().contains("lookupItem"));
    assert!(st["workflows"]["invokedWorkflows"].to_string().contains("refFlow"));
    let computed = &agents["computedAgent"];
    assert!(computed.is_object() && computed.get("providerOptions").is_none());
    assert_eq!(computed["maxSteps"].to_string(), r#""computed as unknown as number""#);
    for k in ["noDescriptionAgent", "noNameAgent", "disabledAgent"] {
        assert!(agents.get(k).is_none(), "{k} should not be registered");
    }

    let scorers = &st["scorers"]["scorersMeta"];
    assert!(scorers["namesAProduct"].to_string().contains(r#""lane":"fast","sampleRate":0.25,"requiresReference":true"#));
    assert!(scorers["answersTheShopper"].to_string().contains(r#""lane":"slow","sampleRate":1,"requiresReference":false"#));
    assert!(scorers.get("badRate").is_none(), "badRate has an out-of-range sampleRate and must be rejected");

    assert_diagnostics(
        &res,
        &[
            "AI scorer 'badRate' has a sampleRate of 1.5 \u{2014} it is the fraction of live runs to grade, so it must be between 0 and 1.",
            "AI agent 'computed' has a 'providerOptions' the inspector cannot read statically",
            "AI agent 'shop-assistant' lists a scorer that is not an inline string: `scorerName`.",
            "AI agent 'computed' has invalid 'tags' property - must be an array of strings.",
        ],
    );
}

#[test]
fn mcp_endpoints() {
    let (res, st, _) = inspect();
    let mcp = &st["mcpEndpoints"];
    let tools: Vec<&String> = mcp["toolsMeta"].as_object().unwrap().keys().collect();
    assert_eq!(serde_json::to_string(&tools).unwrap(), r#"["undocumentedTool","echo-text"]"#);
    let tool = &mcp["toolsMeta"]["echo-text"];
    assert!(tool["pikkuFuncId"] == "labelledTool" && tool["outputSchema"] == "MCPToolResponse", "echo-text = {tool}");
    let inline = &mcp["resourcesMeta"]["inline/{id}"];
    assert!(inline["pikkuFuncId"] == "mcp:resource:inline/{id}" && inline["streaming"] == true, "inline resource = {inline}");
    assert_eq!(st["functions"]["meta"]["mcp:resource:inline/{id}"]["functionType"], "inline");
    assert_eq!(mcp["promptsMeta"]["summarise"]["arguments"].to_string(), "[]");
    assert_diagnostics(
        &res,
        &[
            "MCP tool 'undocumentedTool' is missing a description.",
            "MCP resource 'untitled' is missing the required 'title' property.",
            "No valid 'func' property for MCP resource 'nofunc'.",
            "MCP prompt 'undescribed' is missing a description.",
        ],
    );
}

/// The keys the channel, CLI, gateway, MCP and agent groups write must equal
/// Go's golden for the fixture (the golden is finalized: finalize-only fields
/// are not compared because none of these sections receive any).
#[test]
fn owned_keys_equal_the_golden() {
    let (_, st, root) = inspect();
    let golden: Value = serde_json::from_slice(&std::fs::read(fixture_root().join("inspect.golden.json")).unwrap()).unwrap();
    for key in ["channels", "gateways", "cli", "agents", "scorers", "mcpEndpoints"] {
        let got = st.get(key).unwrap_or(&Value::Null).to_string().replace(&root, "<fixture>");
        let want = golden["state"].get(key).unwrap_or(&Value::Null).to_string();
        assert_eq!(got, want, "state.{key} differs from Go's golden");
    }
}
