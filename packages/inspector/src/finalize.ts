import { performance } from 'perf_hooks'
import type {
  InspectorState,
  InspectorLogger,
  InspectorOptions,
} from './types.js'
import { applyDeclaredScopes } from './utils/apply-declared-scopes.js'
import { getFilesAndMethods } from './utils/get-files-and-methods.js'
import {
  aggregateRequiredServices,
  stampAuthHandlerServices,
  validateAgentModels,
  validateAgentToolReferences,
  validateAgentScorerReferences,
  validateSecretOverrides,
  validateVariableOverrides,
  validateCredentialOverrides,
  validateAddonUses,
  validateAddonContentGrants,
  validateRemoteAddonDependencies,
  validateRemoteAddonAuth,
  validateScopeReferences,
  validateSystemRoleScopes,
  validateVirtualUserRoles,
  computeResolvedIOTypes,
  computeMiddlewareGroupsMeta,
  computePermissionsGroupsMeta,
  computeRequiredSchemas,
  validateNoSecretAliasServices,
  registerDerivedOAuth2AppSecrets,
  validateSecretUsage,
  computeDiagnostics,
  validateSchemaReferences,
  validateSchemaWiringSeparation,
  validateScenarioServices,
  validateScenarioSteps,
  validateScenarioFeatures,
  validateWorkflowGraphAddons,
} from './utils/post-process.js'
import { validateExposedFunctionsGated } from './utils/validate-exposed-functions-gated.js'
import { validateTagsResolveToMiddleware } from './utils/validate-tags-resolve-to-middleware.js'
import { validateSingleStepWorkflows } from './utils/validate-single-step-workflows.js'
import { annotateHttpRouteAuth } from './utils/annotate-http-route-auth.js'
import { generateOpenAPISpec } from './utils/serialize-openapi-json.js'
import { pikkuState } from '@pikku/core/state'
import { finalizeWorkflows } from './utils/workflow/graph/finalize-workflows.js'
import {
  finalizeWorkflowHelperTypes,
  finalizeWorkflowWires,
} from './utils/workflow/graph/finalize-workflow-wires.js'
import { loadAddonSchemas } from './utils/load-addon-functions-meta.js'
import {
  computeContractHashes,
  extractContractsFromMeta,
  updateManifest,
  createEmptyManifest,
  validateContracts,
} from './utils/contract-hashes.js'

export {
  serializeInspectorState,
  deserializeInspectorState,
} from './utils/serialize-inspector-state.js'
export type { SerializableInspectorState } from './utils/serialize-inspector-state.js'

/**
 * The checker-free half of an inspection: everything that derives from the
 * state analysis produced. It never loads `typescript`, so it runs the same
 * against a live analysis and against a state deserialized from another
 * engine.
 */
export const finalizeInspectorState = async <
  S extends Omit<InspectorState, 'typesLookup'>,
>(
  logger: InspectorLogger,
  analyzed: S,
  options: InspectorOptions = {}
): Promise<S> => {
  const state = analyzed as unknown as InspectorState

  if (!options.setupOnly) {
    if (options.schemaConfig) {
      computeContractHashes(
        state.schemas,
        state.functions.typesMap,
        state.functions.meta
      )
      computeRequiredSchemas(state, options)
    }

    // Re-load addon schemas (generateAllSchemas replaces state.schemas)
    await loadAddonSchemas(logger, state)

    // After the addon merge, not before: an addon supplies its own schemas here,
    // and checking earlier would report every one of them as unresolved.
    if (options.schemaConfig) {
      validateSchemaReferences(logger, state)
    }

    state.manifest.initial = options.manifest ?? null
    const contracts = extractContractsFromMeta(state.functions.meta)
    const baseManifest = state.manifest.initial ?? createEmptyManifest()
    state.manifest.current = updateManifest(baseManifest, contracts)
    state.manifest.errors = validateContracts(baseManifest, contracts).errors

    finalizeWorkflows(state)
    finalizeWorkflowHelperTypes(state)
    finalizeWorkflowWires(state)
  }

  // Populate filesAndMethods
  const startFilesAndMethods = performance.now()
  const { result, errors } = getFilesAndMethods(state, options.types)
  state.filesAndMethods = result
  state.filesAndMethodsErrors = errors
  logger.debug(
    `Get files and methods completed in ${(performance.now() - startFilesAndMethods).toFixed(2)}ms`
  )

  if (!options.setupOnly) {
    // Everything below re-derives from the state this pass just built, so it
    // supersedes whatever an earlier pass concluded about a source graph the
    // run has since finished generating into.
    logger.beginValidationPass?.()
    const startAggregate = performance.now()
    // Apply the inspected auth handler service set before aggregation so it
    // flows into requiredServices (the generated handler's own func is opaque).
    stampAuthHandlerServices(state)
    aggregateRequiredServices(state)
    logger.debug(
      `Aggregate required services completed in ${(performance.now() - startAggregate).toFixed(2)}ms`
    )

    computeResolvedIOTypes(state)
    computeMiddlewareGroupsMeta(state)
    computePermissionsGroupsMeta(state)
    validateNoSecretAliasServices(logger, state)
    registerDerivedOAuth2AppSecrets(state)
    validateSecretUsage(logger, state)
    computeDiagnostics(state)
    validateSchemaWiringSeparation(logger, state)
    validateWorkflowGraphAddons(logger, state)
    validateSingleStepWorkflows(logger, state)
    validateScenarioServices(logger, state)
    validateScenarioSteps(logger, state)
    validateScenarioFeatures(logger, state)
    // Needs every route, every function and every wireAddon declaration
    // together, so it can only run once the whole program is inspected.
    annotateHttpRouteAuth(state)
    // Last of the validators: they read function meta and every wireAddon
    // declaration together, so they need the whole program inspected.
    validateExposedFunctionsGated(logger, state)
    validateTagsResolveToMiddleware(logger, state)

    if (options.openAPI) {
      state.openAPISpec = await generateOpenAPISpec(
        logger,
        state.functions.meta,
        state.http.meta,
        state.schemas,
        options.openAPI.additionalInfo,
        pikkuState(null, 'misc', 'errors')
      )
    }

    validateAgentModels(logger, state, options.modelAliases)
    validateAgentToolReferences(logger, state, options)
    validateAgentScorerReferences(logger, state)
    validateSecretOverrides(logger, state)
    validateVariableOverrides(logger, state)
    validateCredentialOverrides(logger, state)
    validateAddonUses(logger, state)
    validateAddonContentGrants(logger, state)
    validateRemoteAddonDependencies(logger, state)
    validateRemoteAddonAuth(logger, state)
    applyDeclaredScopes(state)
    validateScopeReferences(logger, state)
    validateSystemRoleScopes(logger, state)
    validateVirtualUserRoles(logger, state)
    logger.endValidationPass?.()
  }

  return analyzed
}
