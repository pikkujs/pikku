import * as ts from 'typescript'
import { performance } from 'perf_hooks'
import { visitSetup, visitRoutes } from './visit.js'
import { TypesMap } from './types-map.js'
import { InspectorState, InspectorLogger, InspectorOptions } from './types.js'
import { getFilesAndMethods } from './utils/get-files-and-methods.js'
import { findCommonAncestor } from './utils/find-root-dir.js'
import {
  aggregateRequiredServices,
  validateSecretOverrides,
  validateAgentModels,
  validateAgentOverrides,
  computeResolvedIOTypes,
  computeMiddlewareGroupsMeta,
  computePermissionsGroupsMeta,
  computeRequiredSchemas,
  computeDiagnostics,
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
    configFactories: new Map(),
    filesAndMethods: {},
    filesAndMethodsErrors: new Map(),
    typesLookup: new Map(),
    schemaLookup: new Map(),
    schemas: {},
    functions: {
      typesMap: new TypesMap(),
      meta: {},
      files: new Map(),
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
      usedExternalPackages: new Set(),
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
    secrets: {
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
  }
}

export const inspect = async (
  logger: InspectorLogger,
  routeFiles: string[],
  options: InspectorOptions = {}
): Promise<InspectorState> => {
  const startProgram = performance.now()
  const program = ts.createProgram(routeFiles, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.Node16,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    types: [],
    allowJs: false,
    checkJs: false,
  })
  logger.debug(
    `Created program in ${(performance.now() - startProgram).toFixed(2)}ms`
  )

  const startChecker = performance.now()
  const checker = program.getTypeChecker()
  logger.debug(
    `Got type checker in ${(performance.now() - startChecker).toFixed(2)}ms`
  )

  // Use provided rootDir or infer from source files
  const rootDir = options.rootDir || findCommonAncestor(routeFiles)

  const startSourceFiles = performance.now()
  // Filter source files to only include files within the project rootDir
  // This prevents picking up types from external packages (including workspace symlinks)
  const sourceFiles = program
    .getSourceFiles()
    .filter((sf) => sf.fileName.startsWith(rootDir))
  logger.debug(
    `Got source files in ${(performance.now() - startSourceFiles).toFixed(2)}ms`
  )

  const state = getInitialInspectorState(rootDir)

  // First sweep: add all functions
  const startSetup = performance.now()
  for (const sourceFile of sourceFiles) {
    ts.forEachChild(sourceFile, (child) =>
      visitSetup(logger, checker, child, state, options)
    )
  }
  logger.debug(
    `Visit setup phase completed in ${(performance.now() - startSetup).toFixed(2)}ms`
  )

  if (!options.setupOnly) {
    // Second sweep: add all transports
    const startRoutes = performance.now()
    for (const sourceFile of sourceFiles) {
      ts.forEachChild(sourceFile, (child) =>
        visitRoutes(logger, checker, child, state, options)
      )
    }
    logger.debug(
      `Visit routes phase completed in ${(performance.now() - startRoutes).toFixed(2)}ms`
    )

    resolveLatestVersions(state, logger)

    if (options.schemaConfig) {
      state.schemas = await generateAllSchemas(
        logger,
        options.schemaConfig,
        state
      )
      computeContractHashes(
        state.schemas,
        state.functions.typesMap,
        state.functions.meta
      )
      computeRequiredSchemas(state, options)
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
    const startAggregate = performance.now()
    aggregateRequiredServices(state)
    logger.debug(
      `Aggregate required services completed in ${(performance.now() - startAggregate).toFixed(2)}ms`
    )

    computeResolvedIOTypes(state)
    computeMiddlewareGroupsMeta(state)
    computePermissionsGroupsMeta(state)
    computeDiagnostics(state)

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

    validateSecretOverrides(logger, state, options.externalPackages)
    validateAgentModels(logger, state, options.modelConfig)
    validateAgentOverrides(logger, state, options.modelConfig)
  }

  return state
}
