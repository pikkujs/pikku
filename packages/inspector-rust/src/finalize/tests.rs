//! Go's own finalize tests (internal/finalize/*_test.go), as the expected
//! values. The global-permission test, which analyzes real source, is left to
//! the visitor ports.

use super::contracts::*;
use super::jsval::V;
use super::*;
use crate::diag::{codes, Level};
use crate::state::{AuthDefinition, FunctionMeta, Map, Raw, Strings};

fn parse(s: &str) -> V {
    V::from_json(&serde_json::from_str(s).unwrap())
}

fn raw(s: &str) -> Raw {
    Raw::of(serde_json::from_str(s).unwrap())
}

fn fn_meta(f: impl FnOnce(&mut FunctionMeta)) -> FunctionMeta {
    let mut m = FunctionMeta::default();
    f(&mut m);
    m
}

#[test]
fn to_kebab() {
    for (input, want) in [
        ("checkoutWorkflow", "checkout-workflow"),
        ("refundOrderWorkflow", "refund-order-workflow"),
        ("HTTPServerStep", "http-server-step"),
        ("step2Done", "step2-done"),
        ("plain", "plain"),
    ] {
        assert_eq!(utils::to_kebab(input), want, "{input}");
    }
}

#[test]
fn prose_opens_with_virtual_user() {
    for (prose, user, want) in [
        ("Alice opens the cart", "Alice", true),
        ("alice opens the cart", "Alice", true),
        ("  \u{201c}Alice\u{2019}s cart is empty", "Alice", true),
        (" Alice's cart", "Alice", true),
        ("Alicey opens the cart", "Alice", false),
        ("Then Alice opens the cart", "Alice", false),
        ("A.B. pays", "A.B.", false), // \b after a non-word char needs a word char next
        ("Alice opens", "", false),
    ] {
        assert_eq!(scenarios::prose_opens_with_virtual_user(prose, user), want, "{prose:?} / {user:?}");
    }
}

#[test]
fn template_value() {
    let t = |s: &str| if s.is_empty() { V::Undef } else { parse(s) }.template_string();
    assert_eq!(t(""), "undefined");
    assert_eq!(t(r#""x""#), "x");
    assert_eq!(t(r#"{"a":1}"#), "[object Object]");
    assert_eq!(t(r#"["a",null,1,true]"#), "a,,1,true");
    assert_eq!(t("null"), "null");
    assert_eq!(t("12"), "12");
    assert_eq!(t("false"), "false");
}

#[test]
fn apply_declared_scopes_and_flatten() {
    let mut st = State::new(".");
    st.scopes.definitions = vec![raw(r#"{"name":"orders","scopes":{"read":{}}}"#)];
    let mut declared: Map<String> = Map::new();
    declared.set("orders:write", "a.ts".to_string());
    declared.set("billing:invoices:read", "b.ts".to_string());
    declared.set("orders:read", "c.ts".to_string());
    st.scopes.declared = Some(declared);

    scopes::apply_declared_scopes(&mut st);

    assert_eq!(st.scopes.definitions.len(), 2);
    let billing = jv(&st.scopes.definitions[1]);
    assert_eq!(billing.get("name").as_str(), Some("billing"));
    assert_eq!(billing.get("sourceFile").as_str(), Some("b.ts"));
    assert_eq!(
        serde_json::to_string(&st.scopes.definitions[0]).unwrap(),
        r#"{"name":"orders","scopes":{"read":{},"write":{}}}"#
    );
}

#[test]
fn is_package_resolvable() {
    let root = std::env::temp_dir().join(format!("pikku-finalize-resolve-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let write = |rel: &str, body: &str| {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, body).unwrap();
    };
    write("node_modules/@scope/dep/package.json", r#"{"name":"@scope/dep"}"#);
    write("node_modules/plain.js", "");
    write("app/package.json", r#"{"name":"@me/app","exports":{".":"./index.js"}}"#);
    write("lib/package.json", r#"{"name":"@me/lib"}"#);
    let (app, lib) = (root.join("app").to_string_lossy().to_string(), root.join("lib").to_string_lossy().to_string());

    let s = |v: &[&String]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    assert!(addons::is_package_resolvable("@scope/dep", &s(&[&app]))); // found walking up from app
    assert!(addons::is_package_resolvable("plain", &s(&[&app])));
    assert!(addons::is_package_resolvable("@me/app", &s(&[&app]))); // self-reference through exports
    assert!(!addons::is_package_resolvable("@me/lib", &s(&[&lib]))); // no exports, no self-reference
    assert!(!addons::is_package_resolvable("missing", &s(&[&app, &lib])));
    let _ = std::fs::remove_dir_all(&root);
}

fn convert(input: &str) -> Result<String, String> {
    openapi_convert::convert_schema_to_openapi(&parse(input)).and_then(|v| v.stringify())
}

// Expected outputs are @openapi-contrib/json-schema-to-openapi-schema 4.3.4's,
// called as serialize-openapi-json.ts calls it.
#[test]
fn convert_schema_to_openapi() {
    let cases = [
        (
            r##"{"$schema":"http://json-schema.org/draft-07/schema#","type":["string","null"],"const":"x","examples":["a"]}"##,
            r#"{"type":"string","nullable":true,"enum":["x"],"example":"a"}"#,
        ),
        (
            r##"{"type":"object","properties":{"a":{"$ref":"#/definitions/A"},"b":{"$ref":"#/definitions/A"}},"definitions":{"A":{"type":"number","exclusiveMinimum":3}},"patternProperties":{"^x":{"type":"string"}}}"##,
            r#"{"type":"object","properties":{"a":{"type":"number","exclusiveMinimum":true,"minimum":3},"b":{"type":"number","exclusiveMinimum":true,"minimum":3}},"definitions":{"A":{"type":"number","exclusiveMinimum":true,"minimum":3}},"x-patternProperties":{"^x":{"type":"string"}},"additionalProperties":true}"#,
        ),
        (
            r#"{"type":"array","if":{"type":"string"},"then":{"minLength":1},"dependencies":{"a":["b"]},"foo":1}"#,
            r#"{"type":"array","allOf":[{"oneOf":[{"not":{"required":["a"]}},{"required":["a","b"]}]}],"oneOf":[{"allOf":[{"type":"string"},{"minLength":1}]},{"allOf":[{"not":{"type":"string"}}]}],"items":{},"x-foo":1}"#,
        ),
        (
            r##"{"$ref":"#/definitions/R","definitions":{"R":{"type":"object","properties":{"x":{"$ref":"#/definitions/R/properties/y"},"y":{"type":"integer"}}}}}"##,
            r#"{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"integer"}},"definitions":{"R":{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"integer"}}}}}"#,
        ),
    ];
    for (input, want) in cases {
        assert_eq!(convert(input).unwrap(), want, "convert({input})");
    }
    // A recursive type dereferences into a cycle, which JSON.stringify then
    // refuses, as the TypeScript spec does.
    let err = convert(
        r##"{"type":"object","properties":{"o":{"$ref":"#/definitions/O"}},"definitions":{"O":{"type":"object","properties":{"m":{"$ref":"#/definitions/O"}}}}}"##,
    )
    .unwrap_err();
    assert!(err.contains("Converting circular structure to JSON"), "{err}");
    assert_eq!(convert(r#"{"type":"wat"}"#).unwrap_err(), r#"InvalidTypeError: Type "wat" is not a valid type"#);
}

#[test]
fn parse_versioned_id_cases() {
    for (id, base, version) in [("getItem", "getItem", None), ("getItem@v2", "getItem", Some(2)), ("a@b@v10", "a@b", Some(10)), ("getItem@vx", "getItem@vx", None)] {
        assert_eq!(parse_versioned_id(id), (base.to_string(), version), "{id}");
    }
}

fn entry(key: &str, version: i64, c: &str, i: &str, o: &str) -> ContractEntry {
    ContractEntry { function_key: key.into(), version, contract_hash: c.into(), input_hash: i.into(), output_hash: o.into() }
}

#[test]
fn validate_and_update_manifest() {
    let manifest = parse(
        r#"{"manifestVersion":1,"contracts":{
		"a":{"latest":1,"versions":{"1":"old"}},
		"b":{"latest":3,"versions":{"1":{"inputHash":"i","outputHash":"o"},"2":{"inputHash":"i","outputHash":"o"}}},
		"c":{"latest":1,"versions":{"1":"c1"}},
		"d":{"latest":2,"versions":{"2":"d2"}}}}"#,
    );
    let mut current = Contracts::default();
    current.set("a", entry("a", 1, "new", "ni", "no"));
    current.set("b@v2", entry("b", 2, "h", "i", "o"));
    current.set("c@v3", entry("c", 3, "c3", "x", "y"));
    current.set("d", entry("d", 1, "d1", "x", "y"));
    let msgs: Vec<String> = validate_contracts(&manifest, &current)
        .iter()
        .map(|e| format!("{} {}", e.get("code").template_string(), e.get("message").template_string()))
        .collect();
    assert_eq!(
        msgs,
        vec![
            "PKU861 Contract for a@v1 has changed (recorded: old, current: new). Existing versions are immutable.",
            "PKU864 Version 3 for c skips versions. Latest is 1, next must be 2.",
            "PKU863 Version 1 for d is <= latest (2) but not recorded. Possible merge conflict.",
            "PKU865 Manifest integrity error for b: latest field (3) inconsistent with version keys (max: 2).",
        ]
    );
    assert_eq!(
        update_manifest(&manifest, &current).stringify().unwrap(),
        r#"{"manifestVersion":1,"contracts":{"a":{"latest":1,"versions":{"1":{"inputHash":"ni","outputHash":"no"}}},"b":{"latest":3,"versions":{"1":{"inputHash":"i","outputHash":"o"},"2":{"inputHash":"i","outputHash":"o"}}},"c":{"latest":3,"versions":{"1":"c1","3":{"inputHash":"x","outputHash":"y"}}},"d":{"latest":2,"versions":{"1":{"inputHash":"x","outputHash":"y"},"2":"d2"}}}}"#
    );
}

#[test]
fn derive_workflow_plan() {
    let steps = |s: &str| convert_dsl_to_graph::steps_of(&parse(s));
    let (simple, _) = convert_dsl_to_graph::derive_workflow_plan(&steps(r#"[{"type":"rpc","stepName":"a","rpcName":"f"}]"#));
    assert!(simple, "a single rpc step should be simple");
    let (looped, _) = convert_dsl_to_graph::derive_workflow_plan(&steps(r#"[{"type":"fanout","stepName":"each","child":{"type":"rpc","stepName":"x","rpcName":"f"}}]"#));
    assert!(!looped, "a fanout step should not be simple");
}

// A remote function's callers are other services, so its contract is
// versioned like any other; only webhook receivers stay out.
#[test]
fn contracts_include_remote_functions() {
    let mut st = State::new("/tmp");
    st.functions.meta.set("remoteFunc", fn_meta(|m| {
        m.remote = Some(true);
        m.contract_hash = "remotehash123456".into();
    }));
    st.functions.meta.set("remoteFunc@v2", fn_meta(|m| {
        m.remote = Some(true);
        m.contract_hash = "remotehash654321".into();
    }));
    st.functions.meta.set("hook", fn_meta(|m| {
        m.webhook_receive = Some(true);
        m.contract_hash = "hookhash12345678".into();
    }));
    let extracted = extract_contracts_from_meta(&st);
    assert!(extracted.entries.contains_key("remoteFunc") && extracted.entries.contains_key("remoteFunc@v2"), "{:?}", extracted.ids);
    assert!(!extracted.entries.contains_key("hook"), "webhook receiver should not carry a contract");
    let e = &extracted.entries["remoteFunc@v2"];
    assert_eq!((e.function_key.as_str(), e.version), ("remoteFunc", 2));
    let built = build_current_contracts(&st);
    assert!(built.entries.contains_key("remoteFunc") && !built.entries.contains_key("hook"), "{:?}", built.ids);
}

fn admin_addon_state(blanket: bool) -> State {
    let mut st = State::new(".");
    let mut fns = crate::state::Record::new();
    let svc = |n: &str| fn_meta(|m| {
        m.services.optimized = true;
        m.services.services = vec![n.to_string()];
    });
    fns.set("listIncomingWebhookReceipts", svc("incomingWebhookService"));
    fns.set("listScopes", svc("scopeService"));
    if blanket {
        fns.set("ownStore", svc("addonOwnStore"));
        st.service_aggregation.used_functions.add("admin:ownStore");
    }
    st.addon_functions.set("admin", fns);
    st.addon_required_parent_services = Strings::from(["scopeService".to_string(), "incomingWebhookService".to_string()]);
    st.service_aggregation.used_functions.add("admin:listIncomingWebhookReceipts");
    st.service_aggregation.used_functions.add("admin:listScopes");
    st
}

#[test]
fn addon_forwarded_incoming_webhook_service_needs_a_webhook_wiring() {
    for blanket in [false, true] {
        let mut st = admin_addon_state(blanket);
        services::aggregate_required_services(&mut st);
        let required = &st.service_aggregation.required_services;
        assert!(!required.has("incomingWebhookService"), "blanket={blanket}: {:?}", required.values().collect::<Vec<_>>());
        assert!(required.has("scopeService"), "blanket={blanket}: scopeService dropped");
    }
}

#[test]
fn wired_incoming_webhooks_still_require_the_service() {
    let mut st = admin_addon_state(false);
    st.functions.meta.set("queue:pikku-incoming-webhooks", FunctionMeta::default());
    services::aggregate_required_services(&mut st);
    assert!(st.service_aggregation.required_services.has("incomingWebhookService"));
}

fn grant_state(decl: &str, with_auth: bool) -> State {
    let mut st = State::default();
    st.rpc.wire_addon_declarations.set("auth-addon", raw(decl));
    if with_auth {
        st.auth.definition = Some(AuthDefinition::default());
    }
    st
}

fn criticals(log: &Logger) -> Vec<crate::diag::Diagnostic> {
    log.entries().into_iter().filter(|d| d.level == Level::Critical).collect()
}

// The better-auth scaffold's auth-secrets.gen.ts is written after the first
// inspection of a fresh project, so a grant of BETTER_AUTH_SECRET must not
// fail that inspection when the project has auth.
#[test]
fn secret_grant_of_better_auth_secret_with_auth() {
    for decl in [
        r#"{"package":"@addon/auth","secretGrants":["BETTER_AUTH_SECRET"]}"#,
        r#"{"package":"@addon/auth","secretGrants":["AUTH_SECRET"],"secretOverrides":{"AUTH_SECRET":"BETTER_AUTH_SECRET"}}"#,
    ] {
        let mut log = Logger::new();
        addons::validate_secret_overrides(&mut log, &grant_state(decl, true));
        assert!(criticals(&log).is_empty(), "{decl}: {:?}", criticals(&log));
    }
}

#[test]
fn secret_grant_of_better_auth_secret_without_auth() {
    let mut log = Logger::new();
    addons::validate_secret_overrides(&mut log, &grant_state(r#"{"package":"@addon/auth","secretGrants":["BETTER_AUTH_SECRET"]}"#, false));
    let c = criticals(&log);
    assert!(c.len() == 1 && c[0].code.as_deref() == Some(codes::INVALID_VALUE) && c[0].message.contains("Available secrets: none"), "{c:?}");
}

#[test]
fn nil_slices_round_trip_as_null() {
    let m: FunctionMeta = serde_json::from_str(r#"{"pikkuFuncId":"f","inputSchemaName":null,"outputSchemaName":null,"sessionless":true}"#).unwrap();
    let out = serde_json::to_string(&m).unwrap();
    assert!(out.contains(r#""services":{"optimized":false,"services":null}"#) && out.contains(r#""inputs":null,"outputs":null"#), "{out}");
}

#[test]
fn response_marks_the_validation_pass() {
    let mut res = Response { state: Some(Box::new(State::new("/tmp/x"))), diagnostics: vec![], ..Response::default() };
    response(&mut res, &Options::default()).unwrap();
    assert!(res.finalized);
    assert_eq!(res.validation_pass.map(|p| (p.start, p.end)), Some((0, 0)));
}
