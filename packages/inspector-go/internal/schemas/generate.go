// Package schemas ports utils/schema-generator.ts: the JSON Schemas for every
// function input and output, custom type and schemasFromTypes entry, from Zod
// values (through a VendorSchemaConverter) and from TypeScript types (through
// the vendored ts-json-schema-generator in internal/tsjg).
package schemas

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/program"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/config"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/factory"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/generator"
)

// Config is the TS schemaConfig ({ tsconfig, schemasFromTypes, schema,
// cacheDir }) plus the converter for Zod schemas.
type Config struct {
	Tsconfig         string
	SchemasFromTypes []string
	// AdditionalProperties is schema.additionalProperties; nil means false.
	// schema.supportsImportAttributes only matters to codegen, not here.
	AdditionalProperties *bool
	// CacheDir is where the TS schemas are cached across runs, in
	// go-ts-schemas.json (cache.go). Empty disables the cache.
	CacheDir string
	// Vendor converts schemaLookup. When the lookup is non-empty and Vendor
	// is nil, GenerateAll fails rather than return a state missing them.
	Vendor VendorSchemaConverter
}

// GenerateAll is generateAllSchemas. Like the TS it adds each converted Zod
// schema's type to the typesMap as a custom type, and its result replaces
// state.schemas. An error means inspection failed, as the TS throw does.
func GenerateAll(log *diag.Logger, cfg Config, st *state.State, cache *program.Cache) (state.Record[state.Raw], error) {
	vendorSchemas, err := generateVendorSchemas(log, cfg.Vendor, st)
	if err != nil {
		return state.Record[state.Raw]{}, err
	}
	covered := map[string]bool{}
	for _, s := range vendorSchemas {
		covered[s.Name] = true
	}

	tsSchemas := generateTSSchemas(log, cfg, st, covered, cache)

	var out state.Record[state.Raw]
	tsSchemas.Each(func(k string, v state.Raw) { out.Set(k, v) })
	for _, s := range vendorSchemas {
		out.Set(s.Name, s.Schema)
	}
	return out, nil
}

// generateVendorSchemas is generateZodSchemas.
func generateVendorSchemas(log *diag.Logger, conv VendorSchemaConverter, st *state.State) ([]VendorSchema, error) {
	if st.SchemaLookup.Len() == 0 {
		return nil, nil
	}
	refs := make([]VendorRef, 0, st.SchemaLookup.Len())
	files := map[string]bool{}
	for _, name := range st.SchemaLookup.Keys() {
		ref := st.SchemaLookup.At(name)
		if ref.Vendor != "" && ref.Vendor != "zod" {
			return nil, fmt.Errorf("Schema '%s' uses %s which is not yet supported for JSON Schema generation. "+
				"Currently only Zod schemas can be converted to JSON Schema. "+
				"Please use Zod or contribute support for %s.", name, ref.Vendor, ref.Vendor)
		}
		refs = append(refs, VendorRef{Name: name, SchemaRef: ref})
		files[ref.SourceFile] = true
	}
	if conv == nil {
		return nil, fmt.Errorf("%d Zod schema(s) need converting to JSON Schema, which takes a JavaScript runtime, and no vendor schema converter is configured", len(refs))
	}
	log.Debugf("[TIMING] Zod schemas: %d schemas from %d files", len(refs), len(files))
	start := time.Now()
	res, err := conv.Convert(context.Background(), refs)
	if err != nil {
		return nil, err
	}
	if len(res.Errors) > 0 {
		for _, msg := range res.Errors {
			log.Error(msg)
		}
		plural := "s"
		if len(res.Errors) == 1 {
			plural = ""
		}
		return nil, fmt.Errorf("Schema generation failed for %d schema%s", len(res.Errors), plural)
	}
	tm := st.Functions.TypesMap
	for _, s := range res.Schemas {
		tm.AddCustomType(s.Name, s.TypeText, nil)
	}
	log.Debugf("[TIMING] Vendor schemas: %dms (%d generated)", time.Since(start).Milliseconds(), len(res.Schemas))
	return res.Schemas, nil
}

// generatorConfig is the option set generateTSSchemas passes over DEFAULT_CONFIG.
func generatorConfig(additionalProperties bool) *config.Config {
	cfg := config.Default()
	cfg.SkipTypeCheck = true
	cfg.TopRef = false
	cfg.DiscriminatorType = config.DiscriminatorOpenAPI
	cfg.Expose = config.ExposeExport
	cfg.JSDoc = config.JSDocExtended
	cfg.SortProps = true
	cfg.StrictTuples = false
	cfg.EncodeRefs = false
	cfg.AdditionalProperties = additionalProperties
	return cfg
}

// generateTSSchemas is generateTSSchemas: schemas for the names zod did not
// cover, from a second program rooted at the custom-types virtual file.
func generateTSSchemas(log *diag.Logger, cfg Config, st *state.State, covered map[string]bool, cache *program.Cache) state.Record[state.Raw] {
	var schemas state.Record[state.Raw]
	tm := st.Functions.TypesMap
	content, _ := GenerateCustomTypes(tm)

	names := SchemaNames(st, cfg.SchemasFromTypes)
	var uncovered []string
	for _, n := range names {
		if !primitiveTypes[n] && !covered[n] {
			uncovered = append(uncovered, n)
		}
	}
	if len(uncovered) == 0 {
		return schemas
	}
	sample := uncovered[:min(3, len(uncovered))]
	more := ""
	if len(uncovered) > 3 {
		more = "..."
	}
	log.Debugf("generateTSSchemas needed for %d types: %s%s", len(uncovered), strings.Join(sample, ", "), more)

	cacheKey := ""
	if cfg.CacheDir != "" {
		cacheKey = schemaCacheKey(cfg, content, uncovered)
		if cached, ok := readSchemaCache(log, cfg.CacheDir, cacheKey); ok {
			log.Debugf("Reusing on-disk TS schemas (types unchanged across runs)")
			return cached
		}
	}

	start := time.Now()
	prog := createSchemaProgram(cfg.Tsconfig, virtualFilePath(cfg.Tsconfig), content, cache)
	defer prog.release()
	log.Debugf("Created schema program in %dms (%d files)", time.Since(start).Milliseconds(), len(prog.SourceFiles()))

	gcfg := generatorConfig(cfg.AdditionalProperties != nil && *cfg.AdditionalProperties)
	gen := generator.NewSchemaGenerator(
		prog.Program, prog.checker,
		factory.CreateParser(prog.Program, prog.checker, gcfg),
		factory.CreateFormatter(gcfg),
		gcfg,
	)

	for _, name := range uncovered {
		def, err := gen.CreateSchema([]string{name})
		if err == nil {
			var b []byte
			if b, err = jsjson.Marshal(def, ""); err == nil {
				schemas.Set(name, state.Raw(b))
				continue
			}
		}
		ct, inTypesMap := tm.CustomType(name)
		var rootless *generator.RootlessError
		if errors.As(err, &rootless) {
			if inTypesMap {
				if fallback := primitiveTypeToSchema(ct.Type); fallback != nil {
					schemas.Set(name, fallback)
				}
			}
			continue
		}
		info := "not in typesMap"
		if inTypesMap {
			info = "type=" + ct.Type
		}
		log.Error(fmt.Sprintf("[%s] Error generating schema: %s. Message: %s. Type info: %s", diag.SchemaGenerationError, name, err.Error(), info))
	}
	if cacheKey != "" {
		var files []string
		for _, sf := range prog.SourceFiles() {
			files = append(files, sf.FileName())
		}
		writeSchemaCache(log, cfg.CacheDir, cacheKey, schemas, schemaDeps(files))
	}
	return schemas
}
