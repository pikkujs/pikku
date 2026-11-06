//! Port of Go `tsutil/text.go`: names, node text and the small node predicates
//! every visitor shares.

use tsrs_ast::{self as ast, Kind, ModifierFlags, Node, SourceFile, Symbol};
use tsrs_core::P;

/// `FuncIdToTypeName`: splits on every non-alphanumeric ASCII byte and
/// upper-cases the first letter of each part (`my-func_id` -> `MyFuncId`).
pub fn func_id_to_type_name(id: &str) -> String {
    let mut out = String::new();
    for part in id.split(|c: char| !c.is_ascii_alphanumeric()) {
        if part.is_empty() {
            continue;
        }
        // The parts are ASCII alphanumerics, so the first byte is the first char.
        let (head, tail) = part.split_at(1);
        out.push_str(&head.to_ascii_uppercase());
        out.push_str(tail);
    }
    out
}

/// `FormatVersionedId`: `base@v<n>`.
pub fn format_versioned_id(base: &str, version: i64) -> String {
    format!("{base}@v{version}")
}

/// `ast.GetSourceFileOfNode`; panics for a detached node (never swept).
pub fn source_file_of(n: P<Node>) -> P<SourceFile> {
    ast::get_source_file_of_node(n).expect("node without a source file")
}

/// `ast.GetSourceFileOfNode(n).FileName()`.
pub fn file_name_of(n: P<Node>) -> &'static str {
    source_file_of(n).get().file_name()
}

/// `NodeStart`: `node.getStart()` as a UTF-8 byte offset (trivia skipped).
pub fn node_start(n: P<Node>) -> usize {
    tsrs_scanner::get_token_pos_of_node(n, source_file_of(n), false) as usize
}

/// `n.End()` as a byte offset.
pub fn node_end(n: P<Node>) -> usize {
    n.end().expect_source("parsed nodes have source positions") as usize
}

/// `NodeText`: `ts.Node#getText()`, the source text from the token start.
pub fn node_text(n: P<Node>) -> &'static str {
    let sf = source_file_of(n);
    &sf.get().text()[node_start(n)..node_end(n)]
}

/// `node.getStart()` in UTF-16 code units, as TS reports it (Go `startOf`).
pub fn start_utf16(n: P<Node>) -> usize {
    super::utf16_offset(source_file_of(n).get().text(), node_start(n))
}

/// `IsFunctionLike`: an arrow function or a function expression (not a
/// declaration).
pub fn is_function_like(n: P<Node>) -> bool {
    ast::is_arrow_function(n) || ast::is_function_expression(n)
}

/// [`is_function_like`] for an optional node.
pub fn opt_is_function_like(n: Option<P<Node>>) -> bool {
    n.is_some_and(is_function_like)
}

/// `IsPikkuCall`: a call of an identifier starting with `pikku`.
pub fn is_pikku_call(n: P<Node>) -> bool {
    ast::is_call_expression(n)
        && n.expression().is_some_and(|e| ast::is_identifier(e) && e.text().starts_with("pikku"))
}

/// `HasExportModifier`.
pub fn has_export_modifier(n: P<Node>) -> bool {
    n.modifier_flags().intersects(ModifierFlags::Export)
}

/// `FirstDecl`: the first declaration of a symbol.
pub fn first_decl(sym: Option<P<Symbol>>) -> Option<P<Node>> {
    sym.and_then(|s| s.declarations().first().copied())
}

/// True when the optional node has this kind.
pub fn is_kind(n: Option<P<Node>>, k: Kind) -> bool {
    n.is_some_and(|n| n.kind() == k)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn func_id_to_type_name_splits_on_non_alphanumerics() {
        assert_eq!(func_id_to_type_name("my-func_id"), "MyFuncId");
        assert_eq!(func_id_to_type_name("todos:create@v2"), "TodosCreateV2");
        assert_eq!(func_id_to_type_name("__temp_ab"), "TempAb");
        assert_eq!(func_id_to_type_name(""), "");
    }

    #[test]
    fn versioned_ids() {
        assert_eq!(format_versioned_id("a", 3), "a@v3");
    }
}

/// `ast.IsAsExpression` (private in tsrs).
pub fn is_as_expression(n: P<Node>) -> bool {
    n.kind() == Kind::AsExpression
}

/// `path.Clean` for slash paths (Go `filepath.Clean` on Unix).
pub fn clean_path(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let rooted = p.starts_with('/');
    let mut out: Vec<&str> = Vec::new();
    for part in p.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if out.last().is_some_and(|l| *l != "..") {
                    out.pop();
                } else if !rooted {
                    out.push("..");
                }
            }
            _ => out.push(part),
        }
    }
    let joined = out.join("/");
    match (rooted, joined.is_empty()) {
        (true, _) => format!("/{joined}"),
        (false, true) => ".".into(),
        (false, false) => joined,
    }
}

/// `filepath.Rel(base, target)`; `None` where Go returns an error.
pub fn rel_path(base: &str, target: &str) -> Option<String> {
    let b = clean_path(base);
    let t = clean_path(target);
    if b == t {
        return Some(".".into());
    }
    if b.starts_with('/') != t.starts_with('/') {
        return None;
    }
    let bc: Vec<&str> = b.split('/').filter(|s| !s.is_empty() && *s != ".").collect();
    let tc: Vec<&str> = t.split('/').filter(|s| !s.is_empty() && *s != ".").collect();
    let mut i = 0;
    while i < bc.len() && i < tc.len() && bc[i] == tc[i] {
        i += 1;
    }
    if bc[i..].contains(&"..") {
        return None;
    }
    let mut parts: Vec<&str> = vec![".."; bc.len() - i];
    parts.extend_from_slice(&tc[i..]);
    Some(parts.join("/"))
}

#[cfg(test)]
mod path_tests {
    use super::*;

    #[test]
    fn rel() {
        assert_eq!(rel_path("/a/b", "/a/b/c/d.ts").unwrap(), "c/d.ts");
        assert_eq!(rel_path("/a/b", "/a/x.ts").unwrap(), "../x.ts");
        assert_eq!(rel_path("/a/b", "/a/b").unwrap(), ".");
        assert_eq!(rel_path("/a/b/", "/a//b/c").unwrap(), "c");
        assert!(rel_path("a", "/b").is_none());
    }
}

/// Go `filepath.Dir` for slash paths.
pub fn dir_path(p: &str) -> String {
    match p.rfind('/') {
        None => ".".into(),
        Some(i) => {
            let d = clean_path(&p[..=i]);
            if d.is_empty() { ".".into() } else { d }
        }
    }
}

/// Go `filepath.Base` for slash paths.
pub fn base_path(p: &str) -> String {
    if p.is_empty() {
        return ".".into();
    }
    let t = p.trim_end_matches('/');
    if t.is_empty() {
        return "/".into();
    }
    t.rsplit('/').next().unwrap().to_string()
}

#[cfg(test)]
mod dir_tests {
    use super::*;

    #[test]
    fn dir_and_base() {
        assert_eq!(dir_path("/a/b/c.ts"), "/a/b");
        assert_eq!(dir_path("/a"), "/");
        assert_eq!(dir_path("a"), ".");
        assert_eq!(base_path("/a/b/c.ts"), "c.ts");
        assert_eq!(base_path("/a/b/"), "b");
        assert_eq!(base_path("/"), "/");
    }
}
