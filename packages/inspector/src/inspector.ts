import * as ts from 'typescript'
import { visitSetup, visitRoutes } from './visit.js'
import { TypesMap } from './types-map.js'
import {
  InspectorState,
  InspectorHTTPState,
  InspectorFilters,
  InspectorLogger,
} from './types.js'

export const normalizeHTTPTypes = (
  httpState: InspectorHTTPState
): InspectorHTTPState => {
  return httpState
}

export const inspect = (
  logger: InspectorLogger,
  routeFiles: string[],
  filters: InspectorFilters
): InspectorState => {
  const program = ts.createProgram(routeFiles, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
  })
  const checker = program.getTypeChecker()
  const sourceFiles = program.getSourceFiles()

  const state: InspectorState = {
    singletonServicesTypeImportMap: new Map(),
    sessionServicesTypeImportMap: new Map(),
    userSessionTypeImportMap: new Map(),
    singletonServicesFactories: new Map(),
    sessionServicesFactories: new Map(),
    configFactories: new Map(),
    functions: {
      typesMap: new TypesMap(),
      meta: {},
      files: new Map(),
    },
    http: {
      metaInputTypes: new Map(),
      meta: [],
      files: new Set(),
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
      meta: {},
    },
    mcpEndpoints: {
      resourcesMeta: {},
      toolsMeta: {},
      promptsMeta: {},
      files: new Set(),
    },
  }

  // First sweep: add all functions
  for (const sourceFile of sourceFiles) {
    ts.forEachChild(sourceFile, (child) =>
      visitSetup(checker, child, state, filters, logger)
    )
  }

  // Second sweep: add all transports
  for (const sourceFile of sourceFiles) {
    ts.forEachChild(sourceFile, (child) =>
      visitRoutes(checker, child, state, filters, logger)
    )
  }

  // Normalise the typesMap
  state.http = normalizeHTTPTypes(state.http)

  return state
}
