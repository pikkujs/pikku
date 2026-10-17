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
  test('emits nothing when no file registers a global permission', () => {
    const permissionsState: InspectorPermissionState = {
      definitions: {},
      instances: {},
      global: [],
    }

    const result = serializePermissionsImports(
      '/test/.pikku/permissions/output.ts',
      permissionsState,
      createHTTPState(),
      {}
    )

    assert.strictEqual(result, '')
  })

  test('emits nothing for function-scoped permission definitions', () => {
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
      global: [],
    }

    const result = serializePermissionsImports(
      '/test/.pikku/permissions/output.ts',
      permissionsState,
      createHTTPState(),
      {}
    )

    assert.strictEqual(result, '')
  })

  test('imports every file that calls addGlobalPermission', () => {
    const result = serializePermissionsImports(
      '/test/.pikku/permissions/pikku-permissions.gen.ts',
      {
        definitions: {},
        instances: {},
        global: [
          {
            sourceFile: '/test/src/security.ts',
            position: 0,
            exportName: null,
            definitionIds: [],
          },
          {
            sourceFile: '/test/src/admin-gate.ts',
            position: 0,
            exportName: 'adminGate',
            definitionIds: [],
          },
        ],
      },
      createHTTPState(),
      {}
    )

    assert.match(result, /^import '\.\.\/\.\.\/src\/security\.js'$/m)
    assert.match(
      result,
      /^import \{ adminGate \} from '\.\.\/\.\.\/src\/admin-gate\.js'$/m
    )
    assert.match(result, /^adminGate\(\)$/m)
  })
})
