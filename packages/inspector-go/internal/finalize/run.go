// Package finalize is finalizeInspectorState (packages/inspector/src/finalize.ts):
// the checker-free half of an inspection. It reads only the state analysis
// produced and the request options, so it runs the same on a state Go just
// analyzed and on one deserialized from the TypeScript engine.
//
// Ownership: post-process.ts, annotate-http-route-auth.ts and the
// validate-exposed-functions-gated / validate-tags-resolve-to-middleware /
// validate-single-step-workflows validators live in this package's own files;
// contract hashes, addon schemas, the version manifest, workflow finalization,
// getFilesAndMethods and the OpenAPI spec are finalize_b.go and the files it
// calls into.
package finalize

import (
	"fmt"
	"time"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Options is InspectorOptions as the protocol carries it.
type Options = protocol.Options

// Run is finalizeInspectorState: every step, in finalize.ts order. It mutates
// st in place.
func Run(log *diag.Logger, st *state.State, opts Options) error {
	if !opts.SetupOnly {
		if opts.SchemaConfig != nil {
			computeContractHashes(st)
			computeRequiredSchemas(st, opts)
		}

		// Re-load addon schemas (generateAllSchemas replaces state.schemas).
		if err := loadAddonSchemas(log, st); err != nil {
			return err
		}

		// After the addon merge: an addon supplies its own schemas there.
		if opts.SchemaConfig != nil {
			validateSchemaReferences(log, st)
		}

		if err := finalizeManifest(st, opts); err != nil {
			return err
		}

		for _, step := range []func(*state.State) error{
			finalizeWorkflows,
			finalizeWorkflowHelperTypes,
			finalizeWorkflowWires,
		} {
			if err := step(st); err != nil {
				return err
			}
		}
	}

	startFilesAndMethods := time.Now()
	if err := getFilesAndMethods(st, opts); err != nil {
		return err
	}
	log.Debugf("Get files and methods completed in %sms", elapsedMs(startFilesAndMethods))

	if !opts.SetupOnly {
		log.BeginValidationPass()
		startAggregate := time.Now()
		stampAuthHandlerServices(st)
		aggregateRequiredServices(st)
		log.Debugf("Aggregate required services completed in %sms", elapsedMs(startAggregate))

		computeResolvedIOTypes(st)
		computeMiddlewareGroupsMeta(st)
		computePermissionsGroupsMeta(st)
		validateNoSecretAliasServices(log, st)
		registerDerivedOAuth2AppSecrets(st)
		validateSecretUsage(log, st)
		computeDiagnostics(st)
		validateSchemaWiringSeparation(log, st)
		validateWorkflowGraphAddons(log, st)
		validateSingleStepWorkflows(log, st)
		validateScenarioServices(log, st)
		validateScenarioSteps(log, st)
		validateScenarioFeatures(log, st)
		annotateHTTPRouteAuth(st)
		validateExposedFunctionsGated(log, st)
		validateTagsResolveToMiddleware(log, st)

		if len(opts.OpenAPI) > 0 && string(opts.OpenAPI) != "null" {
			if err := generateOpenAPISpec(log, st, opts); err != nil {
				return err
			}
		}

		validateAgentModels(log, st, opts.ModelAliases)
		validateAgentToolReferences(log, st, opts)
		validateAgentScorerReferences(log, st)
		validateSecretOverrides(log, st)
		validateVariableOverrides(log, st)
		validateCredentialOverrides(log, st)
		validateAddonUses(log, st)
		validateAddonContentGrants(log, st)
		validateRemoteAddonDependencies(log, st)
		validateRemoteAddonAuth(log, st)
		applyDeclaredScopes(st)
		validateScopeReferences(log, st)
		validateSystemRoleScopes(log, st)
		validateVirtualUserRoles(log, st)
		log.EndValidationPass()
	}
	return nil
}

func elapsedMs(start time.Time) string {
	return fmt.Sprintf("%.2f", float64(time.Since(start).Microseconds())/1000)
}
