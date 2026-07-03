import * as ts from 'typescript'
import { performance } from 'perf_hooks'
import { resolve } from 'path'
import { visitSetup, visitFunctions, visitRoutes } from './visit.js'
import { TypesMap } from './types-map.js'
import type {
  InspectorState,
  InspectorLogger,
  InspectorOptions,
} from './types.js'
import { getFilesAndMethods } from './utils/get-files-and-methods.js'
import { findCommonAncestor } from './utils/find-root-dir.js'
import {
  aggregateRequiredServices,
  stampAuthHandlerServices,
  validateAgentModels,
  validateSecretOverrides,
  validateVariableOverrides,
  validateCredentialOverrides,
  computeResolvedIOTypes,
  computeMiddlewareGroupsMeta,
  computePermissionsGroupsMeta,
  computeRequiredSchemas,
  computeDiagnostics,
  validateSchemaWiringSeparation,
} from './utils/post-process.js'
import { generateOpenAPISpec } from './utils/serialize-openapi-json.js'
import { pikkuState } from '@pikku/core/internal'
import { resolveLatestVersions } from './utils/resolve-versions.js'
import { finalizeWorkflows } from './utils/workflow/graph/finalize-workflows.js'
import {
  finalizeWorkflowHelperTypes,
  finalizeWorkflowWires,
} from './utils/workflow/graph/finalize-workflow-wires.js'
import { generateAllSchemas } from './utils/schema-generator.js'
import {
  loadAddonFunctionsMeta,
  loadAddonSchemas,
} from './utils/load-addon-functions-meta.js'
import {
  computeContractHashes,
  extractContractsFromMeta,
  updateManifest,
  createEmptyManifest,
  validateContracts,
} from './utils/contract-hashes.js'

/**
 * Creates an initial/empty inspector state with all required properties initialized
 * @param rootDir - The root directory for the project
 * @returns A fresh InspectorState with empty collections
 */
export function getInitialInspectorState(rootDir: string): InspectorState {
  return {
    rootDir,
    singletonServicesTypeImportMap: new Map(),
    wireServicesTypeImportMap: new Map(),
    userSessionTypeImportMap: new Map(),
    configTypeImportMap: new Map(),
    singletonServicesFactories: new Map(),
    wireServicesFactories: new Map(),
    wireServicesMeta: new Map(),
    addonRequiredParentServices: [],
    addonServerlessIncompatible: new Map(),
    configFactories: new Map(),
    serverLifecycleFactories: new Map(),
    filesAndMethods: {},
    filesAndMethodsErrors: new Map(),
    typesLookup: new Map(),
    schemaLookup: new Map(),
    schemas: {},
    functions: {
      typesMap: new TypesMap(),
      meta: {},
      files: new Map(),
      approvalDescriptions: {},
    },
    http: {
      metaInputTypes: new Map(),
      meta: {
        get: {},
        post: {},
        put: {},
        delete: {},
        head: {},
        patch: {},
        options: {},
      },
      files: new Set(),
      routeMiddleware: new Map(),
      routePermissions: new Map(),
    },
    channels: {
      files: new Set(),
      meta: {},
    },
    gateways: {
      meta: {},
      files: new Set(),
    },
    triggers: {
      meta: {},
      sourceMeta: {},
      files: new Set(),
    },
    scheduledTasks: {
      meta: {},
      files: new Set(),
    },
    queueWorkers: {
      meta: {},
      files: new Set(),
    },
    workflows: {
      meta: {},
      files: new Map(),
      graphMeta: {},
      graphFiles: new Map(),
      invokedWorkflows: new Set(),
    },
    rpc: {
      internalMeta: {},
      internalFiles: new Map(),
      exposedMeta: {},
      exposedFiles: new Map(),
      invokedFunctions: new Set(),
      invokedFunctionsByFile: new Map(),
      usedAddons: new Set(),
      wireAddonDeclarations: new Map(),
      wireAddonFiles: new Set(),
    },
    mcpEndpoints: {
      resourcesMeta: {},
      toolsMeta: {},
      promptsMeta: {},
      files: new Set(),
    },
    agents: {
      agentsMeta: {},
      files: new Map(),
    },
    cli: {
      meta: {
        programs: {},
        renderers: {},
      },
      files: new Set(),
    },
    nodes: {
      meta: {},
      files: new Set(),
    },
    auth: {
      providers: [],
      plugins: [],
      files: new Set(),
      definition: null,
    },
    secrets: {
      definitions: [],
      files: new Set(),
    },
    credentials: {
      definitions: [],
      files: new Set(),
    },
    variables: {
      definitions: [],
      files: new Set(),
    },
    manifest: {
      initial: null,
      current: null,
      errors: [],
    },
    middleware: {
      definitions: {},
      instances: {},
      tagMiddleware: new Map(),
    },
    channelMiddleware: {
      definitions: {},
      instances: {},
      tagMiddleware: new Map(),
    },
    aiMiddleware: {
      definitions: {},
    },
    permissions: {
      definitions: {},
      instances: {},
      tagPermissions: new Map(),
    },
    serviceAggregation: {
      requiredServices: new Set(),
      usedFunctions: new Set(),
      usedMiddleware: new Set(),
      usedPermissions: new Set(),
      allSingletonServices: [],
      allWireServices: [],
    },
    resolvedIOTypes: {},
    middlewareGroupsMeta: {
      definitions: {},
      instances: {},
      httpGroups: {},
      tagGroups: {},
      channelMiddleware: {
        definitions: {},
        instances: {},
        tagGroups: {},
      },
    },
    permissionsGroupsMeta: {
      definitions: {},
      httpGroups: {},
      tagGroups: {},
    },
    requiredSchemas: new Set(),
    openAPISpec: null,
    diagnostics: [],
    addonFunctions: {},
    exportedContracts: {
      http: {},
      cli: {},
      channel: {},
      addonHttp: {},
      addonCli: {},
      addonChannel: {},
    },
    program: null,
  }
}

export const inspect = async (
  logger: InspectorLogger,
  routeFiles: string[],
  options: InspectorOptions = {}
): Promise<InspectorState> => {
  const normalizedRouteFiles = routeFiles.map((file) => resolve(file))
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.Node16,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    types: [],
    allowJs: false,
    checkJs: false,
  }
  const startProgram = performance.now()
  const program = ts.createProgram(
    normalizedRouteFiles,
    compilerOptions,
    undefined, // host
    options.oldProgram
  )
  logger.debug(
    `Created program in ${(performance.now() - startProgram).toFixed(0)}ms (${normalizedRouteFiles.length} files${options.oldProgram ? ', incremental' : ''})`
  )

  const startChecker = performance.now()
  const checker = program.getTypeChecker()
  logger.debug(
    `Got type checker in ${(performance.now() - startChecker).toFixed(2)}ms`
  )

  // Use provided rootDir or infer from source files
  const rootDir = options.rootDir || findCommonAncestor(normalizedRouteFiles)

  const startSourceFiles = performance.now()
  // node_modules under rootDir (e.g. a locally-installed addon) is a
  // dependency, not project source — scanning it double-counts the addon's
  // own application types (CoreConfig/Services/SingletonServices).
  // Sort by file name so the sweeps populate state in a stable order. The
  // program's own file order depends on glob + import-graph resolution, which
  // varies run to run — leaving generated meta keys (and anything serialized
  // in insertion order) non-reproducible across identical `pikku all` runs.
  // Safe because function registration is a dedicated pass (visitFunctions)
  // that completes before any order-sensitive wiring resolution in visitRoutes.
  const sourceFiles = program
    .getSourceFiles()
    .filter(
      (sf) =>
        sf.fileName.startsWith(rootDir) &&
        !sf.fileName.includes('/node_modules/')
    )
    .sort((a, b) =>
      a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0
    )
  logger.debug(
    `Got source files in ${(performance.now() - startSourceFiles).toFixed(2)}ms`
  )

  const state = getInitialInspectorState(rootDir)

  // First sweep: add all functions
  const startSetup = performance.now()
  for (const sourceFile of sourceFiles) {
    const sourceOptions = { ...options, sourceFile }
    ts.forEachChild(sourceFile, (child) =>
      visitSetup(logger, checker, child, state, sourceOptions)
    )
  }
  logger.debug(
    `Visit setup phase completed in ${(performance.now() - startSetup).toFixed(0)}ms`
  )

  // Load addon function metadata so wirings can reference addon functions
  await loadAddonFunctionsMeta(logger, state)

  if (!options.setupOnly) {
    // Function sweep: register every function before transports/wirings resolve
    // them, so resolution doesn't depend on source-file order.
    const startFunctions = performance.now()
    for (const sourceFile of sourceFiles) {
      const sourceOptions = { ...options, sourceFile }
      ts.forEachChild(sourceFile, (child) =>
        visitFunctions(logger, checker, child, state, sourceOptions)
      )
    }
    logger.debug(
      `Visit functions phase completed in ${(performance.now() - startFunctions).toFixed(0)}ms`
    )

    // Transport sweep: add all transports/wirings
    const startRoutes = performance.now()
    for (const sourceFile of sourceFiles) {
      const sourceOptions = { ...options, sourceFile }
      ts.forEachChild(sourceFile, (child) =>
        visitRoutes(logger, checker, child, state, sourceOptions)
      )
    }
    logger.debug(
      `Visit routes phase completed in ${(performance.now() - startRoutes).toFixed(0)}ms`
    )

    resolveLatestVersions(state, logger)

    if (options.schemaConfig) {
      const startSchemas = performance.now()
      state.schemas = await generateAllSchemas(
        logger,
        options.schemaConfig,
        state
      )
      logger.debug(
        `generateAllSchemas took ${(performance.now() - startSchemas).toFixed(0)}ms`
      )
      computeContractHashes(
        state.schemas,
        state.functions.typesMap,
        state.functions.meta
      )
      computeRequiredSchemas(state, options)
    }

    // Re-load addon schemas (generateAllSchemas replaces state.schemas)
    await loadAddonSchemas(logger, state)

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
    computeDiagnostics(state)
    validateSchemaWiringSeparation(logger, state)

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

    validateAgentModels(logger, state)
    validateSecretOverrides(logger, state)
    validateVariableOverrides(logger, state)
    validateCredentialOverrides(logger, state)
  }

  state.program = program

  return state
}
