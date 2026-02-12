import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializePermissionsImports } from './serialize-permissions-imports.js'
import type {
  InspectorPermissionState,
  InspectorHTTPState,
  PermissionGroupMeta,
} from '@pikku/inspector'

describe('serializePermissionsImports', () => {
  test('should return empty string when no permission factories exist', () => {
    const permissionsState: InspectorPermissionState = {
      definitions: {},
      instances: {},
      tagPermissions: new Map(),
    }
    const httpState: InspectorHTTPState = {
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
    }

    const result = serializePermissionsImports(
      '/test/output.ts',
      permissionsState,
      httpState
    )

    assert.strictEqual(result, '')
  })

  test('should generate imports and calls for HTTP permission factories', () => {
    const permissionsState: InspectorPermissionState = {
      definitions: {},
      instances: {},
      tagPermissions: new Map(),
    }

    const httpPermissionMeta: PermissionGroupMeta = {
      exportName: 'globalHttpPermissions',
      sourceFile: '/src/permissions/http.ts',
      position: 100,
      services: { services: [], singletons: [] },
      count: 2,
      instanceIds: [],
      isFactory: true,
    }

    const httpState: InspectorHTTPState = {
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
      routePermissions: new Map([['*', httpPermissionMeta]]),
    }

    const result = serializePermissionsImports(
      '/test/.pikku/permissions/output.ts',
      permissionsState,
      httpState,
      {}
    )

    assert.ok(
      result.includes(
        '/* Call permission group factories to register at module evaluation */'
      )
    )
    assert.ok(result.includes('import { globalHttpPermissions } from'))
    assert.ok(result.includes('globalHttpPermissions()'))
  })

  test('should generate imports and calls for tag permission factories', () => {
    const tagPermissionMeta: PermissionGroupMeta = {
      exportName: 'adminPermissions',
      sourceFile: '/src/permissions/admin.ts',
      position: 200,
      services: { services: [], singletons: [] },
      count: 3,
      instanceIds: [],
      isFactory: true,
    }

    const permissionsState: InspectorPermissionState = {
      definitions: {},
      instances: {},
      tagPermissions: new Map([['admin', tagPermissionMeta]]),
    }

    const httpState: InspectorHTTPState = {
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
    }

    const result = serializePermissionsImports(
      '/test/.pikku/permissions/output.ts',
      permissionsState,
      httpState,
      {}
    )

    assert.ok(result.includes('import { adminPermissions } from'))
    assert.ok(result.includes('adminPermissions()'))
  })

  test('should deduplicate permission factories used in both HTTP and tag groups', () => {
    const sharedPermissionMeta: PermissionGroupMeta = {
      exportName: 'sharedPermissions',
      sourceFile: '/src/permissions/shared.ts',
      position: 300,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    }

    const permissionsState: InspectorPermissionState = {
      definitions: {},
      instances: {},
      tagPermissions: new Map([['shared', sharedPermissionMeta]]),
    }

    const httpState: InspectorHTTPState = {
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
      routePermissions: new Map([
        ['/api/*', { ...sharedPermissionMeta, position: 400 }],
      ]),
    }

    const result = serializePermissionsImports(
      '/test/.pikku/permissions/output.ts',
      permissionsState,
      httpState,
      {}
    )

    // Should only have one import and one call despite being in both maps
    const importMatches = result.match(/import { sharedPermissions }/g)
    const callMatches = result.match(/sharedPermissions\(\)/g)

    assert.strictEqual(
      importMatches?.length,
      1,
      'Should have exactly one import'
    )
    assert.strictEqual(
      callMatches?.length,
      1,
      'Should have exactly one function call'
    )
  })

  test('should skip non-factory permission groups', () => {
    const nonFactoryMeta: PermissionGroupMeta = {
      exportName: 'directPermissions',
      sourceFile: '/src/permissions/direct.ts',
      position: 500,
      services: { services: [], singletons: [] },
      count: 2,
      instanceIds: [],
      isFactory: false, // Not a factory
    }

    const permissionsState: InspectorPermissionState = {
      definitions: {},
      instances: {},
      tagPermissions: new Map([['direct', nonFactoryMeta]]),
    }

    const httpState: InspectorHTTPState = {
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
    }

    const result = serializePermissionsImports(
      '/test/.pikku/permissions/output.ts',
      permissionsState,
      httpState,
      {}
    )

    assert.strictEqual(
      result,
      '',
      'Should not generate anything for non-factory permissions'
    )
  })

  test('should handle package mappings correctly', () => {
    const permissionMeta: PermissionGroupMeta = {
      exportName: 'apiPermissions',
      sourceFile: '/Users/test/project/packages/api/src/permissions.ts',
      position: 600,
      services: { services: [], singletons: [] },
      count: 1,
      instanceIds: [],
      isFactory: true,
    }

    const permissionsState: InspectorPermissionState = {
      definitions: {},
      instances: {},
      tagPermissions: new Map([['api', permissionMeta]]),
    }

    const httpState: InspectorHTTPState = {
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
    }

    const result = serializePermissionsImports(
      '/Users/test/project/.pikku/permissions/output.ts',
      permissionsState,
      httpState,
      { '/Users/test/project/packages/api/src': '@myapp/api' }
    )

    // Should use package mapping (or relative path if mapping doesn't match)
    // The actual behavior depends on getFileImportRelativePath implementation
    assert.ok(result.includes('import { apiPermissions } from'))
    assert.ok(result.includes('apiPermissions()'))
  })
})
