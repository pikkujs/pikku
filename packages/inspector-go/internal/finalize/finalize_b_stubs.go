package finalize

// Placeholders for the finalize steps ported by finalize-b. Run (run.go)
// calls each at its finalize.ts position; finalize-b replaces this whole file
// with the real implementations under the same signatures. Each is a no-op
// here, so a state finalized with these stubs keeps those sections as
// analysis left them.

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// computeContractHashes is contract-hashes.ts computeContractHashes(state.schemas,
// state.functions.typesMap, state.functions.meta).
func computeContractHashes(st *state.State) {}

// loadAddonSchemas is load-addon-functions-meta.ts loadAddonSchemas.
func loadAddonSchemas(log *diag.Logger, st *state.State) error { return nil }

// finalizeManifest is finalize.ts's manifest block: manifest.initial from
// options.manifest, extractContractsFromMeta, updateManifest, validateContracts.
func finalizeManifest(st *state.State, opts Options) {}

// finalizeWorkflows is utils/workflow/graph/finalize-workflows.ts.
func finalizeWorkflows(st *state.State) {}

// finalizeWorkflowHelperTypes is finalize-workflow-wires.ts finalizeWorkflowHelperTypes.
func finalizeWorkflowHelperTypes(st *state.State) {}

// finalizeWorkflowWires is finalize-workflow-wires.ts finalizeWorkflowWires.
func finalizeWorkflowWires(st *state.State) {}

// getFilesAndMethods is get-files-and-methods.ts, writing state.filesAndMethods
// and state.filesAndMethodsErrors (options.types is opts.Types).
func getFilesAndMethods(st *state.State, opts Options) {}

// generateOpenAPISpec is serialize-openapi-json.ts, writing state.openAPISpec.
// Run calls it only when opts.OpenAPI is set.
func generateOpenAPISpec(log *diag.Logger, st *state.State, opts Options) error { return nil }
