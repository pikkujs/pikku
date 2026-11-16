use pikku_inspect::analyze;
use pikku_inspect::protocol::{Options, Request};

const SRC: &str = "declare const pikkuFunc: any
export const quiet = pikkuFunc({ telemetry: { spans: 'off' }, func: async () => {} })
export const loud = pikkuFunc({ telemetry: { spans: 'always' }, func: async () => {} })
export const normal = pikkuFunc({ telemetry: { spans: 'on' }, func: async () => {} })
export const sampled = pikkuFunc({ telemetry: { spans: { sample: 0.25 } }, func: async () => {} })
export const everything = pikkuFunc({ telemetry: { spans: { sample: 1 } }, func: async () => {} })
export const plain = pikkuFunc({ func: async () => {} })
export const typo = pikkuFunc({ telemetry: { spans: 'errors' }, func: async () => {} })
export const outOfRange = pikkuFunc({ telemetry: { spans: { sample: 2 } }, func: async () => {} })
";

#[test]
fn function_telemetry_reaches_meta() {
    let dir =
        std::env::temp_dir().join(format!("pikku-inspect-rs-telemetry-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("tsconfig.json"),
        r#"{"compilerOptions":{"strict":true,"module":"nodenext","target":"esnext"},"include":["*.ts"]}"#,
    )
    .unwrap();
    std::fs::write(dir.join("fns.ts"), SRC).unwrap();
    let dir = dir.canonicalize().unwrap();
    let req = Request {
        route_files: vec![dir.join("fns.ts").to_string_lossy().to_string()],
        options: Options {
            tsconfig: dir.join("tsconfig.json").to_string_lossy().to_string(),
            root_dir: dir.to_string_lossy().to_string(),
            ..Default::default()
        },
        changed_files: vec![],
    };
    let res = analyze::run(&req, None).unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    let state = res.state.as_ref().unwrap();
    let want = [
        ("quiet", r#"{"spans":"off"}"#),
        ("loud", r#"{"spans":"always"}"#),
        ("normal", r#"{"spans":"on"}"#),
        ("sampled", r#"{"spans":{"sample":0.25}}"#),
        ("everything", r#"{"spans":{"sample":1}}"#),
        ("plain", "null"),
        ("typo", "null"),
        ("outOfRange", "null"),
    ];
    for (name, expected) in want {
        let meta = state.functions.meta.get(name).unwrap_or_else(|| {
            panic!(
                "no function meta for {name}; diagnostics: {:?}",
                res.diagnostics
            )
        });
        let got = serde_json::to_string(&meta.telemetry).unwrap();
        assert_eq!(got, expected, "{name}");
    }
}
