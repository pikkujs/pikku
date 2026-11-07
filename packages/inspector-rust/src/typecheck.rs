//! Port of Go `internal/typecheck`: type-checks one workspace file at a time
//! with the tsconfig that owns it, the way `tsc` would, including text the
//! editor has not saved. It is the Rust side of `@pikku/code-edit`'s
//! `TypeScriptService`.
//!
//! How one file is checked with an unsaved overlay on the tsrs public API: an
//! [`OverlayHost`] wraps the (caching) compiler host and answers
//! `get_source_file` for the overlay file name from memory, everything else
//! from disk. A program over the owning tsconfig's files is then asked for the
//! syntactic and semantic diagnostics of that one source file.

use std::sync::Arc;

use serde::Serialize;
use tsrs_ast::{Diagnostic as TsDiagnostic, SourceFile, SourceFileParseOptions};
use tsrs_compiler::{CompilerHost, ProgramOptions, new_compiler_host, new_program};
use tsrs_core::tspath::{self, ComparePathsOptions};
use tsrs_core::{
    CompilerOptions, Context, JsxEmit, ModuleKind, ModuleResolutionKind, P, ScriptTarget, Tristate,
    get_script_kind_from_file_name,
};
use tsrs_tsoptions::{self as tsoptions, CompilerOptionsValue, ParseConfigHost, ParsedCommandLine};
use tsrs_vfs::wrapvfs::{Replacements, WrappedFS, wrap};
use tsrs_vfs::{FS, WalkDirError, bundled, osvfs, walk_dir};

use crate::program::{Cache, CachingHost};

/// One problem in the file, with 1-based lines and UTF-16 columns.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub message: String,
    pub code: i64,
    pub severity: String,
    pub start_line: usize,
    pub start_column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

const CHECKED_EXTENSIONS: &[&str] = &[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

fn checked_file(name: &str) -> bool {
    CHECKED_EXTENSIONS.iter().any(|e| name.ends_with(e))
}

struct Overlay {
    file: String,
    text: String,
}

/// Serves one file from memory and everything else from disk. It wraps the
/// caching host, so the cache is never asked about the overlay file.
struct OverlayHost {
    inner: Arc<dyn CompilerHost>,
    over: Option<Arc<Overlay>>,
    /// The inner host's file system, plus the overlay file existing even when
    /// it is not on disk (a new, unsaved file): tsrs checks a root file's
    /// existence before it asks the host for the source file.
    fs: WrappedFS,
}

impl CompilerHost for OverlayHost {
    fn fs(&self) -> &dyn FS {
        &self.fs
    }
    fn default_library_path(&self) -> &str {
        self.inner.default_library_path()
    }
    fn get_current_directory(&self) -> &str {
        self.inner.get_current_directory()
    }
    fn trace(&self, msg: &'static tsrs_diagnostics::Message, args: &[&dyn std::fmt::Display]) {
        self.inner.trace(msg, args)
    }
    fn get_source_file(&self, opts: SourceFileParseOptions) -> Option<P<SourceFile>> {
        if let Some(over) = &self.over {
            if opts.file_name == over.file {
                let kind = get_script_kind_from_file_name(&opts.file_name);
                return Some(tsrs_parser::parse_source_file(opts, &over.text, kind));
            }
        }
        self.inner.get_source_file(opts)
    }
    fn get_content_mapped_source_files(
        &self,
        parse_options: SourceFileParseOptions,
        mapper: &tsoptions::Mapper,
    ) -> Result<tsrs_contentmapper::SourceFiles, tsrs_contentmapper::Error> {
        self.inner.get_content_mapped_source_files(parse_options, mapper)
    }
    fn content_mapper_project(&self) -> Option<Arc<dyn tsrs_contentmapper::Project>> {
        self.inner.content_mapper_project()
    }
    fn get_resolved_project_reference(
        &self,
        file_name: &str,
        path: tspath::Path,
    ) -> Option<P<ParsedCommandLine>> {
        self.inner.get_resolved_project_reference(file_name, path)
    }
}

struct ConfHost {
    fs: Arc<dyn FS>,
    cwd: String,
}

impl ParseConfigHost for ConfHost {
    fn fs(&self) -> &dyn FS {
        &*self.fs
    }
    fn get_current_directory(&self) -> &str {
        &self.cwd
    }
}

/// Checks files under one workspace root. It keeps one unsaved overlay and a
/// source-file cache, so a re-check re-parses only what changed.
pub struct Service {
    root: String,
    cache: Cache,
    overlay: Option<Arc<Overlay>>,
}

fn absolute(path: &str) -> String {
    crate::sourcescan::files::abs(path)
}

fn normalize(path: &str) -> String {
    tspath::normalize_path(&absolute(path))
}

impl Service {
    /// A service for the workspace at `root`.
    pub fn new(root: &str) -> Service {
        Service { root: normalize(root), cache: Cache::new(), overlay: None }
    }

    fn fs() -> Arc<dyn FS> {
        Arc::new(bundled::wrap_fs(osvfs::fs()))
    }

    fn host(&self) -> (Arc<dyn CompilerHost>, Arc<dyn FS>) {
        let fs = Self::fs();
        let inner = new_compiler_host(&self.root, fs.clone(), &bundled::lib_path(), None, None, None);
        let caching: Arc<dyn CompilerHost> = Arc::new(CachingHost::new(inner, self.cache.clone()));
        let raw: &'static dyn FS = Box::leak(Box::new(fs.clone()));
        let mut replacements = Replacements::default();
        if let Some(over) = &self.overlay {
            let file = over.file.clone();
            replacements.file_exists = Some(Box::new(move |p: &str| p == file || raw.file_exists(p)));
        }
        let wrapped = wrap(raw, replacements);
        (Arc::new(OverlayHost { inner: caching, over: self.overlay.clone(), fs: wrapped }), fs)
    }

    /// Checks the file at absolute `path`; `content` stands in for the file on
    /// disk when given. Files that are not code have none.
    pub fn diagnostics(&mut self, path: &str, content: Option<&str>) -> Vec<Diagnostic> {
        let file = normalize(path);
        if !checked_file(&file) {
            return vec![];
        }
        match content {
            Some(c) => {
                let same = self.overlay.as_ref().is_some_and(|o| o.file == file && o.text == c);
                if !same {
                    self.overlay = Some(Arc::new(Overlay { file: file.clone(), text: c.to_string() }));
                }
            }
            None => {
                if self.overlay.as_ref().is_some_and(|o| o.file == file) {
                    self.overlay = None;
                }
            }
        }

        let (host, fs) = self.host();
        self.cache.begin();
        let out = self.check(&file, host, &fs);
        self.cache.prune();
        out
    }

    fn check(&self, file: &str, host: Arc<dyn CompilerHost>, fs: &Arc<dyn FS>) -> Vec<Diagnostic> {
        let conf_host: &'static ConfHost = Box::leak(Box::new(ConfHost { fs: fs.clone(), cwd: self.root.clone() }));
        let config_path = self.config_for(file, conf_host);
        let mut parsed = if config_path.is_empty() { None } else { parse(&config_path, conf_host) };
        if parsed.is_none() {
            parsed = Some(self.inferred(file, fs));
        }
        let parsed = parsed.unwrap();
        let mut options = (*parsed.compiler_options().expect("compiler options")).clone();
        options.no_emit = Tristate::True;
        let config = tsoptions::new_parsed_command_line(
            P::new(options),
            parsed.file_names().to_vec(),
            vec![],
            ComparePathsOptions {
                use_case_sensitive_file_names: fs.use_case_sensitive_file_names(),
                current_directory: self.root.clone(),
            },
        );
        let program = new_program(ProgramOptions::new(P::new(config), host));
        let Some(sf) = program.get_source_file(file) else { return vec![] };
        let ctx = Context::background();
        let mut all = program.get_syntactic_diagnostics(&ctx, Some(sf));
        all.extend(program.get_semantic_diagnostics(&ctx, Some(sf)));
        all.iter().map(|d| to_diagnostic(*d, sf)).collect()
    }

    /// The nearest tsconfig, walking up and through project references, whose
    /// program includes the file; "" when none does.
    fn config_for(&self, file: &str, host: &'static ConfHost) -> String {
        let mut dir = tspath::get_directory_path(file);
        while dir.starts_with(&self.root) {
            let found = find_config_file(&dir, host);
            if found.is_empty() || !found.starts_with(&self.root) {
                return String::new();
            }
            let m = self.includes(&found, file, &mut Vec::new(), host);
            if !m.is_empty() {
                return m;
            }
            let parent = tspath::get_directory_path(&tspath::get_directory_path(&found));
            if parent == dir {
                return String::new();
            }
            dir = parent;
        }
        String::new()
    }

    fn includes(&self, config_path: &str, file: &str, seen: &mut Vec<String>, host: &'static ConfHost) -> String {
        if seen.iter().any(|s| s == config_path) {
            return String::new();
        }
        seen.push(config_path.to_string());
        let Some(parsed) = parse(config_path, host) else { return String::new() };
        let has = match &parsed.raw {
            CompilerOptionsValue::Object(m) => {
                m.contains_key("include") || m.contains_key("files") || m.contains_key("extends")
            }
            _ => false,
        };
        if !has {
            return String::new();
        }
        for f in parsed.file_names() {
            if normalize(f) == file {
                return config_path.to_string();
            }
        }
        for r in parsed.project_references() {
            let m = self.includes(&normalize(&tsrs_core::resolve_project_reference_path(r)), file, seen, host);
            if !m.is_empty() {
                return m;
            }
        }
        String::new()
    }

    /// The nearest folder with a package.json, for a file no tsconfig claims.
    fn package_dir(&self, file: &str, fs: &Arc<dyn FS>) -> String {
        let mut dir = tspath::get_directory_path(file);
        while dir.starts_with(&self.root) && dir != self.root {
            if fs.file_exists(&tspath::combine_paths(&dir, &["package.json"])) {
                return dir;
            }
            dir = tspath::get_directory_path(&dir);
        }
        tspath::get_directory_path(file)
    }

    fn inferred(&self, file: &str, fs: &Arc<dyn FS>) -> ParsedCommandLine {
        let mut files = vec![file.to_string()];
        let root = self.package_dir(file, fs);
        let mut walked: Vec<String> = Vec::new();
        let _ = walk_dir(&**fs, &root, &mut |path, d, err| {
            if err.is_some() {
                return Ok(());
            }
            let Some(d) = d else { return Ok(()) };
            let name = d.name();
            if d.type_().is_dir() {
                if name == "node_modules" || name == "dist" {
                    return Err(WalkDirError::SkipDir);
                }
                return Ok(());
            }
            if [".ts", ".tsx", ".mts", ".cts"].iter().any(|e| name.ends_with(e)) {
                walked.push(tspath::normalize_path(path));
            }
            Ok(())
        });
        walked.sort();
        files.extend(walked);
        let options = CompilerOptions {
            target: ScriptTarget::ES2022,
            module: ModuleKind::ES_NEXT,
            module_resolution: ModuleResolutionKind::BUNDLER,
            jsx: JsxEmit::REACT_JSX,
            allow_js: Tristate::True,
            strict: Tristate::True,
            skip_lib_check: Tristate::True,
            no_emit: Tristate::True,
            ..CompilerOptions::default()
        };
        tsoptions::new_parsed_command_line(
            P::new(options),
            files,
            vec![],
            ComparePathsOptions {
                use_case_sensitive_file_names: fs.use_case_sensitive_file_names(),
                current_directory: self.root.clone(),
            },
        )
    }
}

fn parse(config_path: &str, host: &'static ConfHost) -> Option<ParsedCommandLine> {
    let (parsed, _) = tsoptions::get_parsed_command_line_of_config_file(
        config_path,
        Some(&CompilerOptions::default()),
        None,
        host,
        None,
    );
    parsed
}

fn find_config_file(dir: &str, host: &'static ConfHost) -> String {
    let mut dir = dir.to_string();
    loop {
        let candidate = tspath::combine_paths(&dir, &["tsconfig.json"]);
        if host.fs.file_exists(&candidate) {
            return candidate;
        }
        let parent = tspath::get_directory_path(&dir);
        if parent == dir {
            return String::new();
        }
        dir = parent;
    }
}

fn to_diagnostic(d: P<TsDiagnostic>, sf: P<SourceFile>) -> Diagnostic {
    let text = sf.text();
    let line_starts = tsrs_scanner::get_ecma_line_starts(&*sf);
    let at = |pos: u32| -> (usize, usize) {
        let idx = tsrs_scanner::get_ecma_line_of_position(&*sf, pos);
        (
            idx + 1,
            crate::tsutil::utf16_offset(text, pos as usize)
                - crate::tsutil::utf16_offset(text, line_starts[idx] as usize)
                + 1,
        )
    };
    let (start_line, start_column) = at(d.pos().unwrap_or(0));
    let (end_line, end_column) = at(d.end().unwrap_or(0));
    use tsrs_diagnostics::Category;
    let severity = match d.category() {
        Category::Error => "error",
        Category::Warning => "warning",
        _ => "info",
    };
    Diagnostic {
        message: flatten(d, 0),
        code: d.code() as i64,
        severity: severity.into(),
        start_line,
        start_column,
        end_line,
        end_column,
    }
}

/// `ts.flattenDiagnosticMessageText(messageText, "\n")`: the message, then each
/// level of its chain on its own line, indented two spaces per level.
fn flatten(d: P<TsDiagnostic>, indent: usize) -> String {
    let mut b = String::new();
    if indent > 0 {
        b.push('\n');
        b.push_str(&"  ".repeat(indent));
    }
    b.push_str(&d.localize());
    for kid in d.message_chain() {
        b.push_str(&flatten(*kid, indent + 1));
    }
    b
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pikku-tc-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::canonicalize(&dir).unwrap()
    }

    fn write(root: &PathBuf, name: &str, text: &str) {
        let p = root.join(name);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    fn project(name: &str) -> PathBuf {
        let root = temp(name);
        write(&root, "package.json", r##"{"name":"x","type":"module","imports":{"#lib/*":"./src/lib/*.ts"}}"##);
        write(
            &root,
            "tsconfig.json",
            r#"{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","strict":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["src"]}"#,
        );
        write(&root, "src/lib/math.ts", "export const add = (a: number, b: number) => a + b\n");
        write(&root, "src/index.ts", "import { add } from '#lib/math'\nexport const n: number = add(1, 2)\n");
        root
    }

    #[test]
    fn resolves_package_imports_through_the_project_tsconfig() {
        let root = project("imports");
        let got = Service::new(root.to_str().unwrap()).diagnostics(root.join("src/index.ts").to_str().unwrap(), None);
        assert!(got.is_empty(), "{got:?}");
    }

    #[test]
    fn checks_unsaved_content_against_the_rest_of_the_project() {
        let root = project("unsaved");
        let mut svc = Service::new(root.to_str().unwrap());
        let file = root.join("src/index.ts");
        let unsaved = "import { add } from '#lib/math'\nexport const n: string = add(1, 2)\n";
        let got = svc.diagnostics(file.to_str().unwrap(), Some(unsaved));
        assert!(got.len() == 1 && got[0].code == 2322 && got[0].start_line == 2 && got[0].severity == "error", "{got:?}");
        let again = svc.diagnostics(file.to_str().unwrap(), None);
        assert!(again.is_empty(), "the saved file is fine, got {again:?}");
    }

    #[test]
    fn skips_files_that_are_not_code() {
        let root = project("notcode");
        let got = Service::new(root.to_str().unwrap()).diagnostics(root.join("package.json").to_str().unwrap(), None);
        assert!(got.is_empty());
    }

    #[test]
    fn a_catch_all_base_tsconfig_does_not_claim_files_so_jsx_still_works() {
        let root = temp("jsx");
        write(&root, "tsconfig.json", r#"{"compilerOptions":{"strict":true}}"#);
        write(&root, "web/main.tsx", "export const el = <div data-testid=\"x\" />\n");
        let got = Service::new(root.to_str().unwrap()).diagnostics(root.join("web/main.tsx").to_str().unwrap(), None);
        assert!(!got.iter().any(|d| d.code == 17004), "JSX was rejected: {got:?}");
    }

    #[test]
    fn positions_are_utf16_columns() {
        let root = project("utf16");
        let src = "export const s = '😀'; export const n: number = 'x'\n";
        let got = Service::new(root.to_str().unwrap()).diagnostics(root.join("src/index.ts").to_str().unwrap(), Some(src));
        assert!(
            got.len() == 1 && got[0].start_line == 1 && got[0].start_column == 37 && got[0].end_column == 38,
            "{got:?}"
        );
    }

    #[test]
    fn checks_a_new_unsaved_file_that_is_not_on_disk() {
        let root = project("newfile");
        let file = root.join("src/new.ts");
        let got = Service::new(root.to_str().unwrap()).diagnostics(file.to_str().unwrap(), Some("export const n: number = 'x'\n"));
        assert!(got.len() == 1 && got[0].code == 2322, "{got:?}");
    }
}
