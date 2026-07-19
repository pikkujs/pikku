import { describe, test } from 'node:test'
import assert from 'node:assert'
import { resolvePermissions } from './permissions.js'
import type { InspectorState } from '../types.js'

describe('resolvePermissions', () => {
  test('should return undefined when the object declares no permissions', () => {
    const state: InspectorState = createMockState()
    const mockObj = createMockObjectLiteral()

    const result = resolvePermissions(state, mockObj, undefined, {} as any)

    assert.strictEqual(result, undefined)
  })

  test('tags no longer resolve to permissions', () => {
    // Permissions are function-scoped only; tags are organizational and never
    // contribute permission metadata.
    const state: InspectorState = createMockState()
    const mockObj = createMockObjectLiteral()

    const result = resolvePermissions(
      state,
      mockObj,
      ['mcp', 'admin'],
      {} as any
    )

    assert.strictEqual(result, undefined)
  })
})

// Helper to create a mock TypeScript object literal expression
function createMockObjectLiteral(): any {
  return {
    properties: [],
    kind: 206, // ObjectLiteralExpression
  }
}

// Helper function to create a mock InspectorState
function createMockState(): InspectorState {
  return {
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
    },
    functions: {
      typesMap: {} as any,
      meta: {},
      files: new Map(),
    },
    channels: {
      meta: {},
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
      definitions: {},
      instances: {},
      tagMiddleware: new Map(),
    },
    channelMiddleware: {
      definitions: {},
      instances: {},
      tagMiddleware: new Map(),
    },
    permissions: {
      definitions: {},
      instances: {},
    },
  }
}
