// Package protocol is the wire format between the TS wrapper and the Go
// binary: one Request in, one Response out (`inspect --stdin`), or NDJSON
// envelopes of them (`serve`).
package protocol

import (
	"encoding/json"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Version is bumped on any incompatible change to Request or Response.
const Version = 1

// Request is inspect()'s (routeFiles, options) pair.
type Request struct {
	RouteFiles []string `json:"routeFiles"`
	Options    Options  `json:"options"`
	// ChangedFiles is a serve-mode hint; the SourceFile cache compares file
	// text anyway, so it is only used for stats today.
	ChangedFiles []string `json:"changedFiles,omitempty"`
}

// Options is the serializable subset of InspectorOptions the analysis reads.
type Options struct {
	Tsconfig  string `json:"tsconfig,omitempty"`
	RootDir   string `json:"rootDir,omitempty"`
	SetupOnly bool   `json:"setupOnly,omitempty"`
	// Types is InspectorOptions.types. Only finalize reads it; it is
	// accepted and passed through untouched.
	Types json.RawMessage `json:"types,omitempty"`
	// SchemaConfig is InspectorOptions.schemaConfig; schemas are generated
	// only when it is present.
	SchemaConfig *SchemaConfig `json:"schemaConfig,omitempty"`

	// Read only by finalize (`inspect --finalize`, `finalize --stdin`).
	// OpenAPI is InspectorOptions.openAPI ({ additionalInfo }); Manifest is
	// the versions.pikku.json contents; ModelAliases is pikku.config.json's
	// "models" table; StrictMeta turns on the agent tool description check.
	OpenAPI      json.RawMessage   `json:"openAPI,omitempty"`
	Manifest     json.RawMessage   `json:"manifest,omitempty"`
	ModelAliases map[string]string `json:"modelAliases,omitempty"`
	StrictMeta   bool              `json:"strictMeta,omitempty"`
}

// SchemaConfig mirrors the object packages/cli/src/services.ts passes.
type SchemaConfig struct {
	Tsconfig         string          `json:"tsconfig"`
	SchemasFromTypes []string        `json:"schemasFromTypes,omitempty"`
	Schema           json.RawMessage `json:"schema,omitempty"`
	CacheDir         string          `json:"cacheDir,omitempty"`
	// VendorScript is the Node script that converts Zod (vendor) schemas,
	// scripts/vendor-schemas.mjs or its published copy. Required when the
	// project has schemaLookup entries.
	VendorScript string `json:"vendorScript,omitempty"`
}

type Stats struct {
	Files          int `json:"files"`
	ProjectFiles   int `json:"projectFiles"`
	FilesReused    int `json:"filesReused"`
	Types          int `json:"types"`
	Instantiations int `json:"instantiations"`
	Symbols        int `json:"symbols"`
	CpuMs          int `json:"cpuMs"`
	WallMs         int `json:"wallMs"`
	HeapUsedMb     int `json:"heapUsedMb"`
}

// Response is the analysis result: pre-finalize state (finalized is always
// false; the TS finalize step runs on it), diagnostics, stats.
type Response struct {
	Protocol    int               `json:"protocol"`
	Finalized   bool              `json:"finalized"`
	State       *state.State      `json:"state"`
	Diagnostics []diag.Diagnostic `json:"diagnostics"`
	Stats       Stats             `json:"stats"`
}

// ServeRequest / ServeResponse are one NDJSON line each in `serve` mode.
type ServeRequest struct {
	ID     json.RawMessage `json:"id"`
	Method string          `json:"method"`
	Params Request         `json:"params"`
}

type ServeResponse struct {
	ID     json.RawMessage `json:"id"`
	Result *Response       `json:"result,omitempty"`
	Error  *ServeError     `json:"error,omitempty"`
}

type ServeError struct {
	Message string `json:"message"`
}
