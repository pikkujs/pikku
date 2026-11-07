//! Port of Go `internal/tsutil/typeorder_test.go`.
use std::collections::HashMap;

use pikku_inspect::program::{self, Options};
use pikku_inspect::tsutil::{typeorder, unionorder, walk};
use tsrs_ast::Kind;
use tsrs_checker::TypeFormatFlags;

// The declarations are checked top to bottom, so each literal type is created
// at its first mention in this file: that is the order Strada prints in.
const ORDER_SOURCE: &str = r#"
export const priorities = ['low', 'medium', 'high'] as const
export const priority = priorities[0] as (typeof priorities)[number]

export declare const mixed: 'zeta' | 7 | boolean | 'alpha'

export type Row = { id: string; name: string; email: string; role: string }
export declare const selected: { [K in 'role' | 'name' | 'email']: Row[K] }
export declare const partial: { [K in keyof Row]?: Row[K] }
export declare const nested: { rows: Array<{ [K in 'role' | 'id']: Row[K] }> }

export function charge(ok: boolean) {
  if (ok) return { status: 'succeeded' as const, providerRef: 'p' }
  return { status: 'failed' as const, reason: 'r' }
}
export const charged = charge(true)

export declare const promised: Promise<void> | Promise<any>

declare function prettify<T>(value: T): { [K in keyof T]: T[K] }
type Optionals = { description?: string; dueDate?: string }
type Requireds = { id: string; title: string }
export const flattened = prettify(null as unknown as Requireds & Optionals)
export declare const flattenedInline: { [K in keyof (Requireds & Optionals)]: (Requireds & Optionals)[K] }
export const wrapped = { rows: [prettify(null as unknown as Requireds & Optionals)] }
"#;

#[test]
fn type_to_string_order() {
    let dir = std::env::temp_dir().join(format!("pikku-rs-typeorder-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("order.ts");
    std::fs::write(&file, ORDER_SOURCE).unwrap();
    let mut p = program::create(
        &Options { route_files: vec![file.to_string_lossy().into_owned()], ..Default::default() },
        None,
    )
    .unwrap();
    let files = p.project_files.clone();
    let c = p.checker();
    let mut types = HashMap::new();
    for sf in files {
        let mut decls = Vec::new();
        walk(sf.as_node(), &mut |n| {
            if n.kind() == Kind::VariableDeclaration {
                decls.push(n);
            }
        });
        for d in decls {
            let name = d.name().unwrap();
            let t = c.get_type_at_location(name);
            types.insert(name.text().to_string(), t);
        }
    }
    let flags = TypeFormatFlags::NoTruncation;
    let cases: &[(&str, &str, &str)] = &[
        ("priority", r#""low" | "medium" | "high""#, r#""high" | "low" | "medium""#),
        ("mixed", r#"boolean | "zeta" | 7 | "alpha""#, ""),
        ("selected", "{ role: string; name: string; email: string; }", "{ email: string; name: string; role: string; }"),
        (
            "partial",
            "{ id?: string | undefined; name?: string | undefined; email?: string | undefined; role?: string | undefined; }",
            "",
        ),
        ("nested", "{ rows: { role: string; id: string; }[]; }", ""),
        (
            "charged",
            r#"{ status: "succeeded"; providerRef: string; reason?: undefined; } | { status: "failed"; reason: string; providerRef?: undefined; }"#,
            "",
        ),
        ("promised", "Promise<void> | Promise<any>", "Promise<any> | Promise<void>"),
        (
            // A homomorphic mapped type over an intersection lists the
            // intersection's members' properties in turn; tsrs sorts them by
            // declaration position.
            "flattened",
            "{ id: string; title: string; description?: string | undefined; dueDate?: string | undefined; }",
            "{ description?: string | undefined; dueDate?: string | undefined; id: string; title: string; }",
        ),
        (
            "flattenedInline",
            "{ id: string; title: string; description?: string | undefined; dueDate?: string | undefined; }",
            "",
        ),
        (
            "wrapped",
            "{ rows: { id: string; title: string; description?: string | undefined; dueDate?: string | undefined; }[]; }",
            "",
        ),
    ];
    let mut failures = Vec::new();
    for (name, want, tsgo) in cases {
        let got = unionorder::type_to_string(c, types[*name], flags);
        if got != *want {
            failures.push(format!("{name}: got {got}\n      want {want}"));
        }
        if !tsgo.is_empty() {
            let native = c.type_to_string_ex_exported(types[*name], None, flags, None);
            if native != *tsgo {
                failures.push(format!("{name}: tsrs itself now prints {native}"));
            }
        }
    }
    let ids: Vec<String> = typeorder::union_types_in_id_order(types["priority"])
        .into_iter()
        .map(|m| c.type_to_string_exported(m))
        .collect();
    assert_eq!(ids, [r#""low""#, r#""medium""#, r#""high""#]);
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
