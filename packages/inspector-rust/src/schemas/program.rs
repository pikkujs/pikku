//! Port of Go `internal/schemas/program.go`: the schema program, rooted at the
//! custom-types virtual file and served from memory.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::SystemTime;

use tsrs_ast::SourceFile;
use tsrs_compiler::{CompilerHost, ProgramOptions, new_compiler_host, new_program};
use tsrs_core::tspath::{self, ComparePathsOptions};
use tsrs_core::{Context, P};
use tsrs_tsoptions as tsoptions;
use tsrs_vfs::{Entries, FS, FileInfo, bundled, osvfs};

use crate::program::{Cache, CachingHost, read_tsconfig};
use crate::tsjg::parser::Chk;

/// The root file of the schema program, created beside the tsconfig.
pub const VIRTUAL_FILE_NAME: &str = "__pikku_virtual_types__.ts";

/// Serves files from memory ahead of the wrapped file system, like the
/// customHost in createProgramWithVirtualFile.
struct OverlayFs {
    inner: Arc<dyn FS>,
    files: HashMap<String, String>,
}

impl FS for OverlayFs {
    fn use_case_sensitive_file_names(&self) -> bool {
        self.inner.use_case_sensitive_file_names()
    }
    fn file_exists(&self, path: &str) -> bool {
        self.files.contains_key(path) || self.inner.file_exists(path)
    }
    fn read_file(&self, path: &str) -> Option<String> {
        match self.files.get(path) {
            Some(t) => Some(t.clone()),
            None => self.inner.read_file(path),
        }
    }
    fn write_file(&self, path: &str, data: &str) -> Result<(), String> {
        self.inner.write_file(path, data)
    }
    fn append_file(&self, path: &str, data: &str) -> Result<(), String> {
        self.inner.append_file(path, data)
    }
    fn remove(&self, path: &str) -> Result<(), String> {
        self.inner.remove(path)
    }
    fn chtimes(&self, path: &str, a: SystemTime, m: SystemTime) -> Result<(), String> {
        self.inner.chtimes(path, a, m)
    }
    fn directory_exists(&self, path: &str) -> bool {
        self.inner.directory_exists(path)
    }
    fn get_accessible_entries(&self, path: &str) -> Entries {
        self.inner.get_accessible_entries(path)
    }
    fn stat(&self, path: &str) -> Option<FileInfo> {
        self.inner.stat(path)
    }
    fn realpath(&self, path: &str) -> String {
        self.inner.realpath(path)
    }
}

pub struct SchemaProgram {
    pub program: &'static tsrs_compiler::Program,
    pub checker: Chk,
    pub root_file_names: Vec<String>,
}

impl SchemaProgram {
    pub fn source_files(&self) -> Vec<P<SourceFile>> {
        self.program.get_source_files().to_vec()
    }
}

/// createProgramWithVirtualFile's program: the project tsconfig's full
/// options (unlike the inspector's own program, which takes only its path
/// mappings), rooted at the virtual file alone so it loads exactly the
/// transitive closure of the types it imports.
pub fn create_schema_program(tsconfig: &str, virtual_path: &str, content: &str, cache: Option<&Cache>) -> SchemaProgram {
    let cwd = std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    let base: Arc<dyn FS> = Arc::new(bundled::wrap_fs(osvfs::fs()));
    let fsys: Arc<dyn FS> = Arc::new(OverlayFs {
        inner: base,
        files: HashMap::from([(virtual_path.to_string(), content.to_string())]),
    });
    let mut host: Arc<dyn CompilerHost> = new_compiler_host(&cwd, fsys.clone(), &bundled::lib_path(), None, None, None);
    if let Some(cache) = cache {
        host = Arc::new(CachingHost::new(host, cache.clone()));
    }
    let opts = read_tsconfig(tsconfig, &fsys, &cwd).unwrap_or_else(|| P::new(tsrs_core::CompilerOptions::default()));
    let parsed = tsoptions::new_parsed_command_line(
        opts,
        vec![virtual_path.to_string()],
        vec![],
        ComparePathsOptions { use_case_sensitive_file_names: fsys.use_case_sensitive_file_names(), current_directory: cwd },
    );
    let program = new_program(ProgramOptions::new(P::new(parsed), host));
    program.bind_source_files();
    let checker = Chk::new(program.get_type_checker(&Context::background()));
    SchemaProgram { program, checker, root_file_names: vec![virtual_path.to_string()] }
}

pub fn virtual_file_path(tsconfig: &str) -> String {
    let abs = if std::path::Path::new(tsconfig).is_absolute() {
        std::path::PathBuf::from(tsconfig)
    } else {
        std::env::current_dir().unwrap_or_default().join(tsconfig)
    };
    let dir = abs.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    tspath::normalize_path(&dir.join(VIRTUAL_FILE_NAME).to_string_lossy())
}
