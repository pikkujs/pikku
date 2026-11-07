//! `serve` leaks the tsrs programs it builds (they are `'static`), about 19 MB
//! per `inspect` on online-shop. It tells the caller when to retire it: the
//! response that spends the budget carries `"recycle":true`, and the caller
//! starts a new process for the next request.

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};

use serde_json::{json, Value};

#[test]
fn serve_asks_to_be_recycled_when_its_budget_is_spent() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../inspector-parity/fixtures/interface_extends")
        .canonicalize()
        .unwrap();
    let params = json!({
        "routeFiles": [root.join("src/types.ts")],
        "options": {
            "rootDir": root,
            "tsconfig": root.join("tsconfig.json"),
        },
    });
    let mut child = Command::new(env!("CARGO_BIN_EXE_pikku-inspect-rs"))
        .arg("serve")
        .env("PIKKU_INSPECT_RS_SERVE_BUDGET", "3")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    let mut recycle = vec![];
    for id in 1..=4 {
        let line = json!({"id": id, "method": "inspect", "params": params});
        writeln!(stdin, "{line}").unwrap();
        stdin.flush().unwrap();
        let mut reply = String::new();
        stdout.read_line(&mut reply).unwrap();
        let reply: Value = serde_json::from_str(&reply).unwrap();
        assert!(reply.get("error").is_none(), "{reply}");
        recycle.push(reply.get("recycle").and_then(Value::as_bool).unwrap_or(false));
    }
    drop(stdin);
    child.wait().unwrap();
    assert_eq!(recycle, [false, false, true, true]);
}
