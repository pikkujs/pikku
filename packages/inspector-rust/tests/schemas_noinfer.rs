//! `NoInfer<T>` inside a type the schema generator walks into. core's
//! `GetCredential` is a conditional type whose first branch is a generic
//! function returning `NoInfer<T> | null`; reaching it from a contract's output
//! (addon-console's `AddonMetaPage` -> `FunctionsMeta`) made the Rust engine
//! log `PKU456: unknown intrinsic method: NoInfer`, then fail every schema
//! generated after it. `NoInfer<T>` only blocks inference, so for a schema it
//! is `T`.

use pikku_inspect::diag::Logger;
use pikku_inspect::schemas::{Config, generate_all};
use pikku_inspect::state::State;
use pikku_inspect::state::meta::FunctionMeta;

#[test]
fn no_infer_is_its_argument_not_an_unknown_intrinsic() {
    let dir = std::env::temp_dir().join(format!("no-infer-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("tsconfig.json"),
        r#"{"compilerOptions":{"strict":true,"module":"nodenext","target":"esnext"}}"#,
    )
    .unwrap();
    std::fs::write(
        dir.join("types.ts"),
        "export type GetCredential<TCredentials = Record<string, unknown>> =\n  string extends keyof TCredentials\n    ? <T = unknown>(name: string) => NoInfer<T> | null | Promise<NoInfer<T> | null>\n    : {\n        <K extends keyof TCredentials & string>(name: K): TCredentials[K] | null\n      }\n\nexport interface Wire {\n  id: string\n  getCredential: GetCredential\n  label: NoInfer<string>\n}\n",
    )
    .unwrap();

    let root = dir.to_string_lossy().into_owned();
    let mut st = State::new(root.clone());
    st.functions.types_map.add_type("Wire", &dir.join("types.ts").to_string_lossy());
    st.functions.types_map.add_custom_type("WireOutput", "{ wire: Wire }", vec!["Wire".to_string()]);
    let mut meta = FunctionMeta::default();
    meta.fields.output_schema_name = Some("WireOutput".into());
    meta.fields.outputs = vec!["WireOutput".into()];
    st.functions.meta.set("wire".to_string(), meta);

    let mut log = Logger::default();
    let cfg = Config {
        tsconfig: dir.join("tsconfig.json").to_string_lossy().into_owned(),
        schemas_from_types: vec![],
        additional_properties: None,
        cache_dir: String::new(),
        vendor: None,
    };
    let got = generate_all(&mut log, &cfg, &mut st, None).unwrap();
    assert!(log.entries().is_empty(), "{:?}", log.entries());
    let text = serde_json::to_string(got.get("WireOutput").expect("WireOutput schema").value().unwrap()).unwrap();
    assert!(text.contains(r#""id":{"type":"string"}"#), "{text}");
    assert!(text.contains(r#""label":{"type":"string"}"#), "NoInfer<string> is string: {text}");
    let _ = std::fs::remove_dir_all(&dir);
}
