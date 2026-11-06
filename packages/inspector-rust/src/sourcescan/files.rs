//! Port of `files.go`: the source-file walk and the parsed-source reader.

use std::cmp::Ordering;
use std::fs;
use std::path::Path as FsPath;

use tsrs_ast::SourceFile;
use tsrs_core::{P, ScriptKind};

use super::{Lazy, parse};

const SKIP_DIRS: &[&str] =
    &["node_modules", ".git", ".pikku", "dist", "build", ".next", ".output", ".yarn", "paraglide"];

static TS_FILE: Lazy = Lazy::new(r"\.tsx?$");

/// Go `filepath.Clean` for the paths used here (lexical, '/'-separated).
pub fn clean(path: &str) -> String {
    if path.is_empty() {
        return ".".into();
    }
    let rooted = path.starts_with('/');
    let mut out: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if let Some(last) = out.last() {
                    if *last != ".." {
                        out.pop();
                        continue;
                    }
                }
                if !rooted {
                    out.push("..");
                }
            }
            p => out.push(p),
        }
    }
    let joined = out.join("/");
    match (rooted, joined.is_empty()) {
        (true, _) => format!("/{joined}"),
        (false, true) => ".".into(),
        (false, false) => joined,
    }
}

/// Go `filepath.Join` (two parts is all the scans need).
pub fn join(a: &str, b: &str) -> String {
    if a.is_empty() {
        return clean(b);
    }
    clean(&format!("{a}/{b}"))
}

/// Go `filepath.Abs`.
pub fn abs(p: &str) -> String {
    if p.starts_with('/') {
        return clean(p);
    }
    let cwd = std::env::current_dir().map(|c| c.to_string_lossy().into_owned()).unwrap_or_default();
    join(&cwd, p)
}

/// JavaScript's `<` on strings: by UTF-16 code unit.
pub fn compare_utf16(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// `verify/source-checks.ts` sourceFiles: every .ts/.tsx file under `dir`,
/// skipping vendor and generated directories.
pub fn source_files(dir: &str, include_generated: bool, skip_hidden: bool) -> Vec<String> {
    let mut files = Vec::new();
    walk_dir(dir, 0, include_generated, skip_hidden, &mut files);
    files
}

fn walk_dir(current: &str, depth: usize, include_generated: bool, skip_hidden: bool, files: &mut Vec<String>) {
    if depth > 12 {
        return;
    }
    let Ok(rd) = fs::read_dir(current) else { return };
    let mut entries: Vec<(String, bool)> = Vec::new();
    for e in rd.flatten() {
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push((e.file_name().to_string_lossy().into_owned(), is_dir));
    }
    entries.sort_by(|a, b| compare_utf16(&a.0, &b.0));
    for (name, is_dir) in entries {
        let full = join(current, &name);
        if is_dir {
            if !SKIP_DIRS.contains(&name.as_str()) && !(skip_hidden && name.starts_with('.')) {
                walk_dir(&full, depth + 1, include_generated, skip_hidden, files);
            }
        } else if TS_FILE.is_match(&name)
            && !name.ends_with(".d.ts")
            && (include_generated || !name.contains(".gen."))
        {
            files.push(full);
        }
    }
}

/// A parsed file; `ok` is false when the parser reported a syntax error.
pub struct ParsedSource {
    pub sf: P<SourceFile>,
    pub text: String,
    pub ok: bool,
}

/// `fs.readFileSync(file, 'utf8')`: each maximal ill-formed run becomes one U+FFFD.
pub fn decode_utf8(b: &[u8]) -> String {
    String::from_utf8_lossy(b).into_owned()
}

pub fn read_text(file: &str) -> Option<String> {
    fs::read(file).ok().map(|b| decode_utf8(&b))
}

/// Go `ParseSource`: `None` when the file cannot be read.
pub fn parse_source(file: &str) -> Option<ParsedSource> {
    let text = read_text(file)?;
    let sf = parse_source_text(file, &text);
    let ok = sf.diagnostics().is_empty();
    Some(ParsedSource { sf, text, ok })
}

pub fn parse_source_text(file: &str, text: &str) -> P<SourceFile> {
    let kind = if file.ends_with(".tsx") { ScriptKind::TSX } else { ScriptKind::TS };
    parse(file, text, kind)
}

pub fn exists(p: &str) -> bool {
    FsPath::new(p).exists()
}
