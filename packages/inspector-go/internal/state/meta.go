package state

import "github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"

// Typed element structs for the sections whose visitor groups are ported.
//
// Field order is the order the TS visitor's object literal assigns the keys,
// because that is the order JSON.stringify writes them. omitempty / pointer
// fields are the ones TS leaves `undefined` (and JSON.stringify drops); a
// pointer without omitempty is a value TS writes as `null`.

// List is a JSON array that encodes nil as [] — the TS state never holds a
// missing array where this type is used.
type List[T any] []T

func (l List[T]) MarshalJSON() ([]byte, error) {
	if l == nil {
		return []byte("[]"), nil
	}
	return jsjson.Marshal([]T(l), "")
}

type Strings = List[string]

type ServicesMeta struct {
	Optimized bool     `json:"optimized"`
	Services  []string `json:"services"`
}

type WiresMeta struct {
	Optimized bool     `json:"optimized"`
	Wires     []string `json:"wires"`
}

// WireRef is a middleware or permission reference (MiddlewareMetadata /
// PermissionMetadata in @pikku/core).
type WireRef struct {
	Type   string `json:"type"`
	Name   string `json:"name,omitempty"`
	Tag    string `json:"tag,omitempty"`
	Inline *bool  `json:"inline,omitempty"`
	Route  string `json:"route,omitempty"`
}

type AuditMeta struct {
	Durability string `json:"durability"`
}

// FunctionMeta is FunctionsMeta[string] from @pikku/core.
//
// Fields written only by finalize (requiresSession is on routes; here:
// singletonServicesOnly, contractHash, inputHash, outputHash) are pointers so an
// analyze-only state omits them exactly as TS does.
type FunctionMeta struct {
	PikkuFuncId                     string       `json:"pikkuFuncId"`
	FunctionType                    string       `json:"functionType"`
	FuncWrapper                     string       `json:"funcWrapper,omitempty"`
	Sessionless                     *bool        `json:"sessionless,omitempty"`
	Name                            string       `json:"name"`
	Services                        ServicesMeta `json:"services"`
	Wires                           *WiresMeta   `json:"wires,omitempty"`
	Invokes                         []string     `json:"invokes,omitempty"`
	InputSchemaName                 *string      `json:"inputSchemaName"`
	OutputSchemaName                *string      `json:"outputSchemaName"`
	Inputs                          []string     `json:"inputs"`
	Outputs                         []string     `json:"outputs"`
	Expose                          *bool        `json:"expose,omitempty"`
	Auth                            *bool        `json:"auth,omitempty"`
	PermissionsInBody               *bool        `json:"permissionsInBody,omitempty"`
	Audit                           *AuditMeta   `json:"audit,omitempty"`
	Remote                          *bool        `json:"remote,omitempty"`
	ScenarioStep                    *bool        `json:"scenarioStep,omitempty"`
	WebhookReceive                  *bool        `json:"webhookReceive,omitempty"`
	Scenario                        *bool        `json:"scenario,omitempty"`
	MCP                             *bool        `json:"mcp,omitempty"`
	Readonly                        *bool        `json:"readonly,omitempty"`
	Deploy                          string       `json:"deploy,omitempty"`
	ApprovalRequired                *bool        `json:"approvalRequired,omitempty"`
	ApprovalDescription             string       `json:"approvalDescription,omitempty"`
	WorkflowQueued                  *bool        `json:"workflowQueued,omitempty"`
	WorkflowRetries                 *float64     `json:"workflowRetries,omitempty"`
	WorkflowTimeout                 string       `json:"workflowTimeout,omitempty"`
	Compensate                      *bool        `json:"compensate,omitempty"`
	ScenarioStepSurfaces            []string     `json:"scenarioStepSurfaces,omitempty"`
	ScenarioStepRequiresVirtualUser *bool        `json:"scenarioStepRequiresVirtualUser,omitempty"`
	ScenarioStepKind                string       `json:"scenarioStepKind,omitempty"`
	ScenarioStepAddon               string       `json:"scenarioStepAddon,omitempty"`
	ScenarioStepTemplate            string       `json:"scenarioStepTemplate,omitempty"`
	Scopes                          []string     `json:"scopes,omitempty"`
	ImplementationHash              string       `json:"implementationHash,omitempty"`
	Version                         *int         `json:"version,omitempty"`
	Title                           *string      `json:"title,omitempty"`
	Tags                            []string     `json:"tags,omitzero"`
	Summary                         *string      `json:"summary,omitempty"`
	Description                     *string      `json:"description,omitempty"`
	Errors                          []string     `json:"errors,omitempty"`
	Middleware                      []WireRef    `json:"middleware,omitempty"`
	Permissions                     []WireRef    `json:"permissions,omitempty"`
	IsDirectFunction                *bool        `json:"isDirectFunction,omitempty"`
	SourceFile                      string       `json:"sourceFile,omitempty"`
	BodySourceFile                  string       `json:"bodySourceFile,omitempty"`
	ExportedName                    string       `json:"exportedName,omitempty"`
	BodyStart                       *int         `json:"bodyStart,omitempty"`
	BodyEnd                         *int         `json:"bodyEnd,omitempty"`
	StartsWorkflows                 []string     `json:"startsWorkflows,omitempty"`

	// Finalize-only (contract-hashes.ts, post-process.ts).
	ContractHash          string `json:"contractHash,omitempty"`
	InputHash             string `json:"inputHash,omitempty"`
	OutputHash            string `json:"outputHash,omitempty"`
	SingletonServicesOnly *bool  `json:"singletonServicesOnly,omitempty"`

	// Inline is analysis scratch: the entry was created by
	// ensureFunctionMetadata for a function declared inline in a wiring
	// rather than exported. Never serialized; it selects the key order TS
	// gives such an entry (see inlineMetaKeyOrder).
	Inline bool `json:"-"`

	// Verbatim, when set, is what the entry serializes as instead of the
	// typed fields: metadata read whole from an addon's generated file, or a
	// partial entry TS writes with only some of the keys. The keys finalize
	// assigns afterwards (the contract hashes, singletonServicesOnly) are
	// laid over it.
	Verbatim Raw `json:"-"`
}

func (m *FunctionMeta) MarshalJSON() ([]byte, error) {
	if m.Verbatim != nil {
		var keys []string
		vals := map[string]any{}
		for _, kv := range []struct {
			k  string
			v  any
			on bool
		}{
			{"contractHash", m.ContractHash, m.ContractHash != ""},
			{"inputHash", m.InputHash, m.InputHash != ""},
			{"outputHash", m.OutputHash, m.OutputHash != ""},
			{"singletonServicesOnly", m.SingletonServicesOnly, m.SingletonServicesOnly != nil},
		} {
			if kv.on {
				keys = append(keys, kv.k)
				vals[kv.k] = kv.v
			}
		}
		return overlayObjectKeys(m.Verbatim, keys, vals)
	}
	type plain FunctionMeta
	b, err := jsjson.Marshal((*plain)(m), "")
	if err != nil || !m.Inline {
		return b, err
	}
	return reorderObjectKeys(b, inlineMetaKeysFirst, inlineMetaKeysLast)
}

// inlineMetaKeysFirst and inlineMetaKeysLast are the key order of a
// FunctionMeta that ensure-function-metadata.ts creates: the literal it
// assigns (with its `middleware: undefined` slot), then `sourceFile`, then
// whatever else was set, then the keys TS assigns last — tags, permissions,
// ensureInlineWiringFunction's `sessionless` and finalize's hashes. JS keeps
// a key where it was first assigned, so these land after the literal.
var (
	inlineMetaKeysFirst = []string{"pikkuFuncId", "functionType", "name", "services", "inputSchemaName", "outputSchemaName", "inputs", "outputs", "middleware", "sourceFile"}
	inlineMetaKeysLast  = []string{"tags", "permissions", "sessionless", "contractHash", "inputHash", "outputHash", "singletonServicesOnly"}
)

type HTTPRouteMeta struct {
	PikkuFuncId       string    `json:"pikkuFuncId"`
	PackageName       string    `json:"packageName,omitempty"`
	Route             string    `json:"route"`
	SourceFile        string    `json:"sourceFile"`
	Method            string    `json:"method"`
	Auth              *bool     `json:"auth,omitempty"`
	Params            []string  `json:"params,omitempty"`
	Query             []string  `json:"query,omitempty"`
	Title             *string   `json:"title,omitempty"`
	Summary           *string   `json:"summary,omitempty"`
	Description       *string   `json:"description,omitempty"`
	Errors            []string  `json:"errors,omitempty"`
	Tags              []string  `json:"tags,omitzero"`
	Middleware        []WireRef `json:"middleware,omitempty"`
	Permissions       []WireRef `json:"permissions,omitempty"`
	SSE               *bool     `json:"sse,omitempty"`
	HeadersSchemaName string    `json:"headersSchemaName,omitempty"`
	GroupBasePath     string    `json:"groupBasePath,omitempty"`
	// Set by annotateHttpRouteAuth, a finalize step: absent after analysis.
	RequiresSession *bool `json:"requiresSession,omitempty"`

	// Verbatim: see FunctionMeta.Verbatim.
	Verbatim Raw `json:"-"`
}

func (m *HTTPRouteMeta) MarshalJSON() ([]byte, error) {
	if m.Verbatim != nil {
		if m.RequiresSession == nil {
			return m.Verbatim, nil
		}
		return overlayObjectKeys(m.Verbatim, []string{"requiresSession"}, map[string]any{"requiresSession": m.RequiresSession})
	}
	type plain HTTPRouteMeta
	return jsjson.Marshal((*plain)(m), "")
}

type QueueWorkerMeta struct {
	PikkuFuncId string `json:"pikkuFuncId"`
	// NameFirst puts `name` ahead of `pikkuFuncId`, the order of the
	// synthetic workflow queue entries post-process.ts writes. Never
	// serialized.
	NameFirst   bool      `json:"-"`
	PackageName string    `json:"packageName,omitempty"`
	Name        string    `json:"name"`
	Summary     *string   `json:"summary,omitempty"`
	Description *string   `json:"description,omitempty"`
	Errors      []string  `json:"errors,omitempty"`
	Tags        []string  `json:"tags,omitzero"`
	Middleware  []WireRef `json:"middleware,omitempty"`
}

func (m *QueueWorkerMeta) MarshalJSON() ([]byte, error) {
	type plain QueueWorkerMeta
	b, err := jsjson.Marshal((*plain)(m), "")
	if err != nil || !m.NameFirst {
		return b, err
	}
	return reorderObjectKeys(b, []string{"name"}, nil)
}

// MetaInputTypes is one entry of http.metaInputTypes. computeInputTypes
// always assigns all three arrays, empty ones included.
type MetaInputTypes struct {
	Query  Strings `json:"query"`
	Params Strings `json:"params"`
	Body   Strings `json:"body"`
}

// NameAndType is one entry of a PathToNameAndType map.
type NameAndType struct {
	Variable string  `json:"variable"`
	Type     *string `json:"type"`
	TypePath *string `json:"typePath"`
}

// PathToNameAndType is `Map<file, NameAndType[]>`.
type PathToNameAndType = Map[[]NameAndType]

// FileExport is the `{ path, exportedName }` value of the *Files maps.
type FileExport struct {
	Path         string `json:"path"`
	ExportedName string `json:"exportedName"`
}

// SchemaRef is a schemaLookup entry: a Standard Schema value to convert to
// JSON Schema later.
type SchemaRef struct {
	VariableName string `json:"variableName"`
	SourceFile   string `json:"sourceFile"`
	Vendor       string `json:"vendor,omitempty"`
}

// SecretUsage is extract-secret-usage.ts's per-file result.
type SecretUsage struct {
	Keys    Strings `json:"keys"`
	Dynamic Strings `json:"dynamic"`
}

// SurfaceUsage is one symbol's counters in surfaceUsage.
type SurfaceUsage struct {
	Imports int     `json:"imports"`
	SeenIn  Strings `json:"seenIn"`
	Files   Strings `json:"files"`
}

// InspectorDiagnostic is a state.diagnostics entry (computeDiagnostics).
type InspectorDiagnostic struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	SourceFile string `json:"sourceFile"`
	Position   int    `json:"position"`
}

// Stats is InspectorPassStats; the protocol carries it beside the state.
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
