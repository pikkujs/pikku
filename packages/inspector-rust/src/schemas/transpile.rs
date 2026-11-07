//! TypeScript to JavaScript for the Zod converter, through tsrs's own emitter
//! (the tsc emit pipeline), one file at a time: ES modules, no type checking,
//! no module resolution (the loader resolves imports itself).

use std::sync::{Arc, Mutex};

use tsrs_compiler::{EmitOnly, EmitOptions, ProgramOptions, new_compiler_host, new_program};
use tsrs_core::tspath::ComparePathsOptions;
use tsrs_core::{CompilerOptions, Context, JsxEmit, ModuleKind, P, ScriptTarget, Tristate};
use tsrs_tsoptions as tsoptions;
use tsrs_vfs::{FS, bundled, osvfs};

use crate::program::read_tsconfig;

pub struct Transpiler {
    options: CompilerOptions,
    fs: Arc<dyn FS>,
    cwd: String,
}

impl Transpiler {
    /// `tsconfig` may be empty or missing: the options are then the defaults.
    pub fn new(tsconfig: &str) -> Transpiler {
        let cwd = std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        let fs: Arc<dyn FS> = Arc::new(bundled::wrap_fs(osvfs::fs()));
        let mut options = read_tsconfig(tsconfig, &fs, &cwd)
            .map(|o| (*o).clone())
            .unwrap_or_default();
        options.module = ModuleKind::ES_NEXT;
        options.target = ScriptTarget::ES2022;
        options.jsx = JsxEmit::REACT_JSX;
        options.no_emit = Tristate::False;
        options.no_emit_on_error = Tristate::False;
        options.declaration = Tristate::False;
        options.declaration_map = Tristate::False;
        options.emit_declaration_only = Tristate::False;
        options.source_map = Tristate::False;
        options.inline_source_map = Tristate::False;
        options.inline_sources = Tristate::False;
        options.composite = Tristate::False;
        options.incremental = Tristate::False;
        options.no_lib = Tristate::True;
        options.no_resolve = Tristate::True;
        options.out_dir = String::new();
        options.root_dir = String::new();
        options.remove_comments = Tristate::True;
        Transpiler { options, fs, cwd }
    }

    /// The JavaScript of one TypeScript source file.
    pub fn transpile(&self, file: &str) -> Result<String, String> {
        let host = new_compiler_host(&self.cwd, self.fs.clone(), &bundled::lib_path(), None, None, None);
        let parsed = tsoptions::new_parsed_command_line(
            P::new(self.options.clone()),
            vec![file.to_string()],
            vec![],
            ComparePathsOptions {
                use_case_sensitive_file_names: self.fs.use_case_sensitive_file_names(),
                current_directory: self.cwd.clone(),
            },
        );
        let mut opts = ProgramOptions::new(P::new(parsed), host);
        opts.skip_module_resolution = true;
        let program = new_program(opts);
        let out: Mutex<Option<String>> = Mutex::new(None);
        let write = |_path: &str, text: &str, data: &mut tsrs_compiler::program_emit::WriteFileData| -> Result<(), String> {
            let is_js = data.source_file.is_some();
            if is_js {
                *out.lock().unwrap() = Some(text.to_string());
            }
            Ok(())
        };
        let source = program.get_source_file(file).ok_or_else(|| format!("{file} is not part of the program"))?;
        let result = program.emit(
            &Context::background(),
            &EmitOptions {
                target_source_files: Some(vec![source]),
                emit_only: EmitOnly::default(),
                force_emit: true,
                write_file: Some(&write),
            },
        );
        let _ = result;
        let text = out.lock().unwrap().take();
        text.ok_or_else(|| format!("tsrs emitted nothing for {file}"))
    }
}
