import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  routeMatchesPattern,
  resolveHTTPPermissions,
  resolvePermissions,
} from './permissions.js'
import type { InspectorState, PermissionGroupMeta } from '../types.js'

describe('routeMatchesPattern', () => {
  test('should match exact routes', () => {
    assert.strictEqual(routeMatchesPattern('/api/users', '/api/users'), true)
  })

  test('should not match different routes', () => {
    assert.strictEqual(routeMatchesPattern('/api/users', '/api/posts'), false)
  })

  test('should match wildcard patterns', () => {
    assert.strictEqual(routeMatchesPattern('/api/users', '/api/*'), true)
    assert.strictEqual(routeMatchesPattern('/api/users/123', '/api/*'), true)
    assert.strictEqual(routeMatchesPattern('/api/posts', '/api/*'), true)
  })

  test('should match global wildcard', () => {
    assert.strictEqual(routeMatchesPattern('/api/users', '*'), true)
    assert.strictEqual(routeMatchesPattern('/any/path', '*'), true)
  })

  test('should not match if pattern is more specific', () => {
    assert.strictEqual(routeMatchesPattern('/users', '/api/*'), false)
  })
})

describe('resolveHTTPPermissions', () => {
  test('should return undefined when no permissions exist', () => {
    const state: InspectorState = createMockState()

    const result = resolveHTTPPermissions(
      state,
      '/api/test',
      undefined,
      undefined,
      {} as any
    )

    assert.strictEqual(result, undefined)
  })

  test('should resolve global HTTP permissions', () => {
    const state: InspectorState = createMockState()
    const globalPermission: PermissionGroupMeta = {
      exportName: 'globalPermissions',
      sourceFile: '/test.ts',
      position: 0,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    }
    state.http.routePermissions.set('*', globalPermission)

    const result = resolveHTTPPermissions(
      state,
      '/api/test',
      undefined,
      undefined,
      {} as any
    )

    assert.ok(result)
    assert.strictEqual(result.length, 1)
    assert.deepEqual(result[0], { type: 'http', route: '*' })
  })

  test('should resolve route pattern permissions', () => {
    const state: InspectorState = createMockState()
    const apiPermission: PermissionGroupMeta = {
      exportName: 'apiPermissions',
      sourceFile: '/test.ts',
      position: 0,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    }
    state.http.routePermissions.set('/api/*', apiPermission)

    const result = resolveHTTPPermissions(
      state,
      '/api/users',
      undefined,
      undefined,
      {} as any
    )

    assert.ok(result)
    assert.strictEqual(result.length, 1)
    assert.deepEqual(result[0], { type: 'http', route: '/api/*' })
  })

  test('should resolve tag-based permissions', () => {
    const state: InspectorState = createMockState()
    const adminPermission: PermissionGroupMeta = {
      exportName: 'adminPermissions',
      sourceFile: '/test.ts',
      position: 0,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    }
    state.permissions.tagPermissions.set('admin', adminPermission)

    const result = resolveHTTPPermissions(
      state,
      '/api/admin',
      ['admin'],
      undefined,
      {} as any
    )

    assert.ok(result)
    assert.strictEqual(result.length, 1)
    assert.deepEqual(result[0], { type: 'tag', tag: 'admin' })
  })

  test('should combine multiple permission sources in correct order', () => {
    const state: InspectorState = createMockState()

    // Setup global HTTP permission
    state.http.routePermissions.set('*', {
      exportName: 'global',
      sourceFile: '/test.ts',
      position: 0,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    })

    // Setup route pattern permission
    state.http.routePermissions.set('/api/*', {
      exportName: 'apiRoute',
      sourceFile: '/test.ts',
      position: 0,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    })

    // Setup tag permission
    state.permissions.tagPermissions.set('admin', {
      exportName: 'adminTag',
      sourceFile: '/test.ts',
      position: 0,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    })

    // Setup explicit permission
    state.permissions.definitions['testPermission'] = {
      services: { services: [], singletons: [] },
      sourceFile: '/test.ts',
      position: 0,
      exportedName: 'testPerm',
    }

    const result = resolveHTTPPermissions(
      state,
      '/api/admin',
      ['admin'],
      undefined, // We'd need a real TS node for this
      {} as any
    )

    assert.ok(result)
    // Should have: global HTTP, route pattern, tag
    assert.strictEqual(result.length, 3)
    assert.deepEqual(result[0], { type: 'http', route: '*' })
    assert.deepEqual(result[1], { type: 'http', route: '/api/*' })
    assert.deepEqual(result[2], { type: 'tag', tag: 'admin' })
  })
})

describe('resolvePermissions', () => {
  test('should return undefined when no permissions exist', () => {
    const state: InspectorState = createMockState()
    const mockObj = createMockObjectLiteral()

    const result = resolvePermissions(state, mockObj, undefined, {} as any)

    assert.strictEqual(result, undefined)
  })

  test('should resolve tag-based permissions', () => {
    const state: InspectorState = createMockState()
    const mcpPermission: PermissionGroupMeta = {
      exportName: 'mcpPermissions',
      sourceFile: '/test.ts',
      position: 0,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    }
    state.permissions.tagPermissions.set('mcp', mcpPermission)
    const mockObj = createMockObjectLiteral()

    const result = resolvePermissions(state, mockObj, ['mcp'], {} as any)

    assert.ok(result)
    assert.strictEqual(result.length, 1)
    assert.deepEqual(result[0], { type: 'tag', tag: 'mcp' })
  })

  test('should handle multiple tags', () => {
    const state: InspectorState = createMockState()
    state.permissions.tagPermissions.set('mcp', {
      exportName: 'mcpPerms',
      sourceFile: '/test.ts',
      position: 0,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    })
    state.permissions.tagPermissions.set('admin', {
      exportName: 'adminPerms',
      sourceFile: '/test.ts',
      position: 0,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    })
    const mockObj = createMockObjectLiteral()

    const result = resolvePermissions(
      state,
      mockObj,
      ['mcp', 'admin'],
      {} as any
    )

    assert.ok(result)
    assert.strictEqual(result.length, 2)
    assert.deepEqual(result[0], { type: 'tag', tag: 'mcp' })
    assert.deepEqual(result[1], { type: 'tag', tag: 'admin' })
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
      routePermissions: new Map(),
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
      tagPermissions: new Map(),
    },
  }
}
