package finalize

// The finalize steps run.go calls at their finalize.ts positions, under the
// signatures finalize_b_stubs.go declared; this file replaces that one.

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// computeContractHashes is contract-hashes.ts computeContractHashes.
func computeContractHashes(st *state.State) { ComputeContractHashes(st) }

// loadAddonSchemas is load-addon-functions-meta.ts loadAddonSchemas.
func loadAddonSchemas(log *diag.Logger, st *state.State) error {
	LoadAddonSchemas(log, st)
	return nil
}

// finalizeManifest is finalize.ts's manifest block.
func finalizeManifest(st *state.State, opts protocol.Options) error {
	return ApplyManifest(st, opts.Manifest)
}

func finalizeWorkflows(st *state.State) error { return FinalizeWorkflows(st) }

func finalizeWorkflowHelperTypes(st *state.State) error { return FinalizeWorkflowHelperTypes(st) }

func finalizeWorkflowWires(st *state.State) error { return FinalizeWorkflowWires(st) }

// getFilesAndMethods writes state.filesAndMethods / filesAndMethodsErrors.
func getFilesAndMethods(st *state.State, opts protocol.Options) error {
	return GetFilesAndMethods(st, opts.Types)
}

// generateOpenAPISpec writes state.openAPISpec; Run calls it only when
// opts.OpenAPI is set.
func generateOpenAPISpec(log *diag.Logger, st *state.State, opts protocol.Options) error {
	return GenerateOpenAPISpec(log, st, opts.OpenAPI)
}
