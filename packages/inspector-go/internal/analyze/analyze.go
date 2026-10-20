// Package analyze is inspect() up to the finalize boundary: build the
// program, run the setup / functions / routes sweeps and the analysis steps
// between them, generate schemas. Everything after that (contract hashes,
// manifest, service aggregation, validators, OpenAPI, …) is finalize and runs
// in TS on the returned state.
package analyze

import (
	"encoding/json"
	"os"
	"os/exec"
	"runtime"
	"runtime/debug"
	"time"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/schemas"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/schemas/zodjs"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/visit"
)

// Run inspects one request. cache may be nil; serve mode passes one cache for
// the life of the process.
//
// An error raised after logging began (a schema generation failure, an
// Abort) is a *protocol.Failure that carries the diagnostics logged so far.
func Run(req protocol.Request, cache *program.Cache) (resp *protocol.Response, err error) {
	log := &diag.Logger{}
	defer func() {
		if r := recover(); r != nil {
			abort, ok := r.(visit.Abort)
			if !ok {
				panic(r)
			}
			resp, err = nil, &protocol.Failure{Message: abort.Message, Diagnostics: log.Entries()}
		}
	}()
	start := time.Now()
	if cache != nil {
		cache.Begin()
		defer cache.Prune()
	}
	prog, err := program.Create(program.Options{
		RouteFiles: req.RouteFiles,
		RootDir:    req.Options.RootDir,
		Tsconfig:   req.Options.Tsconfig,
	}, cache)
	if err != nil {
		return nil, err
	}
	defer prog.Release()

	st := state.New(prog.RootDir)
	ctx := visit.NewContext(prog.Checker, st, log, visit.Options{
		SetupOnly:             req.Options.SetupOnly,
		AllowComplexWorkflows: req.Options.Allow != nil && req.Options.Allow.ComplexWorkflows,
		IsAddon:               req.Options.IsAddon,
	})

	ctx.SweepUsage(prog.ProjectFiles)
	ctx.Sweep(visit.PhaseSetup, prog.ProjectFiles)
	ctx.LoadAddonFunctionsMeta()
	if !req.Options.SetupOnly {
		ctx.Sweep(visit.PhaseFunctions, prog.ProjectFiles)
		ctx.Sweep(visit.PhaseRoutes, prog.ProjectFiles)
		ctx.ValidateWebhookSourceTriggers()
		ctx.ValidatePikkuStudio()
		ctx.ResolveLatestVersions()
	}

	ctx.FinishCoreTypeProperties()
	ctx.FinishServiceTypes()

	stats := protocol.Stats{
		Files:          len(req.RouteFiles),
		ProjectFiles:   len(prog.ProjectFiles),
		FilesReused:    prog.FilesReused,
		Types:          prog.TypeCount(),
		Instantiations: prog.InstantiationCount(),
		Symbols:        prog.SymbolCount(),
	}

	if sc := req.Options.SchemaConfig; sc != nil && !req.Options.SetupOnly {
		// Schema generation starts Node for the Zod schemas and builds a
		// program of its own. Nothing reads the analysis checker from here
		// on, and it is most of the heap, so it goes first.
		prog.Release()
		debug.FreeOSMemory()
		out, err := schemas.GenerateAll(log, schemaConfig(sc, st.RootDir), st, cache)
		if err != nil {
			return nil, &protocol.Failure{Message: err.Error(), Diagnostics: log.Entries()}
		}
		st.Schemas = out
	}

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	stats.CpuMs = processCPUMs()
	stats.WallMs = int(time.Since(start).Milliseconds())
	stats.HeapUsedMb = int(mem.HeapAlloc >> 20)
	return &protocol.Response{
		Protocol:    protocol.Version,
		Finalized:   false,
		State:       st,
		Diagnostics: log.Entries(),
		Stats:       stats,
	}, nil
}

// schemaConfig maps inspect()'s schemaConfig onto the schema package's.
// schema.supportsImportAttributes is codegen-only and not read here.
func schemaConfig(sc *protocol.SchemaConfig, rootDir string) schemas.Config {
	var schema struct {
		AdditionalProperties *bool `json:"additionalProperties"`
	}
	if len(sc.Schema) > 0 {
		_ = json.Unmarshal(sc.Schema, &schema)
	}
	cfg := schemas.Config{
		Tsconfig:             sc.Tsconfig,
		SchemasFromTypes:     sc.SchemasFromTypes,
		AdditionalProperties: schema.AdditionalProperties,
		CacheDir:             sc.CacheDir,
	}
	node := nodeConverter(sc.VendorScript, rootDir)
	// PIKKU_INSPECTOR_ZOD=node converts every Zod schema under Node;
	// =quickjs never does, so a schema QuickJS refuses is an error (CI's
	// parity run, which must not pass by way of Node).
	switch os.Getenv("PIKKU_INSPECTOR_ZOD") {
	case "node":
		if node != nil {
			cfg.Vendor = node
			return cfg
		}
	case "quickjs":
		node = nil
	}
	cfg.Vendor = zodjs.Converter{Dir: rootDir, Tsconfig: sc.Tsconfig, CacheDir: sc.CacheDir, Fallback: node}
	return cfg
}

// nodeConverter is the Node fallback, or nil without a node on the PATH or
// with the script out of reach (inside a compiled CLI it is not on disk).
func nodeConverter(script, rootDir string) schemas.VendorSchemaConverter {
	if script == "" {
		return nil
	}
	if _, err := os.Stat(script); err != nil {
		return nil
	}
	if _, err := exec.LookPath("node"); err != nil {
		return nil
	}
	return schemas.NodeConverter{Script: script, Dir: rootDir}
}
