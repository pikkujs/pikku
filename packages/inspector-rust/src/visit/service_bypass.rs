//! Port of Go `visit/service_bypass.go` (extract-service-bypass.ts): per file,
//! the places that use the filesystem or `process.env` directly instead of the
//! `content` and `variables` services, as `line:snippet` entries in source order.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use tsrs_ast::{self as ast, Kind, Node, SourceFile};
use tsrs_core::P;

use crate::state::{ServiceBypass, Strings};
use crate::tsutil::{self, node_start, rel_path};

/// extract-service-bypass.ts CONTENT_STORAGE_MODULES: the modules whose use
/// means "storing or reading content without the `content` service".
const CONTENT_STORAGE_MODULES: [&str; 4] = ["fs", "node:fs", "fs/promises", "node:fs/promises"];

static TEST_FILE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\.(test|spec)\.[cm]?[jt]sx?$").unwrap());

/// `IsServiceBypassExempt`: generated code, declaration files and tests are
/// outside both policies. The `.pikku` output directory is matched against the
/// path relative to the project's rootDir, so a project that merely sits under
/// a parent directory named `.pikku` is still inspected. Files outside rootDir
/// (workspace packages) have no relative path, so their full path is checked.
pub fn is_service_bypass_exempt(root_dir: &str, file_name: &str) -> bool {
    let n = file_name.replace('\\', "/");
    if n.ends_with(".gen.ts") || n.ends_with(".d.ts") || TEST_FILE.is_match(&n) {
        return true;
    }
    let mut rel = n;
    if !root_dir.is_empty() {
        if let Some(r) = rel_path(root_dir, file_name) {
            if r != ".." && !r.starts_with("../") {
                rel = format!("/{}", r.replace('\\', "/"));
            }
        }
    }
    rel.contains("/.pikku/")
}

fn is_bypass_string_like(n: Option<P<Node>>) -> bool {
    n.is_some_and(|n| ast::is_string_literal(n) || ast::is_no_substitution_template_literal(n))
}

/// Matches `process`, `globalThis.process` and `global.process`.
fn is_process_ref(n: Option<P<Node>>) -> bool {
    let Some(n) = n else { return false };
    if ast::is_identifier(n) {
        return n.text() == "process";
    }
    ast::is_property_access_expression(n)
        && n.name().is_some_and(|name| name.text() == "process")
        && n.expression().is_some_and(|e| ast::is_identifier(e) && (e.text() == "globalThis" || e.text() == "global"))
}

fn is_process_env(n: P<Node>) -> bool {
    if ast::is_property_access_expression(n) {
        return is_process_ref(n.expression()) && n.name().is_some_and(|name| name.text() == "env");
    }
    if !ast::is_element_access_expression(n) || !is_process_ref(n.expression()) {
        return false;
    }
    let arg = n.as_element_access_expression().argument_expression();
    is_bypass_string_like(Some(arg)) && arg.text() == "env"
}

fn storage_module(n: Option<P<Node>>) -> Option<String> {
    let n = n?;
    (is_bypass_string_like(Some(n)) && CONTENT_STORAGE_MODULES.contains(&n.text())).then(|| n.text().to_string())
}

fn add(sf: P<SourceFile>, list: &mut Strings, seen: &mut HashSet<String>, n: P<Node>, snippet: String) {
    let line = tsrs_scanner::get_ecma_line_of_position(sf.get(), node_start(n) as u32);
    let entry = format!("{}:{snippet}", line + 1);
    if seen.insert(entry.clone()) {
        list.push(entry);
    }
}

/// `ExtractServiceBypass` is extract-service-bypass.ts extractServiceBypass.
pub fn extract_service_bypass(sf: P<SourceFile>) -> ServiceBypass {
    let mut content: Strings = Vec::new();
    let mut variables: Strings = Vec::new();
    let mut seen_content: HashSet<String> = HashSet::new();
    let mut seen_variables: HashSet<String> = HashSet::new();

    tsutil::walk_self(sf.as_node(), &mut |n| {
        if ast::is_import_declaration(n) {
            if let Some(m) = storage_module(n.module_specifier()) {
                if !n.import_clause().is_some_and(|ic| ic.is_type_only()) {
                    add(sf, &mut content, &mut seen_content, n, format!("import '{m}'"));
                }
            }
        } else if ast::is_export_declaration(n) {
            if let Some(m) = storage_module(n.module_specifier()) {
                if !n.is_type_only() {
                    add(sf, &mut content, &mut seen_content, n, format!("export from '{m}'"));
                }
            }
        } else if ast::is_import_equals_declaration(n) {
            let decl = n.as_import_equals_declaration();
            let reference = decl.module_reference();
            if !decl.is_type_only() && ast::is_external_module_reference(reference) {
                if let Some(m) = storage_module(Some(reference.as_external_module_reference().expression())) {
                    add(sf, &mut content, &mut seen_content, n, format!("require('{m}')"));
                }
            }
        } else if ast::is_call_expression(n) {
            let callee = n.expression().unwrap();
            let first = n.arguments().first().copied();
            if ast::is_identifier(callee) && callee.text() == "require" {
                if let Some(m) = storage_module(first) {
                    add(sf, &mut content, &mut seen_content, n, format!("require('{m}')"));
                }
            } else if callee.kind() == Kind::ImportKeyword {
                if let Some(m) = storage_module(first) {
                    add(sf, &mut content, &mut seen_content, n, format!("import('{m}')"));
                }
            }
        } else if is_process_env(n) {
            let mut snippet = "process.env".to_string();
            if let Some(p) = n.parent() {
                if ast::is_property_access_expression(p) && p.expression() == Some(n) {
                    snippet = format!("process.env.{}", p.name().unwrap().text());
                } else if ast::is_element_access_expression(p) && p.expression() == Some(n) {
                    let arg = p.as_element_access_expression().argument_expression();
                    if is_bypass_string_like(Some(arg)) {
                        snippet = format!("process.env['{}']", arg.text());
                    }
                }
            }
            add(sf, &mut variables, &mut seen_variables, n, snippet);
        } else if ast::is_variable_declaration(n) {
            let Some(name) = n.name() else { return };
            if ast::is_object_binding_pattern(name) && is_process_ref(n.initializer()) {
                for el in name.elements() {
                    let Some(key) = el.property_name().or_else(|| el.name()) else { continue };
                    if el.as_binding_element().dot_dot_dot_token().is_none()
                        && (ast::is_identifier(key) || is_bypass_string_like(Some(key)))
                        && key.text() == "env"
                    {
                        add(sf, &mut variables, &mut seen_variables, n, "const { env } = process".to_string());
                    }
                }
            }
        }
    });
    ServiceBypass { content, variables }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sourcescan;
    use tsrs_core::ScriptKind;

    fn bypass_of(src: &str) -> (String, String) {
        let sf = sourcescan::parse("/project/src/f.ts", src, ScriptKind::TS);
        let b = extract_service_bypass(sf);
        (b.content.join("|"), b.variables.join("|"))
    }

    /// Go `TestExtractServiceBypassContent`.
    #[test]
    fn content() {
        let cases = [
            ("static import", "import { readFile } from 'node:fs/promises'", "1:import 'node:fs/promises'"),
            ("bare fs", "import fs from 'fs'", "1:import 'fs'"),
            ("namespace", "import * as fs from 'fs/promises'", "1:import 'fs/promises'"),
            ("side effect", "import 'node:fs'", "1:import 'node:fs'"),
            ("re-export", "export { readFile } from 'fs'", "1:export from 'fs'"),
            ("require", "const fs = require('node:fs')", "1:require('node:fs')"),
            ("import equals", "import fs = require('fs')", "1:require('fs')"),
            ("dynamic import", "const m = await import('fs/promises')", "1:import('fs/promises')"),
            ("type only", "import type { Stats } from 'node:fs'", ""),
            ("path", "import path from 'node:path'", ""),
            ("local fs variable", "const fs = { readFile: () => 1 }\nfs.readFile()", ""),
            ("string mention", "const s = \"import fs from 'fs'\"", ""),
            ("non literal import", "const m = await import(name)", ""),
        ];
        for (name, src, want) in cases {
            assert_eq!(bypass_of(src).0, want, "{name}");
        }
    }

    /// Go `TestExtractServiceBypassVariables`.
    #[test]
    fn variables() {
        let cases = [
            ("dot", "const a = process.env.API_URL", "1:process.env.API_URL"),
            ("element", "const a = process.env['API_URL']", "1:process.env['API_URL']"),
            ("destructure", "const { API_URL } = process.env", "1:process.env"),
            ("env from", "const { env } = process", "1:const { env } = process"),
            ("env renamed", "const { env: e } = process", "1:const { env } = process"),
            ("spread", "const a = { ...process.env }", "1:process.env"),
            ("string mention", "const s = 'process.env.X'", ""),
            ("other process", "const a = process.argv", ""),
            ("globalThis", "const a = globalThis.process.env.X", "1:process.env.X"),
            ("global", "const a = global.process.env['X']", "1:process.env['X']"),
            ("globalThis env", "const { env } = globalThis.process", "1:const { env } = process"),
            ("local globalThis", "const globalThis = { process: { env: {} } }\nconst a = globalThis.env.X", ""),
            ("local obj process", "const o = { process: { env: 1 } }\nconst a = o.process.env", ""),
            ("local env", "const env = { X: 1 }\nenv.X", ""),
        ];
        for (name, src, want) in cases {
            assert_eq!(bypass_of(src).1, want, "{name}");
        }
    }

    /// Go `TestIsServiceBypassExempt`.
    #[test]
    fn exempt() {
        let cases = [
            ("/p", "/p/src/a.ts", false),
            ("/p", "/p/src/a.test.ts", true),
            ("/p", "/p/src/a.spec.ts", true),
            ("/p", "/p/src/auth.gen.ts", true),
            ("/p", "/p/.pikku/x/y.ts", true),
            ("/p", "/p/src/types.d.ts", true),
            ("/p", "/p/src/test-helpers.ts", false),
            ("/p", "/p/src/.pikkuish/a.ts", false),
            ("/home/u/.pikku/work/app", "/home/u/.pikku/work/app/src/a.ts", false),
            ("/home/u/.pikku/work/app", "/home/u/.pikku/work/app/.pikku/x/y.ts", true),
            ("/p", "/other/pkg/.pikku/x.ts", true),
            ("/p", "/other/pkg/src/a.ts", false),
        ];
        for (root, file, want) in cases {
            assert_eq!(is_service_bypass_exempt(root, file), want, "{root} {file}");
        }
    }
}
