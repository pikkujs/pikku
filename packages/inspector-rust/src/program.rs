//! Port of Go `internal/program` (program.go, cache.go): builds the tsrs
//! program the inspector sweeps, with the same compiler options and
//! source-file filter as inspector.ts.
//!
//! Compiler options (Go `program.Create`), all reproduced in [`compiler_options`]:
//!
//! | option                | value                                        |
//! |-----------------------|----------------------------------------------|
//! | `target`              | `ESNext`                                     |
//! | `module`              | `Node16`                                     |
//! | `moduleResolution`    | `Node16`                                     |
//! | `skipLibCheck`        | true                                         |
//! | `skipDefaultLibCheck` | true                                         |
//! | `types`               | `[]` (an empty, non-nil list: no `@types/*`) |
//! | `allowJs`, `checkJs`  | false                                        |
//! | `paths`, `baseUrl`, `rootDirs`, `pathsBasePath` | copied from the project's tsconfig, when it parses cleanly; every other tsconfig option (`strict`, ...) is deliberately NOT copied |
//!
//! Known difference: Go builds the `ParsedCommandLine` with
//! `tsoptions.NewParsedCommandLine(opts, roots, ComparePathsOptions{...})`; the
//! tsrs equivalent takes a project-reference list too (empty here). No Go
//! option is without a tsrs counterpart.

use std::collections::HashMap;
use std::path::{Component, Path as FsPath, PathBuf};
use std::sync::{Arc, Mutex};

use tsrs_ast::{SourceFile, SourceFileParseOptions};
use tsrs_checker::Checker;
use tsrs_compiler::{CheckerHandle, CompilerHost, Program as TsProgram, ProgramOptions, new_compiler_host, new_program};
use tsrs_core::tspath::{self, ComparePathsOptions};
use tsrs_core::{CompilerOptions, Context, ModuleKind, ModuleResolutionKind, P, ScriptTarget, Tristate};
use tsrs_tsoptions::{self as tsoptions, ParseConfigHost};
use tsrs_vfs::{FS, bundled, osvfs};

/// Go `program.Options`.
#[derive(Clone, Debug, Default)]
pub struct Options {
    /// The program's root files (inspect()'s routeFiles).
    pub route_files: Vec<String>,
    /// Bounds the swept files; defaults to the common ancestor of
    /// `route_files`, like the TS findCommonAncestor fallback.
    pub root_dir: String,
    /// Read for path mappings only (readProjectPathMappings).
    pub tsconfig: String,
}

/// Go `program.Program`.
pub struct Program {
    pub program: &'static TsProgram,
    /// The checker handle; dropped by [`Program::release`].
    checker: Option<CheckerHandle>,
    /// The files the sweeps visit: under `root_dir`, outside node_modules and
    /// nested pikku projects, sorted by file name.
    pub project_files: Vec<P<SourceFile>>,
    pub root_dir: String,
    /// Source files served from the cache unparsed.
    pub files_reused: usize,
}

impl Program {
    pub fn checker(&mut self) -> &mut Checker {
        self.checker.as_mut().expect("program released")
    }

    /// Returns the checker to its pool. tsrs programs are leaked
    /// (`new_program` returns `&'static`), so unlike Go this frees the checker
    /// only, not the program. See PORTING.md, "Known gaps".
    pub fn release(&mut self) {
        self.checker = None;
        self.project_files.clear();
    }

    /// Checker counts for the response's stats. Must be called with the checker
    /// handle released (the counts lock every checker).
    pub fn counts(&self) -> (usize, usize, usize) {
        (self.program.type_count(), self.program.instantiation_count(), self.program.symbol_count())
    }
}

struct Host {
    fs: Arc<dyn FS>,
    cwd: String,
}

impl ParseConfigHost for Host {
    fn fs(&self) -> &dyn FS {
        &*self.fs
    }
    fn get_current_directory(&self) -> &str {
        &self.cwd
    }
}

fn absolute(p: &str) -> String {
    // Go filepath.Abs: join with the cwd and clean.
    let joined: PathBuf = if FsPath::new(p).is_absolute() {
        PathBuf::from(p)
    } else {
        std::env::current_dir().unwrap_or_default().join(p)
    };
    let mut out = PathBuf::new();
    for c in joined.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out.to_string_lossy().into_owned()
}

/// The program's fixed compiler options, before the tsconfig path mappings.
pub fn compiler_options() -> CompilerOptions {
    CompilerOptions {
        target: ScriptTarget::ES_NEXT,
        module: ModuleKind::NODE16,
        module_resolution: ModuleResolutionKind::NODE16,
        skip_lib_check: Tristate::True,
        skip_default_lib_check: Tristate::True,
        types: Some(vec![]),
        allow_js: Tristate::False,
        check_js: Tristate::False,
        ..CompilerOptions::default()
    }
}

/// Parses a tsconfig's compiler options, or `None` when there is none or it
/// does not parse (TS logs this at debug level and carries on).
pub fn read_tsconfig(tsconfig: &str, fs: &Arc<dyn FS>, cwd: &str) -> Option<P<CompilerOptions>> {
    if tsconfig.is_empty() {
        return None;
    }
    let abs = tspath::normalize_path(&absolute(tsconfig));
    let host: &'static Host = Box::leak(Box::new(Host { fs: fs.clone(), cwd: cwd.to_string() }));
    let (parsed, errors) =
        tsoptions::get_parsed_command_line_of_config_file(&abs, Some(&CompilerOptions::default()), None, host, None);
    if !errors.is_empty() {
        return None;
    }
    parsed?.compiler_options()
}

/// Builds the program and checker. `cache` may be `None`.
pub fn create(opts: &Options, cache: Option<&Cache>) -> Result<Program, String> {
    let cwd = std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    let roots: Vec<String> = opts.route_files.iter().map(|f| tspath::normalize_path(&absolute(f))).collect();
    let fs: Arc<dyn FS> = Arc::new(bundled::wrap_fs(osvfs::fs()));
    let mut host: Arc<dyn CompilerHost> = new_compiler_host(&cwd, fs.clone(), &bundled::lib_path(), None, None, None);
    let mut counting = None;
    if let Some(cache) = cache {
        let c = Arc::new(CachingHost::new(host, cache.clone()));
        host = c.clone();
        counting = Some(c);
    }

    let mut compiler_opts = compiler_options();
    if let Some(po) = read_tsconfig(&opts.tsconfig, &fs, &cwd) {
        // readProjectPathMappings: only the resolution keys are copied, so
        // inference options such as `strict` stay the inspector's own.
        compiler_opts.paths = po.paths.clone();
        compiler_opts.base_url = po.base_url.clone();
        compiler_opts.root_dirs = po.root_dirs.clone();
        compiler_opts.paths_base_path = po.paths_base_path.clone();
    }
    let parsed = tsoptions::new_parsed_command_line(
        P::new(compiler_opts),
        roots.clone(),
        vec![],
        ComparePathsOptions {
            use_case_sensitive_file_names: fs.use_case_sensitive_file_names(),
            current_directory: cwd.clone(),
        },
    );
    let program = new_program(ProgramOptions::new(P::new(parsed), host));
    program.bind_source_files();
    let checker = program.get_type_checker(&Context::background());

    let root_dir = if opts.root_dir.is_empty() { common_ancestor(&roots) } else { absolute(&opts.root_dir) };
    let root_dir = tspath::normalize_path(&root_dir);

    let mut is_nested = nested_project_filter(&root_dir);
    let mut files: Vec<P<SourceFile>> = program
        .get_source_files()
        .iter()
        .copied()
        .filter(|sf| {
            let name = sf.file_name();
            name.starts_with(&root_dir) && !name.contains("/node_modules/") && !is_nested(name)
        })
        .collect();
    files.sort_by(|a, b| a.file_name().cmp(b.file_name()));

    Ok(Program {
        program,
        checker: Some(checker),
        project_files: files,
        root_dir,
        files_reused: counting.map(|c| c.reused()).unwrap_or(0),
    })
}

/// The longest shared directory prefix of the files (Go `commonAncestor`).
pub fn common_ancestor(files: &[String]) -> String {
    fn dir(f: &str) -> &str {
        // Go path.Dir
        match f.rfind('/') {
            None => ".",
            Some(0) => "/",
            Some(i) => &f[..i],
        }
    }
    let Some(first) = files.first() else { return "/".into() };
    let mut parts: Vec<&str> = dir(first).split('/').collect();
    for f in &files[1..] {
        let other: Vec<&str> = dir(f).split('/').collect();
        let n = parts.iter().zip(&other).take_while(|(a, b)| a == b).count();
        parts.truncate(n);
    }
    let joined = parts.join("/");
    if joined.is_empty() { "/".into() } else { joined }
}

/// Reports files inside a nested pikku project under `root_dir` (a directory
/// with its own pikku.config.json), with a per-directory cache like
/// createNestedProjectFilter.
pub fn nested_project_filter(root_dir: &str) -> impl FnMut(&str) -> bool + use<> {
    let root_dir = root_dir.to_string();
    let mut cache: HashMap<String, bool> = HashMap::new();
    move |file_name: &str| {
        let mut pending: Vec<String> = Vec::new();
        let mut dir = go_dir(file_name);
        let mut nested = false;
        while dir.starts_with(&root_dir) && dir != root_dir {
            if let Some(v) = cache.get(&dir) {
                nested = *v;
                break;
            }
            pending.push(dir.clone());
            if FsPath::new(&dir).join("pikku.config.json").exists() {
                nested = true;
                break;
            }
            let parent = go_dir(&dir);
            if parent == dir {
                break;
            }
            dir = parent;
        }
        for d in pending {
            cache.insert(d, nested);
        }
        nested
    }
}

fn go_dir(p: &str) -> String {
    match p.rfind('/') {
        None => ".".into(),
        Some(0) => "/".into(),
        Some(i) => p[..i].to_string(),
    }
}

// ---- cache.go -------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
struct CacheKey {
    jsx: bool,
    force: bool,
}

struct CacheEntry {
    file: P<SourceFile>,
    gen_: u64,
}

#[derive(Default)]
struct CacheInner {
    entries: HashMap<(String, CacheKey), CacheEntry>,
    gen_: u64,
}

/// Keeps parsed (and, once a program binds them, bound) SourceFiles across
/// programs: every re-inspection in `serve` mode. A file is reused when its
/// path, parse options and text are all unchanged, so a re-inspect re-parses
/// only the files that changed. Checkers are never cached.
///
/// Cheap to clone (shared state).
#[derive(Clone, Default)]
pub struct Cache {
    inner: Arc<Mutex<CacheInner>>,
}

impl Cache {
    pub fn new() -> Cache {
        Cache::default()
    }

    /// Starts a request: [`Cache::prune`] afterwards drops every file the
    /// request's programs did not use.
    pub fn begin(&self) {
        self.inner.lock().unwrap().gen_ += 1;
    }

    /// Drops files no program has asked for since the last [`Cache::begin`], so
    /// a deleted or renamed file does not stay alive in a long-running serve
    /// process.
    pub fn prune(&self) {
        let mut g = self.inner.lock().unwrap();
        let cur = g.gen_;
        g.entries.retain(|_, e| e.gen_ == cur);
    }

    pub fn len(&self) -> usize {
        self.inner.lock().unwrap().entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Go `cachingHost`: a compiler host whose programs share a [`Cache`].
pub struct CachingHost {
    inner: Arc<dyn CompilerHost>,
    cache: Cache,
    reused: Mutex<usize>,
}

impl CachingHost {
    pub fn new(inner: Arc<dyn CompilerHost>, cache: Cache) -> CachingHost {
        CachingHost { inner, cache, reused: Mutex::new(0) }
    }

    pub fn reused(&self) -> usize {
        *self.reused.lock().unwrap()
    }
}

impl CompilerHost for CachingHost {
    fn fs(&self) -> &dyn FS {
        self.inner.fs()
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
        let text = self.inner.fs().read_file(&opts.file_name)?;
        let key = (
            opts.path.0.to_string(),
            CacheKey { jsx: opts.external_module_indicator_options.jsx, force: opts.external_module_indicator_options.force },
        );
        {
            let mut g = self.cache.inner.lock().unwrap();
            let gen_ = g.gen_;
            if let Some(e) = g.entries.get_mut(&key) {
                if e.file.file_name() == opts.file_name && e.file.text() == text {
                    e.gen_ = gen_;
                    *self.reused.lock().unwrap() += 1;
                    return Some(e.file);
                }
            }
        }
        let sf = self.inner.get_source_file(opts)?;
        let mut g = self.cache.inner.lock().unwrap();
        let gen_ = g.gen_;
        g.entries.insert(key, CacheEntry { file: sf, gen_ });
        Some(sf)
    }
    fn get_content_mapped_source_files(
        &self,
        parse_options: SourceFileParseOptions,
        mapper: &tsrs_tsoptions::Mapper,
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
    ) -> Option<P<tsrs_tsoptions::ParsedCommandLine>> {
        self.inner.get_resolved_project_reference(file_name, path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_ancestor_matches_go() {
        let f = |v: &[&str]| common_ancestor(&v.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        assert_eq!(f(&[]), "/");
        assert_eq!(f(&["/a/b/c.ts"]), "/a/b");
        assert_eq!(f(&["/a/b/c.ts", "/a/d/e.ts"]), "/a");
        assert_eq!(f(&["/a/x.ts", "/b/y.ts"]), "/");
    }

    #[test]
    fn options_are_the_inspectors() {
        let o = compiler_options();
        assert_eq!(o.module, ModuleKind::NODE16);
        assert_eq!(o.module_resolution, ModuleResolutionKind::NODE16);
        assert_eq!(o.types, Some(vec![]));
        assert!(o.skip_lib_check.is_true());
    }

    #[test]
    fn nested_projects_are_filtered() {
        let dir = std::env::temp_dir().join(format!("pikku-rs-nested-{}", std::process::id()));
        let root = dir.to_string_lossy().into_owned();
        std::fs::create_dir_all(dir.join("inner/deep")).unwrap();
        std::fs::write(dir.join("inner/pikku.config.json"), "{}").unwrap();
        let mut nested = nested_project_filter(&root);
        assert!(nested(&format!("{root}/inner/deep/a.ts")));
        assert!(nested(&format!("{root}/inner/b.ts")));
        assert!(!nested(&format!("{root}/c.ts")));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
