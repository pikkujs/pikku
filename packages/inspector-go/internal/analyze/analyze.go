// Package analyze is inspect() up to the finalize boundary: build the
// program, run the setup / functions / routes sweeps and the analysis steps
// between them, generate schemas. Everything after that (contract hashes,
// manifest, service aggregation, validators, OpenAPI, …) is finalize and runs
// in TS on the returned state.
package analyze

import (
	"encoding/json"
	"runtime"
	"time"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/schemas"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/visit"
)

// Run inspects one request. cache may be nil; serve mode passes one cache for
// the life of the process.
func Run(req protocol.Request, cache *program.Cache) (resp *protocol.Response, err error) {
	defer func() {
		if r := recover(); r != nil {
			abort, ok := r.(visit.Abort)
			if !ok {
				panic(r)
			}
			resp, err = nil, abort
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

	log := &diag.Logger{}
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
		ctx.ResolveLatestVersions()
		if sc := req.Options.SchemaConfig; sc != nil {
			out, err := schemas.GenerateAll(log, schemaConfig(sc, st.RootDir), st, cache)
			if err != nil {
				return nil, err
			}
			st.Schemas = out
		}
	}

	ctx.FinishCoreTypeProperties()

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	return &protocol.Response{
		Protocol:    protocol.Version,
		Finalized:   false,
		State:       st,
		Diagnostics: log.Entries(),
		Stats: protocol.Stats{
			Files:        len(req.RouteFiles),
			ProjectFiles: len(prog.ProjectFiles),
			FilesReused:  prog.FilesReused,
			Types:        prog.TypeCount(),
			Symbols:      prog.SymbolCount(),
			WallMs:       int(time.Since(start).Milliseconds()),
			HeapUsedMb:   int(mem.HeapAlloc >> 20),
		},
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
	if sc.VendorScript != "" {
		cfg.Vendor = schemas.NodeConverter{Script: sc.VendorScript, Dir: rootDir}
	}
	return cfg
}
