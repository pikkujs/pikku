import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializePermissionsImports } from './serialize-permissions-imports.js'
import type {
  InspectorPermissionState,
  InspectorHTTPState,
} from '@pikku/inspector'

const createHTTPState = (): InspectorHTTPState => ({
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
})

describe('serializePermissionsImports', () => {
  test('emits nothing — permissions are function-scoped, not group-registered', () => {
    const permissionsState: InspectorPermissionState = {
      definitions: {},
      instances: {},
    }

    const result = serializePermissionsImports(
      '/test/.pikku/permissions/output.ts',
      permissionsState,
      createHTTPState(),
      {}
    )

    assert.strictEqual(result, '')
  })

  test('emits nothing even when individual permission definitions exist', () => {
    const permissionsState: InspectorPermissionState = {
      definitions: {
        adminPermission: {
          services: { optimized: true, services: [] },
          sourceFile: '/src/permissions/admin.ts',
          position: 10,
          exportedName: 'adminPermission',
        },
      },
      instances: {},
    }

    const result = serializePermissionsImports(
      '/test/.pikku/permissions/output.ts',
      permissionsState,
      createHTTPState(),
      {}
    )

    assert.strictEqual(result, '')
  })
})
