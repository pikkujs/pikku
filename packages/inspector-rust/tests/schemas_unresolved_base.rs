//! A heritage clause naming an import that does not resolve (online-shop's
//! `interface CheckoutRun extends ScenarioHttpResponse` with `#pikku/scenarios`
//! absent from the schema program). Go's ExpressionWithTypeArgumentsNodeParser
//! used to index an empty declaration list and log a PKU456 with a Go panic
//! stack; with the guard (inspector-go: guard an unresolved base type in the
//! extends parser) the base type is `any` and the schema is generated. Mirror
//! of Go's TestGenerateAllUnresolvedBaseType.

use pikku_inspect::diag::Logger;
use pikku_inspect::schemas::{Config, generate_all};
use pikku_inspect::state::State;
use pikku_inspect::state::meta::FunctionMeta;

#[test]
fn an_unresolved_base_type_is_any_not_a_panic() {
    let dir = std::env::temp_dir().join(format!("unresolved-base-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("tsconfig.json"),
        r#"{"compilerOptions":{"strict":true,"module":"nodenext","target":"esnext"}}"#,
    )
    .unwrap();
    std::fs::write(
        dir.join("types.ts"),
        "import type { Missing } from '#does-not-resolve'\n\nexport interface Run extends Missing {\n  id: string\n}\n",
    )
    .unwrap();

    let root = dir.to_string_lossy().into_owned();
    let mut st = State::new(root.clone());
    st.functions.types_map.add_type("Run", &dir.join("types.ts").to_string_lossy());
    st.functions.types_map.add_custom_type("RunOutput", "{ run: Run }", vec!["Run".to_string()]);
    let mut meta = FunctionMeta::default();
    meta.fields.output_schema_name = Some("RunOutput".into());
    meta.fields.outputs = vec!["RunOutput".into()];
    st.functions.meta.set("run".to_string(), meta);

    let mut log = Logger::default();
    let cfg = Config {
        tsconfig: dir.join("tsconfig.json").to_string_lossy().into_owned(),
        schemas_from_types: vec![],
        additional_properties: None,
        cache_dir: String::new(),
        vendor: None,
    };
    let got = generate_all(&mut log, &cfg, &mut st, None).unwrap();
    let text = serde_json::to_string(got.get("RunOutput").expect("RunOutput schema").value().unwrap()).unwrap();
    assert!(text.contains(r#""id":{"type":"string"}"#), "{text}");
    assert!(log.entries().is_empty(), "{:?}", log.entries());
    let _ = std::fs::remove_dir_all(&dir);
}
