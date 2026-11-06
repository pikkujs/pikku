// Package typecheck type-checks one workspace file at a time with the tsconfig
// that owns it, the way tsc would, including text the editor has not saved.
// It is the Go side of @pikku/code-edit's TypeScriptService.
package typecheck

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Diagnostic is one problem in the file, with 1-based lines and UTF-16 columns.
type Diagnostic struct {
	Message     string `json:"message"`
	Code        int    `json:"code"`
	Severity    string `json:"severity"`
	StartLine   int    `json:"startLine"`
	StartColumn int    `json:"startColumn"`
	EndLine     int    `json:"endLine"`
	EndColumn   int    `json:"endColumn"`
}

var checkedFile = func(name string) bool {
	for _, ext := range []string{".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"} {
		if strings.HasSuffix(name, ext) {
			return true
		}
	}
	return false
}

type overlay struct{ file, text string }

// overlayHost serves one file from memory and everything else from disk. It
// wraps the caching host, so the cache is never asked about the overlay file.
type overlayHost struct {
	compiler.CompilerHost
	over *overlay
}

func (h overlayHost) GetSourceFile(opts ast.SourceFileParseOptions) *ast.SourceFile {
	if h.over != nil && opts.FileName == h.over.file {
		kind := core.GetScriptKindFromFileName(opts.FileName)
		return parser.ParseSourceFile(opts, h.over.text, kind)
	}
	return h.CompilerHost.GetSourceFile(opts)
}

// Service checks files under one workspace root. It keeps one unsaved overlay
// and a source-file cache, so a re-check re-parses only what changed.
type Service struct {
	root    string
	cache   *program.Cache
	overlay *overlay
}

// New returns a Service for the workspace at root.
func New(root string) *Service {
	abs, _ := filepath.Abs(root)
	return &Service{root: tspath.NormalizePath(abs), cache: program.NewCache()}
}

func (s *Service) host() compiler.CompilerHost {
	fsys := bundled.WrapFS(osvfs.FS())
	inner := compiler.NewCompilerHost(s.root, fsys, bundled.LibPath(), nil, nil)
	return overlayHost{CompilerHost: s.cache.Host(inner), over: s.overlay}
}

func normalize(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	return tspath.NormalizePath(abs)
}

// Diagnostics checks the file at absolute path; content stands in for the file
// on disk when non-nil. Files that are not code have none.
func (s *Service) Diagnostics(path string, content *string) []Diagnostic {
	file := normalize(path)
	if !checkedFile(file) {
		return []Diagnostic{}
	}
	if content != nil {
		if s.overlay == nil || s.overlay.file != file || s.overlay.text != *content {
			s.overlay = &overlay{file: file, text: *content}
		}
	} else if s.overlay != nil && s.overlay.file == file {
		s.overlay = nil
	}

	host := s.host()
	s.cache.Begin()
	defer s.cache.Prune()

	configPath := s.configFor(file, host)
	var parsed *tsoptions.ParsedCommandLine
	if configPath != "" {
		parsed = parse(configPath, host)
	}
	if parsed == nil {
		parsed = s.inferred(file, host)
	}
	options := parsed.CompilerOptions().Clone()
	options.NoEmit = core.TSTrue
	config := tsoptions.NewParsedCommandLine(options, parsed.FileNames(), tspath.ComparePathsOptions{
		UseCaseSensitiveFileNames: host.FS().UseCaseSensitiveFileNames(),
		CurrentDirectory:          s.root,
	})

	prog := compiler.NewProgram(compiler.ProgramOptions{Config: config, Host: host})
	sf := prog.GetSourceFile(file)
	if sf == nil {
		return []Diagnostic{}
	}
	ctx := context.Background()
	all := append(prog.GetSyntacticDiagnostics(ctx, sf), prog.GetSemanticDiagnostics(ctx, sf)...)
	out := make([]Diagnostic, 0, len(all))
	for _, d := range all {
		out = append(out, toDiagnostic(d, sf))
	}
	return out
}

func toDiagnostic(d *ast.Diagnostic, sf *ast.SourceFile) Diagnostic {
	text := sf.Text()
	lineStarts := scanner.GetECMALineStarts(sf)
	at := func(pos int) (line, column int) {
		idx := scanner.GetECMALineOfPosition(sf, pos)
		return idx + 1, tsutil.UTF16Offset(text, pos) - tsutil.UTF16Offset(text, int(lineStarts[idx])) + 1
	}
	startLine, startColumn := at(d.Pos())
	endLine, endColumn := at(d.End())
	severity := "info"
	switch int(d.Category()) {
	case 1:
		severity = "error"
	case 0:
		severity = "warning"
	}
	return Diagnostic{
		Message:     flatten(d, 0),
		Code:        int(d.Code()),
		Severity:    severity,
		StartLine:   startLine,
		StartColumn: startColumn,
		EndLine:     endLine,
		EndColumn:   endColumn,
	}
}

// flatten is ts.flattenDiagnosticMessageText(messageText, "\n"): the message,
// then each level of its chain on its own line, indented two spaces per level.
func flatten(d *ast.Diagnostic, indent int) string {
	var b strings.Builder
	if indent > 0 {
		b.WriteString("\n")
		b.WriteString(strings.Repeat("  ", indent))
	}
	b.WriteString(d.String())
	for _, kid := range d.MessageChain() {
		b.WriteString(flatten(kid, indent+1))
	}
	return b.String()
}

func parse(configPath string, host compiler.CompilerHost) *tsoptions.ParsedCommandLine {
	parsed, _ := tsoptions.GetParsedCommandLineOfConfigFile(configPath, &core.CompilerOptions{}, nil, host, nil)
	return parsed
}

// configFor is the nearest tsconfig, walking up and through project
// references, whose program includes the file; "" when none does.
func (s *Service) configFor(file string, host compiler.CompilerHost) string {
	dir := tspath.GetDirectoryPath(file)
	for strings.HasPrefix(dir, s.root) {
		found := findConfigFile(dir, host)
		if found == "" || !strings.HasPrefix(found, s.root) {
			return ""
		}
		if match := s.includes(found, file, map[string]bool{}, host); match != "" {
			return match
		}
		parent := tspath.GetDirectoryPath(tspath.GetDirectoryPath(found))
		if parent == dir {
			return ""
		}
		dir = parent
	}
	return ""
}

func findConfigFile(dir string, host compiler.CompilerHost) string {
	for {
		candidate := tspath.CombinePaths(dir, "tsconfig.json")
		if host.FS().FileExists(candidate) {
			return candidate
		}
		parent := tspath.GetDirectoryPath(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

type keyed interface{ Has(string) bool }

func (s *Service) includes(configPath, file string, seen map[string]bool, host compiler.CompilerHost) string {
	if seen[configPath] {
		return ""
	}
	seen[configPath] = true
	parsed := parse(configPath, host)
	if parsed == nil {
		return ""
	}
	raw, _ := parsed.Raw.(keyed)
	if raw == nil || !(raw.Has("include") || raw.Has("files") || raw.Has("extends")) {
		return ""
	}
	for _, f := range parsed.FileNames() {
		if normalize(f) == file {
			return configPath
		}
	}
	for _, ref := range parsed.ProjectReferences() {
		if match := s.includes(normalize(core.ResolveProjectReferencePath(ref)), file, seen, host); match != "" {
			return match
		}
	}
	return ""
}

// packageDir is the nearest folder with a package.json, for a file no tsconfig claims.
func (s *Service) packageDir(file string, host compiler.CompilerHost) string {
	dir := tspath.GetDirectoryPath(file)
	for strings.HasPrefix(dir, s.root) && dir != s.root {
		if host.FS().FileExists(tspath.CombinePaths(dir, "package.json")) {
			return dir
		}
		dir = tspath.GetDirectoryPath(dir)
	}
	return tspath.GetDirectoryPath(file)
}

func (s *Service) inferred(file string, host compiler.CompilerHost) *tsoptions.ParsedCommandLine {
	files := []string{file}
	root := s.packageDir(file, host)
	_ = host.FS().WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := d.Name()
		if d.IsDir() {
			if name == "node_modules" || name == "dist" {
				return filepath.SkipDir
			}
			return nil
		}
		for _, ext := range []string{".ts", ".tsx", ".mts", ".cts"} {
			if strings.HasSuffix(name, ext) {
				files = append(files, tspath.NormalizePath(path))
				break
			}
		}
		return nil
	})
	sort.Strings(files[1:])
	options := &core.CompilerOptions{
		Target:           core.ScriptTargetES2022,
		Module:           core.ModuleKindESNext,
		ModuleResolution: core.ModuleResolutionKindBundler,
		Jsx:              core.JsxEmitReactJSX,
		AllowJs:          core.TSTrue,
		Strict:           core.TSTrue,
		SkipLibCheck:     core.TSTrue,
		NoEmit:           core.TSTrue,
	}
	return tsoptions.NewParsedCommandLine(options, files, tspath.ComparePathsOptions{
		UseCaseSensitiveFileNames: host.FS().UseCaseSensitiveFileNames(),
		CurrentDirectory:          s.root,
	})
}
