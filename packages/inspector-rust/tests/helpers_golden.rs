//! Go's own tests and golden fixtures for the helper methods
//! (`internal/sourcescan/*_test.go`, `internal/surface/collect_test.go`),
//! ported as the Rust corpus. The goldens under
//! `packages/inspector-go/testdata/` are what the TypeScript implementations
//! returned, so they are the expected values for both ports.

use std::path::PathBuf;

use pikku_inspect::helpers::dispatch;
use pikku_inspect::sourcescan::copytext::{looks_like_copy, reads_as_english};
use serde_json::{Value, json};

fn testdata(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../inspector-go/testdata").join(rel)
}

/// Parses JSON the way Go's decoder does: a lone surrogate escape becomes U+FFFD.
fn lenient(json: &str) -> Value {
    let b = json.as_bytes();
    let hex = |i: usize| -> Option<u32> {
        if i + 6 <= b.len() && b[i] == b'\\' && b[i + 1] == b'u' {
            u32::from_str_radix(std::str::from_utf8(&b[i + 2..i + 6]).ok()?, 16).ok()
        } else {
            None
        }
    };
    let mut out = String::new();
    let mut i = 0;
    let mut escaped = false;
    while i < b.len() {
        if !escaped {
            if let Some(u) = hex(i) {
                if (0xd800..0xdc00).contains(&u) && hex(i + 6).is_some_and(|l| (0xdc00..0xe000).contains(&l)) {
                    out.push_str(&json[i..i + 12]);
                    i += 12;
                    continue;
                }
                if (0xd800..0xe000).contains(&u) {
                    out.push_str("\\ufffd");
                    i += 6;
                    continue;
                }
            }
        }
        escaped = !escaped && b[i] == b'\\';
        let ch = json[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    serde_json::from_str(&out).unwrap_or_else(|e| panic!("{e}: {out}"))
}

fn call(method: &str, params: Value) -> Value {
    let (result, error) = dispatch(method, params.to_string().as_bytes());
    assert!(error.is_none(), "{method}: {:?}", error.map(|e| e.message));
    lenient(result.get())
}

fn call_err(method: &str, params: Value) -> (String, String) {
    let (_, error) = dispatch(method, params.to_string().as_bytes());
    let e = error.expect("expected an error");
    (e.name, e.message)
}

fn read_json(path: PathBuf) -> Value {
    lenient(&std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display())))
}

#[test]
fn read_jsx_literal_text() {
    let src = "export const A = () => (\n  <div title=\"Open the menu\">\n    Hello there\n    {ok ? 'Saved changes' : \"Could not save\"}\n    <input placeholder=\"x1\" data-x=\"Some words here\" />\n  </div>\n)\n";
    let got = call("readJsxLiteralText", json!({"fileName": "a.tsx", "content": src}));
    assert_eq!(
        got,
        json!([
            {"text":"Open the menu","line":2},{"text":"Hello there","line":3},
            {"text":"Saved changes","line":4},{"text":"Could not save","line":4},
            {"text":"x1","line":5},{"text":"Some words here","line":5}
        ])
    );
}

#[test]
fn read_jsx_literal_text_skips_class_builders() {
    let src = "const v = cva('leading-none', { variants: { size: { heading: 'font-heading text-xl', title: 'Big Title Here' } } })\nexport const A = () => <p className={cn('Flex Gap', x)}>{cn('a b')}</p>\n";
    assert_eq!(call("readJsxLiteralText", json!({"fileName": "a.tsx", "content": src})), json!([]));
}

#[test]
fn read_module_specifiers() {
    let src = "import a from './a.js'\nimport type { B } from \"b\"\nexport * from './c.js'\nexport { d } from './d.js'\nconst t = `import x from 'not-an-import'`\nconst e = await import('./e.js')\n";
    assert_eq!(call("readModuleSpecifiers", json!({"fileName": "m.ts", "content": src})), json!(["./a.js", "b", "./c.js", "./d.js"]));
}

#[test]
fn scan_hooks_relative_file_name() {
    let src = "import { usePikkuQuery, usePikkuQueryStub } from '../pikku/react-query'\nexport const X = () => {\n  usePikkuQuery('getOrder', {})\n  usePikkuQueryStub('listOrders', {}, { flag: 'orders' })\n}\n";
    assert_eq!(
        call("scanHooks", json!({"file": "src/x.tsx", "text": src})),
        json!([
            {"file":"src/x.tsx","line":3,"hook":"usePikkuQuery","rpc":"getOrder","stub":false},
            {"file":"src/x.tsx","line":4,"hook":"usePikkuQueryStub","rpc":"listOrders","problem":"no-flag","stub":true}
        ])
    );
}

#[test]
fn read_syntax_errors() {
    for (name, content, bad) in [
        ("plain function", "async function f(){\nreturn 1\n}", false),
        ("octal literal is a hard parse failure", "async function __n8n(){\nconst a = 00000000\n}", true),
        ("html comment", "async function __n8n(){\nreturn <!-- x\n}", true),
        ("unterminated string", "async function f(){ return 'a }", true),
    ] {
        let got = call("readSyntaxErrors", json!({"fileName": "", "content": content}));
        assert_eq!(!got.as_array().unwrap().is_empty(), bad, "{name}: {got}");
    }
}

#[test]
fn read_syntax_errors_parses_tsx_by_extension() {
    let jsx = "const a = <div className=\"x\" />";
    let n = |f: &str, c: &str| call("readSyntaxErrors", json!({"fileName": f, "content": c})).as_array().unwrap().len();
    assert_eq!(n("x.tsx", jsx), 0);
    assert!(n("x.ts", jsx) > 0);
    assert!(n("x.tsx", "const a = <div") > 0);
}

#[test]
fn syntax_error_offsets_are_utf16() {
    // an emoji (2 UTF-16 units, 4 UTF-8 bytes) before the error
    let got = call("readSyntaxErrors", json!({"fileName": "a.ts", "content": "let = ;; (( \u{1F600} x y"}));
    assert_eq!(got, json!([{"code":1109,"start":6},{"code":1127,"start":12},{"code":1434,"start":15}]));
}

#[test]
fn find_wire_remote_addon_literals() {
    let source = "import { wireRemoteAddon } from '@pikku/core/addon'\nwireRemoteAddon({\n  name: 'cloudapi',\n  package: '@scope/name@^1.4.0',\n  serverUrl: 'https://api.example.com',\n})\nwireRemoteAddon({ name: 'legacy', package: \"@pikkustudio/addon-registry\", serverUrl: '' })\nwireRemoteAddon({ name: 'dyn', package: PKG, serverUrl: '' })\nwireRemoteAddon({ package: `tpl` })\n";
    assert_eq!(
        call("findWireRemoteAddonLiterals", json!({"fileName": "wiring.ts", "content": source})),
        json!([
            {"namespace":"cloudapi","spec":"@scope/name@^1.4.0","line":4},
            {"namespace":"legacy","spec":"@pikkustudio/addon-registry","line":7},
            {"namespace":null,"spec":"tpl","line":9}
        ])
    );
    assert_eq!(call("findWireRemoteAddonLiterals", json!({"fileName": "a.ts", "content": "const a = 1"})), json!([]));
}

#[test]
fn read_imports_reports_insertion_points_in_utf16() {
    let content = "// \u{1F600}\nimport { a, b } from 'x'\nimport {} from 'empty'\nimport def from 'd'\nconst s = '\u{1F600}'\n";
    assert_eq!(
        call("readImports", json!({"content": content})),
        json!({"lastImportEnd":73,"imports":[
            {"module":"x","names":["a","b"],"insertAt":19,"end":30},
            {"module":"empty","names":[],"insertAt":39,"end":53},
            {"module":"d","names":[],"insertAt":null,"end":73}
        ]})
    );
}

#[test]
fn find_pikku_call_matches_typescript_reference() {
    let cases = read_json(testdata("pikku-call/cases.json"));
    let mut found = 0;
    for c in cases.as_array().unwrap() {
        let got = call("findPikkuCall", json!({"content": c["content"], "exportedName": c["name"]}));
        if got["found"] == json!(true) {
            found += 1;
        }
        assert_eq!(got, c["want"], "{} in {}", c["name"], c["content"]);
    }
    assert!(found > 0, "the golden set found no pikku call");
}

#[test]
fn jsx_props_match_typescript_reference() {
    let cases = read_json(testdata("jsx-props/cases.json"));
    let cases = cases.as_array().unwrap();
    assert!(cases.len() >= 300, "expected the full golden set, got {}", cases.len());
    for c in cases {
        let pos = |m: &str| call_params(c, m);
        let got = match c["op"].as_str().unwrap() {
            "read" => {
                let props = call("readJsxProps", pos("read"));
                let mut by_name = serde_json::Map::new();
                for p in props.as_array().cloned().unwrap_or_default() {
                    by_name.insert(p["name"].as_str().unwrap().to_string(), p["value"].clone());
                }
                json!({"ok": by_name})
            }
            "prop" => json!({"ok": call("writeJsxProp", pos("prop"))}),
            _ => {
                let (_, params) = (0, pos("style"));
                let (r, e) = dispatch("writeJsxStyle", params.to_string().as_bytes());
                match e {
                    Some(e) => json!({"err": e.message}),
                    None => json!({"ok": serde_json::from_str::<Value>(r.get()).unwrap()}),
                }
            }
        };
        assert_eq!(got, c["want"], "{} {} at {}:{}", c["op"], c["source"], c["line"], c["col"]);
    }
}

fn call_params(c: &Value, op: &str) -> Value {
    let mut p = json!({"source": c["source"], "line": c["line"], "col": c["col"]});
    match op {
        "prop" => {
            p["name"] = c["name"].clone();
            p["value"] = c["value"].clone();
        }
        "style" => {
            let styles: Vec<Value> = c["styles"]
                .as_array()
                .unwrap()
                .iter()
                .map(|pair| json!({"prop": pair[0], "value": pair[1]}))
                .collect();
            p["styles"] = Value::Array(styles);
        }
        _ => {}
    }
    p
}

#[test]
fn message_usage_matches_typescript_reference() {
    let root = testdata("message-usage").canonicalize().unwrap();
    let want = read_json(root.join("expected.json"));
    let got = call("scanMessageUsage", json!({"root": root.to_str().unwrap()}));
    let prefix = format!("{}/", root.to_str().unwrap());
    let got: Value = serde_json::from_str(&got.to_string().replace(&prefix, "")).unwrap();
    assert_eq!(got, want);
}

#[test]
fn source_files_skip_generated_hidden_and_vendor_directories() {
    let root = testdata("message-usage").canonicalize().unwrap();
    let root = root.to_str().unwrap();
    for f in pikku_inspect::sourcescan::files::source_files(root, false, true) {
        let rel = f.strip_prefix(root).unwrap();
        for bad in [".hidden", ".gen.", "paraglide", ".d.ts"] {
            assert!(!rel.contains(bad), "{f} should have been skipped ({bad})");
        }
    }
}

#[test]
fn source_checks_match_typescript_reference() {
    let root = testdata("source-checks").canonicalize().unwrap();
    let cases = read_json(root.join("expected.json"));
    let cases = cases.as_array().unwrap();
    assert!(!cases.is_empty());
    let prefix = format!("{}/", root.to_str().unwrap());
    for c in cases {
        let dir = if c["dir"] == "." { root.clone() } else { root.join(c["dir"].as_str().unwrap()) };
        let mut params = c["params"].clone();
        let (method, key) = match c["fn"].as_str().unwrap() {
            "asI18nArguments" => ("scanAsI18nArguments", "dir"),
            "asI18nStubs" => ("scanAsI18nStubs", "dir"),
            "sepArguments" => ("scanSepArguments", "dir"),
            "jsxLiteralText" => ("scanJsxLiteralText", "dir"),
            "jsxLiteralProps" => ("scanJsxLiteralProps", "dir"),
            "stringLiteralCopy" => ("scanStringLiteralCopy", "dir"),
            other => panic!("unknown function {other}"),
        };
        params[key] = json!(dir.to_str().unwrap());
        let got = call(method, params);
        let got: Value = serde_json::from_str(&got.to_string().replace(&prefix, "")).unwrap();
        assert_eq!(got, c["result"], "{} {} {}", c["fn"], c["dir"], c["params"]);
    }
    assert!(!call("scanAsI18nArguments", json!({"dir": root.to_str().unwrap()})).as_array().unwrap().is_empty());
    assert!(!call("scanSepArguments", json!({"dir": root.to_str().unwrap()})).as_array().unwrap().is_empty());
}

#[test]
fn copy_text_matches_typescript_reference() {
    let corpus = read_json(testdata("source-checks/copy-corpus.json"));
    let corpus = corpus.as_array().unwrap();
    assert!(!corpus.is_empty());
    let allowed1: Vec<String> = ["·", "—", "…"].iter().map(|s| s.to_string()).collect();
    let allowed2: Vec<String> = ["Save", "·"].iter().map(|s| s.to_string()).collect();
    for c in corpus {
        let s = c["s"].as_str().unwrap();
        assert_eq!(looks_like_copy(s, &allowed1), c["l"] == true, "looksLikeCopy({s:?})");
        assert_eq!(looks_like_copy(s, &allowed2), c["a"] == true, "looksLikeCopy({s:?}, allowed)");
        assert_eq!(reads_as_english(s), c["e"] == true, "readsAsEnglish({s:?})");
    }
}

// ---- collectSurface (internal/surface/collect_test.go) -------------------------

const FIXTURE_INDEX: &str = "/** Counts things. */\nexport const counter = (start: number): number => start + 1\n\n/**\n * Greets someone.\n *\n * More words here.\n * @example\n * greet({ name: 'Ada' })\n */\nexport function greet(options: {\n  /** Who to greet. */\n  name: string\n  loud?: boolean\n}): string {\n  return options.name\n}\n\n/** @deprecated use greet */\nexport type Mode = 'quiet' | 'loud'\n";

fn write_fixture(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pikku-surface-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("src")).unwrap();
    std::fs::write(dir.join("package.json"), r#"{ "name": "fixture", "type": "module", "exports": { ".": "./src/index.ts" } }"#).unwrap();
    std::fs::write(dir.join("tsconfig.json"), r#"{ "compilerOptions": { "strict": true, "module": "NodeNext", "moduleResolution": "NodeNext", "outDir": "dist" } }"#).unwrap();
    std::fs::write(dir.join("src/index.ts"), FIXTURE_INDEX).unwrap();
    std::fs::canonicalize(&dir).unwrap()
}

#[test]
fn collect_fixture() {
    let dir = write_fixture("fixture");
    let mut got = call("collectSurface", json!({"packageDir": dir.to_str().unwrap()}));
    for e in got.as_array_mut().unwrap() {
        for s in e["symbols"].as_array_mut().unwrap() {
            if let Some(inn) = s["declaredIn"].as_str() {
                let rel = &inn[inn.rfind("/src/").unwrap() + 1..];
                s["declaredIn"] = json!(rel);
            }
        }
    }
    let want = r#"[{"subpath":".","specifier":"fixture","entryFile":"src/index.ts","symbols":[{"name":"greet","kind":"function","declaredAt":"src/index.ts","declaredIn":"src/index.ts","deprecated":false,"summary":"Greets someone.","docs":"Greets someone.\n\nMore words here.","signature":"(options: { name: string; loud?: boolean; }) => string","examples":["greet({ name: 'Ada' })"]},{"name":"counter","kind":"function","declaredAt":"src/index.ts","declaredIn":"src/index.ts","deprecated":false,"summary":"Counts things.","docs":"Counts things.","signature":"(start: number) => number"},{"name":"Mode","kind":"type","declaredAt":"src/index.ts","declaredIn":"src/index.ts","deprecated":true,"deprecatedReason":"use greet"}]}]"#;
    assert_eq!(got.to_string(), want);
}

#[test]
fn unknown_snippet_is_a_named_error() {
    let dir = write_fixture("snippet");
    std::fs::write(dir.join("src/index.ts"), "/** @example snippet: nope */\nexport const x = 1\n").unwrap();
    let (name, message) = call_err("collectSurface", json!({"packageDir": dir.to_str().unwrap(), "snippets": [["other", "1"]]}));
    assert_eq!(name, "UnknownSnippetError");
    assert!(message.contains("\"nope\""), "{message}");
}

#[test]
fn unknown_method_and_bad_params_are_plain_errors() {
    let (name, message) = call_err("readImports", json!({"content": 5}));
    assert_eq!(name, "");
    assert!(message.starts_with("bad params:"), "{message}");
}

#[test]
fn jsx_style_error_is_named() {
    let (name, message) = call_err(
        "writeJsxStyle",
        json!({"source": "<a className={foo()} />", "line": 1, "col": 0, "styles": [{"prop": "color", "value": "red"}]}),
    );
    assert_eq!(name, "JsxStyleError");
    assert_eq!(message, "This element builds its className in a way that cannot be edited safely");
}
