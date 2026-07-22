import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { serializeUserAdminFunctions } from './serialize-user-admin-functions.js'
import { pikkuUserAdminFunctions } from './pikku-command-user-admin-functions.js'

const ADMIN_DEFINITION = {
  exportName: 'auth',
  sourceFile: '/app/src/auth.ts',
  basePath: '/api/auth',
  hasCredentials: true,
  plugins: ['bearer', 'admin'],
}

const services = (
  definition: unknown,
  written: Array<{ path: string; content: string }>,
  scaffold: unknown = { userAdmin: true }
) =>
  ({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    config: {
      scaffold,
      userAdminFunctionsFile: '/app/src/scaffold/user-admin.gen.ts',
      typesDeclarationFile: '/app/.pikku/pikku-types.gen.ts',
      packageMappings: {},
    },
    getInspectorState: async () => ({ auth: { definition } }),
    // writeFileInDir is module-level, so capture through the logger the command
    // funnels its writes past instead of stubbing the filesystem.
    __written: written,
  }) as any

describe('serializeUserAdminFunctions', () => {
  const out = serializeUserAdminFunctions('#pikku')

  test('gates every function on its own capability', () => {
    assert.match(out, /scopes: \['admin:users:ban'\]/)
    assert.match(out, /scopes: \['admin:users:remove'\]/)
    assert.match(out, /scopes: \['admin:users:sessions'\]/)
    assert.match(out, /scopes: \['admin:users:password'\]/)
  })

  test('declares the scopes it gates on, so the vocabulary cannot drift', () => {
    assert.match(out, /wireScope\(\{/)
    for (const leaf of ['ban', 'remove', 'sessions', 'password']) {
      assert.match(out, new RegExp(`${leaf}: \\{ description:`))
    }
  })

  // pikku rejects two declarations of the same scope root unless they match, so
  // the scaffold must emit the WHOLE admin tree — including leaves it does not
  // implement — or codegen fails wherever @pikku/addon-console is also wired.
  test('declares the whole admin tree, not just what it gates on', () => {
    assert.match(out, /impersonate: \{ description:/)
    assert.match(out, /link: \{ description:/)
    assert.match(out, /list: \{ description:/)
  })

  test('brokers through the shared helper rather than reimplementing auth', () => {
    assert.match(out, /import \{ callAdminApi \} from '@pikku\/better-auth'/)
    assert.doesNotMatch(out, /internalAdapter/)
  })

  test('requires auth by default and honours the sessionless opt-out', () => {
    assert.match(serializeUserAdminFunctions('#pikku'), /auth: true/)
    assert.match(serializeUserAdminFunctions('#pikku', false), /auth: false/)
  })
})

describe('pikkuUserAdminFunctions', () => {
  test('is inert when the scaffold is not enabled', async () => {
    const written: any[] = []
    const result = await (pikkuUserAdminFunctions as any).func(
      services(ADMIN_DEFINITION, written, {}),
      undefined,
      {}
    )

    assert.equal(result, false)
  })

  // The whole reason the guard exists: without admin() these four RPCs throw on
  // every call and the four scopes grant nothing, so codegen must refuse.
  test('fails when better-auth is wired without the admin() plugin', async () => {
    await assert.rejects(
      (pikkuUserAdminFunctions as any).func(
        services({ ...ADMIN_DEFINITION, plugins: ['bearer'] }, []),
        undefined,
        {}
      ),
      /without the admin\(\) plugin/
    )
  })

  test('the failure names the file to fix and how', async () => {
    await assert.rejects(
      (pikkuUserAdminFunctions as any).func(
        services({ ...ADMIN_DEFINITION, plugins: [] }, []),
        undefined,
        {}
      ),
      (e: Error) => {
        assert.match(e.message, /\/app\/src\/auth\.ts/)
        assert.match(
          e.message,
          /import \{ admin \} from 'better-auth\/plugins'/
        )
        return true
      }
    )
  })

  test('fails when there is no better-auth at all', async () => {
    await assert.rejects(
      (pikkuUserAdminFunctions as any).func(
        services(undefined, []),
        undefined,
        {}
      ),
      /no pikkuBetterAuth\(\.\.\.\) was found/
    )
  })
})
