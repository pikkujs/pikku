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
	// IsAddon is InspectorOptions.isAddon: the project is an addon package,
	// so checkAddonBans applies.
	IsAddon bool `json:"isAddon,omitempty"`
	// Types is InspectorOptions.types. Only finalize reads it; it is
	// accepted and passed through untouched.
	Types json.RawMessage `json:"types,omitempty"`
	// SchemaConfig is InspectorOptions.schemaConfig; schemas are generated
	// only when it is present.
	SchemaConfig *SchemaConfig `json:"schemaConfig,omitempty"`
	// Allow is InspectorOptions.allow, the project's opt-ins.
	Allow *Allow `json:"allow,omitempty"`

	// Read only by finalize (`inspect --finalize`, `finalize --stdin`).
	// OpenAPI is InspectorOptions.openAPI ({ additionalInfo }); Manifest is
	// the versions.pikku.json contents; ModelAliases is pikku.config.json's
	// "models" table; StrictMeta turns on the agent tool description check.
	OpenAPI      json.RawMessage   `json:"openAPI,omitempty"`
	Manifest     json.RawMessage   `json:"manifest,omitempty"`
	ModelAliases map[string]string `json:"modelAliases,omitempty"`
	StrictMeta   bool              `json:"strictMeta,omitempty"`
}

// Allow mirrors the `allow` block of pikku.config.json.
type Allow struct {
	ComplexWorkflows bool `json:"complexWorkflows,omitempty"`
}

// SchemaConfig mirrors the object packages/cli/src/services.ts passes.
type SchemaConfig struct {
	Tsconfig         string          `json:"tsconfig"`
	SchemasFromTypes []string        `json:"schemasFromTypes,omitempty"`
	Schema           json.RawMessage `json:"schema,omitempty"`
	CacheDir         string          `json:"cacheDir,omitempty"`
	// VendorScript is the Node script that converts the Zod (vendor) schemas
	// QuickJS cannot, scripts/vendor-schemas.mjs or its published copy.
	// Without it those schemas are errors.
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

// Response is the result of one inspection: the finalized state (analysis
// alone, from analyze.Run, leaves finalized false), diagnostics, stats. When
// the inspection failed after it began logging, Error is set, State is nil
// and Diagnostics holds what was logged up to the failure.
type Response struct {
	Protocol    int               `json:"protocol"`
	Finalized   bool              `json:"finalized"`
	State       *state.State      `json:"state,omitempty"`
	Diagnostics []diag.Diagnostic `json:"diagnostics"`
	Stats       Stats             `json:"stats"`
	// ValidationPass marks the diagnostics finalize logged between
	// logger.beginValidationPass() and logger.endValidationPass(): indices
	// [start, end) into Diagnostics. Absent when finalize did not run a
	// validation pass (analysis only, or setupOnly).
	ValidationPass *diag.Pass `json:"validationPass,omitempty"`
	// Error is the message the TypeScript inspector would have thrown.
	Error string `json:"error,omitempty"`
}

// Failure is an inspection that stopped with an error after logging: the
// TypeScript inspector logs, then throws. It carries the diagnostics so they
// still reach the user.
type Failure struct {
	Message     string
	Diagnostics []diag.Diagnostic
}

func (f *Failure) Error() string { return f.Message }

// FailureResponse is the Response that reports f.
func FailureResponse(f *Failure) *Response {
	diagnostics := f.Diagnostics
	if diagnostics == nil {
		diagnostics = []diag.Diagnostic{}
	}
	return &Response{Protocol: Version, Diagnostics: diagnostics, Error: f.Message}
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
