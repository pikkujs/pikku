// Package program builds the typescript-go program the inspector sweeps, with
// the same compiler options and source-file filter as inspector.ts.
package program

import (
	"context"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
)

type Options struct {
	// RouteFiles are the program's root files (inspect()'s routeFiles).
	RouteFiles []string
	// RootDir bounds the swept files; defaults to the common ancestor of
	// RouteFiles, like the TS findCommonAncestor fallback.
	RootDir string
	// Tsconfig is read for path mappings only (readProjectPathMappings).
	Tsconfig string
}

type Program struct {
	*compiler.Program
	Checker *checker.Checker
	// ProjectFiles are the files the sweeps visit: under RootDir, outside
	// node_modules and nested pikku projects, sorted by file name.
	ProjectFiles []*ast.SourceFile
	RootDir      string
	// FilesReused counts source files served from the cache unparsed.
	FilesReused int
	release     func()
}

// Release returns the checker to its pool and drops the program and checker,
// so the garbage collector can take them while the caller still holds p.
// Source files stay in the Cache for the next program to reuse.
func (p *Program) Release() {
	if p.release != nil {
		p.release()
		p.release = nil
	}
	p.Program = nil
	p.Checker = nil
	p.ProjectFiles = nil
}

// Create builds the program and checker. cache may be nil.
func Create(opts Options, cache *Cache) (*Program, error) {
	cwd, _ := os.Getwd()
	roots := make([]string, len(opts.RouteFiles))
	for i, f := range opts.RouteFiles {
		abs, err := filepath.Abs(f)
		if err != nil {
			return nil, err
		}
		roots[i] = tspath.NormalizePath(abs)
	}
	fsys := bundled.WrapFS(osvfs.FS())
	var host compiler.CompilerHost = compiler.NewCompilerHost(cwd, fsys, bundled.LibPath(), nil, nil)
	var counting *cachingHost
	if cache != nil {
		counting = cache.wrap(host)
		host = counting
	}

	compilerOpts := &core.CompilerOptions{
		Target:              core.ScriptTargetESNext,
		Module:              core.ModuleKindNode16,
		ModuleResolution:    core.ModuleResolutionKindNode16,
		SkipLibCheck:        core.TSTrue,
		SkipDefaultLibCheck: core.TSTrue,
		Types:               []string{},
		AllowJs:             core.TSFalse,
		CheckJs:             core.TSFalse,
	}
	if po := ReadTsconfig(opts.Tsconfig, host); po != nil {
		// readProjectPathMappings: only the resolution keys are copied, so
		// inference options such as `strict` stay the inspector's own.
		compilerOpts.Paths = po.Paths
		compilerOpts.BaseUrl = po.BaseUrl
		compilerOpts.RootDirs = po.RootDirs
		compilerOpts.PathsBasePath = po.PathsBasePath
	}
	parsed := tsoptions.NewParsedCommandLine(compilerOpts, roots, tspath.ComparePathsOptions{
		UseCaseSensitiveFileNames: fsys.UseCaseSensitiveFileNames(),
		CurrentDirectory:          cwd,
	})
	prog := compiler.NewProgram(compiler.ProgramOptions{Config: parsed, Host: host})
	prog.BindSourceFiles()
	c, release := prog.GetTypeChecker(context.Background())

	rootDir := opts.RootDir
	if rootDir == "" {
		rootDir = commonAncestor(roots)
	} else if abs, err := filepath.Abs(rootDir); err == nil {
		rootDir = abs
	}
	rootDir = tspath.NormalizePath(rootDir)

	isNested := NestedProjectFilter(rootDir)
	var files []*ast.SourceFile
	for _, sf := range prog.GetSourceFiles() {
		name := sf.FileName()
		if strings.HasPrefix(name, rootDir) && !strings.Contains(name, "/node_modules/") && !isNested(name) {
			files = append(files, sf)
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].FileName() < files[j].FileName() })

	p := &Program{Program: prog, Checker: c, ProjectFiles: files, RootDir: rootDir, release: release}
	if counting != nil {
		p.FilesReused = counting.reused
	}
	return p, nil
}

// ReadTsconfig parses a tsconfig's compiler options, or returns nil when there
// is none or it does not parse (TS logs this at debug level and carries on).
func ReadTsconfig(tsconfig string, host compiler.CompilerHost) *core.CompilerOptions {
	if tsconfig == "" {
		return nil
	}
	abs, err := filepath.Abs(tsconfig)
	if err != nil {
		return nil
	}
	parsed, errs := tsoptions.GetParsedCommandLineOfConfigFile(tspath.NormalizePath(abs), &core.CompilerOptions{}, nil, host, nil)
	if len(errs) > 0 || parsed == nil {
		return nil
	}
	return parsed.CompilerOptions()
}

func commonAncestor(files []string) string {
	if len(files) == 0 {
		return "/"
	}
	parts := strings.Split(path.Dir(files[0]), "/")
	for _, f := range files[1:] {
		other := strings.Split(path.Dir(f), "/")
		n := 0
		for n < len(parts) && n < len(other) && parts[n] == other[n] {
			n++
		}
		parts = parts[:n]
	}
	if j := strings.Join(parts, "/"); j != "" {
		return j
	}
	return "/"
}

// NestedProjectFilter reports files inside a nested pikku project under
// rootDir (a directory with its own pikku.config.json), with a per-directory
// cache like createNestedProjectFilter.
func NestedProjectFilter(rootDir string) func(string) bool {
	cache := map[string]bool{}
	return func(fileName string) bool {
		var pending []string
		dir := path.Dir(fileName)
		nested := false
		for strings.HasPrefix(dir, rootDir) && dir != rootDir {
			if v, ok := cache[dir]; ok {
				nested = v
				break
			}
			pending = append(pending, dir)
			if _, err := os.Stat(filepath.Join(dir, "pikku.config.json")); err == nil {
				nested = true
				break
			}
			parent := path.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
		for _, d := range pending {
			cache[d] = nested
		}
		return nested
	}
}
