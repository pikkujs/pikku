//! The tests of Go `tsutil/*_test.go`, with Go's expected values.

use tsrs_ast::{Node, SourceFile, SourceFileParseOptions};
use tsrs_core::{P, ScriptKind};

use super::*;

/// Go `sourcescan.Parse(name, text, ScriptKindTS)`.
pub fn parse(text: &str) -> P<SourceFile> {
    tsrs_parser::parse_source_file(
        SourceFileParseOptions { file_name: "/a.ts".to_string(), ..Default::default() },
        text,
        ScriptKind::TS,
    )
}

fn first_statement(sf: P<SourceFile>) -> P<Node> {
    sf.statements().nodes()[0]
}

#[test]
fn print_node_non_null() {
    for (source, want) in [
        ("f(x!)", "f(x!);"),
        ("f(a.b!, c)", "f(a.b!, c);"),
        ("f(x!.y!)", "f(x!.y!);"),
        ("m.get(k!)!", "m.get(k!)!;"),
        ("new C(x!)", "new C(x!);"),
        ("x!.y", "x!.y;"),
        ("x!.y!.z()", "x!.y!.z();"),
        ("x![0]", "x![0];"),
        ("x!()", "x!();"),
        ("(x!).y", "(x!).y;"),
        ("if (x!) {}", "if (x!) { }"),
        ("g((x!))", "g((x!));"),
        ("x!++", "x!++;"),
        ("f(a, b!)", "f(a, b!);"),
        ("f(x!)(y!)", "f(x!)(y!);"),
        ("f<T>(x!)", "f<T>(x!);"),
    ] {
        let sf = parse(source);
        assert_eq!(print::print_node(first_statement(sf)), want, "print_node({source:?})");
    }
}

#[test]
fn collects_started_workflows() {
    let sf = parse(
        "async () => {\n\tawait rpc.startWorkflow('literal', {})\n\tawait rpc!.startWorkflow(name as any, {})\n\tawait wire.rpc.startWorkflow(`tpl`, {})\n\tawait republish(rpc, x)\n\tawait provision({ rpc })\n\tawait other({ rpc: wire.rpc })\n\tawait workflowService.run(x, rpc)\n\tawait unrelated(x)\n}",
    );
    let got = collect_started_workflows(first_statement(sf));
    assert_eq!(got.names, ["literal", "tpl"]);
    assert_eq!(got.dynamic, ["rpc!.startWorkflow(name as any, {})"]);
    assert_eq!(got.rpc_handoffs, ["other", "provision", "republish"]);
}

#[test]
fn collects_invoked_rpc_names() {
    let sf = parse("async () => {\n\tawait rpc.invoke('a', {})\n\tawait rpc!.mesh(name, {})\n\tawait other.invoke(name, {})\n}");
    let got = collect_invoked_rpc_names(first_statement(sf));
    assert_eq!(got.names, ["a"]);
    assert_eq!(got.dynamic, ["rpc!.mesh(name, {})"]);
}

#[test]
fn path_params_match_path_to_regexp() {
    let ok: [(&str, &[&str]); 6] = [
        ("/users/:id", &["id"]),
        ("/a/:\"quoted id\"/b", &["quoted id"]),
        ("/files/*rest", &[]),
        ("/x/\\:y/:z", &["z"]),
        ("/u/:id{/:sub}", &["id", "sub", "id"]),
        ("/e/:é", &["é"]),
    ];
    for (path, want) in ok {
        assert_eq!(path_params(path).unwrap(), want, "{path}");
    }
    let err = [
        ("/bad/:", "Missing parameter name at index 6: /bad/:; visit https://git.new/pathToRegexpError for info"),
        ("/a/:x:y", "Missing text before \"y\" param: /a/:x:y; visit https://git.new/pathToRegexpError for info"),
        ("/a/(x)", "Unexpected ( at index 3: /a/(x); visit https://git.new/pathToRegexpError for info"),
        ("/a/{x", "Unexpected end at index 5, expected }: /a/{x; visit https://git.new/pathToRegexpError for info"),
    ];
    for (path, want) in err {
        assert_eq!(path_params(path).unwrap_err(), want, "{path}");
    }
}

#[test]
fn route_patterns() {
    for (route, pattern, want) in [
        ("/rpc", "/rpc", true),
        ("/rpc/x", "/rpc/*", true),
        ("/a.b", "/a*", true),
        ("/ab", "/a.b", false),
        ("/x", "*", true),
    ] {
        assert_eq!(route_matches_pattern(route, pattern), want, "{route} ~ {pattern}");
    }
}

#[test]
fn type_names_from_func_ids() {
    for (i, want) in [
        ("getUser", "GetUser"),
        ("get-user", "GetUser"),
        ("ext:hello", "ExtHello"),
        ("a__b", "AB"),
        ("x@v2", "XV2"),
        ("café-ok", "CafOk"),
        ("123abc", "123abc"),
        ("", ""),
    ] {
        assert_eq!(func_id_to_type_name(i), want, "{i}");
    }
}

#[test]
fn utf16_offset_counts_astral_as_two() {
    let text = "// café 😀\nconst x = 1";
    let byte_off = "// café 😀\n".len();
    assert_eq!(utf16_offset(text, byte_off), 11);
}

#[test]
fn js_numbers_parse() {
    for (t, want) in [("3", 3.0), ("0.5", 0.5), ("1e21", 1e21), ("0x10", 16.0), ("0o17", 15.0), ("0b101", 5.0), ("1_000", 1000.0), (".5", 0.5)] {
        assert_eq!(js_number(t), want, "{t}");
    }
    assert!(js_number("nope").is_nan());
}

#[test]
fn js_numbers_print() {
    for (f, want) in [
        (0.0, "0"),
        (3.0, "3"),
        (-1.0, "-1"),
        (0.5, "0.5"),
        (-0.5, "-0.5"),
        (1e21, "1e+21"),
        (1.5e22, "1.5e+22"),
        (123456789012345680000.0, "123456789012345680000"),
        (0.000001, "0.000001"),
        (1e-7, "1e-7"),
        (f64::INFINITY, "Infinity"),
        (f64::NEG_INFINITY, "-Infinity"),
        (-0.0, "0"),
    ] {
        assert_eq!(js_number_string(f), want, "{f}");
    }
}

#[test]
fn whitespace_collapses() {
    assert_eq!(collapse_whitespace("z.enum(['a',\n\t  'b'])  x"), "z.enum(['a', 'b']) x");
}

#[test]
fn property_readers() {
    let sf = parse("const o = { name: 'a' + 'b', tags: ['x', 1, 'y'], n: 3, flag: true, s: `t`, other: foo.bar }");
    let decl = first_statement(sf);
    let init = decl.as_variable_statement().declaration_list().as_variable_declaration_list().declarations().nodes()[0].initializer().unwrap();
    assert_eq!(get_property_value(init, "name").str.as_deref(), Some("ab"));
    assert_eq!(get_property_value(init, "tags").strs.unwrap(), ["x", "y"]);
    assert_eq!(get_property_value(init, "n").num, Some(3.0));
    assert_eq!(get_property_value(init, "flag").bool, Some(true));
    assert_eq!(get_property_value(init, "s").str.as_deref(), Some("t"));
    assert_eq!(get_property_value(init, "other").str.as_deref(), Some("foo.bar"));
    assert!(!get_property_value(init, "missing").present);
    assert_eq!(literal_number(init, "n"), Some(3.0));
    assert_eq!(literal_bool(init, "flag"), Some(true));
    assert_eq!(literal_string(init, "name"), None);
    assert_eq!(literal_string_array(init, "tags"), None);
}
