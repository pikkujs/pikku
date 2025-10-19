import * as ts from 'typescript'
import { visitSetup, visitRoutes } from './visit.js'
import { TypesMap } from './types-map.js'
import { InspectorState, InspectorLogger, InspectorOptions } from './types.js'
import { getFilesAndMethods } from './utils/get-files-and-methods.js'
import { findCommonAncestor } from './utils/find-root-dir.js'

export const inspect = (
  logger: InspectorLogger,
  routeFiles: string[],
  options: InspectorOptions = {}
): InspectorState => {
  const program = ts.createProgram(routeFiles, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
  })
  const checker = program.getTypeChecker()
  const sourceFiles = program.getSourceFiles()

  // Infer root directory from source files
  const rootDir = findCommonAncestor(routeFiles)

  const state: InspectorState = {
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
      meta: {},
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
  }

  // First sweep: add all functions
  for (const sourceFile of sourceFiles) {
    ts.forEachChild(sourceFile, (child) =>
      visitSetup(logger, checker, child, state, options)
    )
  }

  // Second sweep: add all transports
  for (const sourceFile of sourceFiles) {
    ts.forEachChild(sourceFile, (child) =>
      visitRoutes(logger, checker, child, state, options)
    )
  }

  // Populate filesAndMethods
  const { result, errors } = getFilesAndMethods(state, options.types)
  state.filesAndMethods = result
  state.filesAndMethodsErrors = errors

  return state
}
