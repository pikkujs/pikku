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
      /^import \{ adminGate as (\w+) \} from '\.\.\/\.\.\/src\/admin-gate\.js'$/m
    )
    const alias = /import \{ adminGate as (\w+) \}/.exec(result)![1]!
    assert.match(result, new RegExp(`^${alias}\\(\\)$`, 'm'))
  })

  const factory = (sourceFile: string, exportName: string) => ({
    sourceFile,
    position: 0,
    exportName,
    definitionIds: [],
  })
  const serialize = (
    global: ReturnType<typeof factory>[]
  ): { imports: string[]; calls: string[] } => {
    const result = serializePermissionsImports(
      '/test/.pikku/permissions/pikku-permissions.gen.ts',
      { definitions: {}, instances: {}, global },
      createHTTPState(),
      {}
    )
    const lines = result.split('\n')
    return {
      imports: lines.filter((line) => line.startsWith('import {')),
      calls: lines.filter((line) => /^\w+\(\)$/.test(line)),
    }
  }

  test('two files exporting a factory of the same name are both registered', () => {
    const { imports, calls } = serialize([
      factory('/test/src/a.ts', 'registerGlobalPermissions'),
      factory('/test/src/b.ts', 'registerGlobalPermissions'),
    ])

    assert.strictEqual(imports.length, 2)
    assert.match(imports[0]!, /from '\.\.\/\.\.\/src\/a\.js'$/)
    assert.match(imports[1]!, /from '\.\.\/\.\.\/src\/b\.js'$/)
    assert.strictEqual(calls.length, 2)
    assert.strictEqual(new Set(calls).size, 2, 'each call has its own alias')
    for (const call of calls) {
      const alias = call.replace('()', '')
      assert.ok(
        imports.some((line) => line.includes(` as ${alias} `)),
        `${alias} is imported`
      )
    }
  })

  test('a factory with several registrations is called once', () => {
    const { imports, calls } = serialize([
      factory('/test/src/security.ts', 'globalGate'),
      factory('/test/src/security.ts', 'globalGate'),
    ])

    assert.strictEqual(imports.length, 1)
    assert.strictEqual(calls.length, 1)
  })
})
