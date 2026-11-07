use std::sync::Arc;

use tsrs_core::CompilerOptions;
use tsrs_core::P;
use tsrs_tsoptions::{self as tsoptions, ParseConfigHost};
use tsrs_vfs::{FS, bundled, osvfs};

/// A `ts.sys`-like parse-config host: the real file system rooted at the cwd.
pub struct SysHost {
    pub fs: Arc<dyn FS>,
    pub cwd: String,
}

impl SysHost {
    pub fn new() -> &'static SysHost {
        let cwd = std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        let fs: Arc<dyn FS> = Arc::new(bundled::wrap_fs(osvfs::fs()));
        Box::leak(Box::new(SysHost { fs, cwd }))
    }
}

impl ParseConfigHost for SysHost {
    fn fs(&self) -> &dyn FS {
        &*self.fs
    }
    fn get_current_directory(&self) -> &str {
        &self.cwd
    }
}

/// Parses a tsconfig the way Go does with the cwd host; recoverable config
/// errors are ignored. `None` when the config cannot be read.
pub fn parse_config(path: &str, host: &'static SysHost) -> Option<tsoptions::ParsedCommandLine> {
    let (parsed, _errors) =
        tsoptions::get_parsed_command_line_of_config_file(path, Some(&CompilerOptions::default()), None, host, None);
    parsed
}

/// `utils/read-tsconfig-out-dir.ts`: the tsconfig's resolved
/// `compilerOptions.outDir`, following `extends`, or `None`.
pub fn read_tsconfig_out_dir(tsconfig: &str) -> Option<String> {
    let host = SysHost::new();
    let parsed = parse_config(tsconfig, host)?;
    let out = parsed.compiler_options()?.out_dir.clone();
    if out.is_empty() { None } else { Some(out) }
}

impl tsrs_module::ResolutionHost for SysHost {
    fn fs(&self) -> &dyn FS {
        &*self.fs
    }
    fn get_current_directory(&self) -> &str {
        &self.cwd
    }
}
