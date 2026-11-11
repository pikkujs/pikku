package sourcescan

import (
	"os"

	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
)

// newHost is a compiler host over the real file system, rooted at the process
// working directory like ts.sys.
func newHost() compiler.CompilerHost {
	cwd, _ := os.Getwd()
	return compiler.NewCompilerHost(cwd, bundled.WrapFS(osvfs.FS()), bundled.LibPath(), nil, nil)
}

// ReadTsconfigOutDir ports utils/read-tsconfig-out-dir.ts: the tsconfig's
// resolved compilerOptions.outDir, following `extends`, or nil when it sets
// none or cannot be read. Recoverable config errors are ignored, as in TS.
func ReadTsconfigOutDir(tsconfig string) *string {
	parsed, _ := tsoptions.GetParsedCommandLineOfConfigFile(tsconfig, &core.CompilerOptions{}, nil, newHost(), nil)
	if parsed == nil || parsed.CompilerOptions().OutDir == "" {
		return nil
	}
	outDir := parsed.CompilerOptions().OutDir
	return &outDir
}
