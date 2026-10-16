package schemas

import (
	"context"
	"os"
	"path/filepath"
	"time"

	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
)

// VirtualFileName is the root file of the schema program, created beside the
// tsconfig and served from memory.
const VirtualFileName = "__pikku_virtual_types__.ts"

// fileSystem is vfs.FS, spelled out because the vfs package has no shim. E, I
// and W are inferred as vfs.Entries, vfs.FileInfo and vfs.WalkDirFunc from the
// value passed to newOverlayFS.
type fileSystem[E, I, W any] interface {
	UseCaseSensitiveFileNames() bool
	FileExists(path string) bool
	ReadFile(path string) (string, bool)
	WriteFile(path string, data string) error
	AppendFile(path string, data string) error
	Remove(path string) error
	Chtimes(path string, aTime, mTime time.Time) error
	DirectoryExists(path string) bool
	GetAccessibleEntries(path string) E
	Stat(path string) I
	WalkDir(root string, walkFn W) error
	Realpath(path string) string
}

// overlayFS serves files from memory ahead of the wrapped file system, like the
// customHost in createProgramWithVirtualFile.
type overlayFS[E, I, W any] struct {
	fileSystem[E, I, W]
	files map[string]string
}

func newOverlayFS[E, I, W any](inner fileSystem[E, I, W], files map[string]string) *overlayFS[E, I, W] {
	return &overlayFS[E, I, W]{fileSystem: inner, files: files}
}

func (o *overlayFS[E, I, W]) FileExists(path string) bool {
	if _, ok := o.files[path]; ok {
		return true
	}
	return o.fileSystem.FileExists(path)
}

func (o *overlayFS[E, I, W]) ReadFile(path string) (string, bool) {
	if text, ok := o.files[path]; ok {
		return text, true
	}
	return o.fileSystem.ReadFile(path)
}

type schemaProgram struct {
	*compiler.Program
	checker *checker.Checker
	release func()
}

// createSchemaProgram builds createProgramWithVirtualFile's program: the
// project tsconfig's full options (unlike the inspector's own program, which
// takes only its path mappings), rooted at the virtual file alone so it loads
// exactly the transitive closure of the types it imports.
func createSchemaProgram(tsconfig, virtualPath, content string, cache *program.Cache) *schemaProgram {
	cwd, _ := os.Getwd()
	fsys := newOverlayFS(bundled.WrapFS(osvfs.FS()), map[string]string{virtualPath: content})
	var host compiler.CompilerHost = compiler.NewCompilerHost(cwd, fsys, bundled.LibPath(), nil, nil)
	if cache != nil {
		host = cache.Host(host)
	}
	opts := program.ReadTsconfig(tsconfig, host)
	if opts == nil {
		opts = &core.CompilerOptions{}
	}
	parsed := tsoptions.NewParsedCommandLine(opts, []string{virtualPath}, tspath.ComparePathsOptions{
		UseCaseSensitiveFileNames: fsys.UseCaseSensitiveFileNames(),
		CurrentDirectory:          cwd,
	})
	prog := compiler.NewProgram(compiler.ProgramOptions{Config: parsed, Host: host})
	prog.BindSourceFiles()
	c, release := prog.GetTypeChecker(context.Background())
	return &schemaProgram{Program: prog, checker: c, release: release}
}

func virtualFilePath(tsconfig string) string {
	abs, err := filepath.Abs(tsconfig)
	if err != nil {
		abs = tsconfig
	}
	return tspath.NormalizePath(filepath.Join(filepath.Dir(abs), VirtualFileName))
}
