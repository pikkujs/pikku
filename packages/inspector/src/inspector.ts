import * as ts from 'typescript'
import { performance } from 'perf_hooks'
import { visitSetup, visitRoutes } from './visit.js'
import { TypesMap } from './types-map.js'
import { InspectorState, InspectorLogger, InspectorOptions } from './types.js'
import { getFilesAndMethods } from './utils/get-files-and-methods.js'
import { findCommonAncestor } from './utils/find-root-dir.js'
import { aggregateRequiredServices } from './utils/post-process.js'

/**
 * Creates an initial/empty inspector state with all required properties initialized
 * @param rootDir - The root directory for the project
 * @returns A fresh InspectorState with empty collections
 */
export function getInitialInspectorState(rootDir: string): InspectorState {
  return {
    rootDir,
    singletonServicesTypeImportMap: new Map(),
    sessionServicesTypeImportMap: new Map(),
    userSessionTypeImportMap: new Map(),
    configTypeImportMap: new Map(),
    singletonServicesFactories: new Map(),
    sessionServicesFactories: new Map(),
    sessionServicesMeta: new Map(),
    configFactories: new Map(),
    filesAndMethods: {},
    filesAndMethodsErrors: new Map(),
    typesLookup: new Map(),
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
    scheduledTasks: {
      meta: {},
      files: new Set(),
    },
    queueWorkers: {
      meta: {},
      files: new Set(),
    },
    rpc: {
      internalMeta: {},
      internalFiles: new Map(),
      exposedMeta: {},
      exposedFiles: new Map(),
      invokedFunctions: new Set(),
    },
    mcpEndpoints: {
      resourcesMeta: {},
      toolsMeta: {},
      promptsMeta: {},
      files: new Set(),
    },
    cli: {
      meta: {
        programs: {},
        renderers: {},
      },
      files: new Set(),
    },
    middleware: {
      meta: {},
      tagMiddleware: new Map(),
    },
    permissions: {
      meta: {},
      tagPermissions: new Map(),
    },
    serviceAggregation: {
      requiredServices: new Set(),
      usedFunctions: new Set(),
      usedMiddleware: new Set(),
      usedPermissions: new Set(),
    },
  }
}

export const inspect = (
  logger: InspectorLogger,
  routeFiles: string[],
  options: InspectorOptions = {}
): InspectorState => {
  const startProgram = performance.now()
  const program = ts.createProgram(routeFiles, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Node10,
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

  const startSourceFiles = performance.now()
  const sourceFiles = program.getSourceFiles()
  logger.debug(
    `Got source files in ${(performance.now() - startSourceFiles).toFixed(2)}ms`
  )

  // Infer root directory from source files
  const rootDir = findCommonAncestor(routeFiles)

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
  }

  return state
}
