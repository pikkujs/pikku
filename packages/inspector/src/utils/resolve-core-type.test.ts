import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { aggregateRequiredServices } from './post-process.js'
import type { InspectorState, PathToNameAndType } from '../types.js'

const SOURCE_FILE = '/application-types.ts'

/**
 * Builds the slice of inspector state that service extraction reads: the
 * `typesLookup` entry the AST walk records under whatever the project named its
 * interface, and the import map that points at that name.
 */
const stateWithCoreTypes = (
  source: string,
  singletonName: string,
  wireName: string
): InspectorState => {
  const host: ts.CompilerHost = {
    ...ts.createCompilerHost({}),
    getSourceFile: (name, languageVersion) =>
      name === SOURCE_FILE
        ? ts.createSourceFile(name, source, languageVersion, true)
        : undefined,
    fileExists: (name) => name === SOURCE_FILE,
    readFile: (name) => (name === SOURCE_FILE ? source : undefined),
  }
  const program = ts.createProgram([SOURCE_FILE], { noLib: true }, host)
  const checker = program.getTypeChecker()
  const sourceFile = program.getSourceFile(SOURCE_FILE)!

  const typesLookup = new Map<string, ts.Type[]>()
  const importMapFor = (name: string): PathToNameAndType => {
    const declaration = sourceFile.statements.find(
      (statement): statement is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(statement) && statement.name.text === name
    )!
    typesLookup.set(name, [checker.getTypeAtLocation(declaration)])
    return new Map([
      [SOURCE_FILE, [{ variable: name, type: name, typePath: SOURCE_FILE }]],
    ])
  }

  return {
    typesLookup,
    singletonServicesTypeImportMap: importMapFor(singletonName),
    wireServicesTypeImportMap: importMapFor(wireName),
    serviceAggregation: {
      requiredServices: new Set<string>(),
      usedFunctions: new Set<string>(),
      usedMiddleware: new Set<string>(),
      usedPermissions: new Set<string>(),
      allSingletonServices: [],
      allWireServices: [],
    },
    functions: { meta: {} },
    middleware: { definitions: {}, tagMiddleware: new Map() },
    permissions: { definitions: {} },
    http: {
      meta: {
        get: {},
        post: {},
        put: {},
        patch: {},
        delete: {},
        head: {},
        options: {},
      },
      routeMiddleware: new Map(),
    },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    mcpEndpoints: { toolsMeta: {}, promptsMeta: {}, resourcesMeta: {} },
    agents: { agentsMeta: {} },
    workflows: { meta: {}, graphMeta: {} },
    wireServicesMeta: new Map(),
    rpc: { internalMeta: {}, exposedMeta: {} },
    scopes: { definitions: [] },
    addonFunctions: {},
    addonRequiredParentServices: [],
  } as unknown as InspectorState
}

const CONVENTIONAL = `
  interface SingletonServices { logger: string; kysely: string }
  interface Services { logger: string; kysely: string; http: string }
`

const RENAMED = `
  interface AppSingletonServices { logger: string; kysely: string }
  interface AppServices { logger: string; kysely: string; http: string }
`

describe('service extraction resolves core types by declaration, not by name', () => {
  test('the conventional names still resolve', () => {
    const state = stateWithCoreTypes(
      CONVENTIONAL,
      'SingletonServices',
      'Services'
    )
    aggregateRequiredServices(state)
    assert.deepEqual(state.serviceAggregation.allSingletonServices, [
      'kysely',
      'logger',
    ])
    assert.deepEqual(state.serviceAggregation.allWireServices, ['http'])
  })

  test('a project that renamed its interfaces resolves the same way', () => {
    const state = stateWithCoreTypes(
      RENAMED,
      'AppSingletonServices',
      'AppServices'
    )
    aggregateRequiredServices(state)
    assert.deepEqual(
      state.serviceAggregation.allSingletonServices,
      ['kysely', 'logger'],
      'a renamed SingletonServices must not silently resolve to no services'
    )
    assert.deepEqual(state.serviceAggregation.allWireServices, ['http'])
  })

  test('no declaration at all leaves the lists empty for PKU724 to catch', () => {
    const state = stateWithCoreTypes(
      CONVENTIONAL,
      'SingletonServices',
      'Services'
    )
    state.singletonServicesTypeImportMap = new Map()
    state.wireServicesTypeImportMap = new Map()
    state.serviceAggregation.allSingletonServices = []
    state.serviceAggregation.allWireServices = []
    aggregateRequiredServices(state)
    assert.deepEqual(state.serviceAggregation.allSingletonServices, [])
    assert.deepEqual(state.serviceAggregation.allWireServices, [])
  })
})
