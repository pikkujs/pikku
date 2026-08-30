import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serializeUserAdminFunctions } from './serialize-user-admin-functions.js'
import { pikkuUserAdminFunctions } from './pikku-command-user-admin-functions.js'

const leaf = (name: string) => `#pikku/${name}`

const ADMIN_DEFINITION = {
  exportName: 'auth',
  sourceFile: '/app/src/auth.ts',
  basePath: '/api/auth',
  hasCredentials: true,
  plugins: ['bearer', 'pikkuBan'],
}

const writeDir = mkdtempSync(join(tmpdir(), 'pikku-user-admin-'))

const services = (
  definition: unknown,
  written: Array<{ path: string; content: string }>,
  scaffold: unknown = { userAdmin: true }
) =>
  ({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    config: {
      scaffold,
      // A real directory: the tests that get past the guards write for real.
      userAdminFunctionsFile: join(writeDir, 'user-admin.gen.ts'),
      userAdminSchemasFile: join(writeDir, 'user-admin.schemas.gen.ts'),
      outDir: '/app/.pikku',
      packageMappings: {},
    },
    getInspectorState: async () => ({ auth: { definition } }),
    // writeFileInDir is module-level, so capture through the logger the command
    // funnels its writes past instead of stubbing the filesystem.
    __written: written,
  }) as any

describe('serializeUserAdminFunctions', () => {
  const { functions: out, schemas } = serializeUserAdminFunctions(leaf)

  test('gates every function on its own capability', () => {
    assert.match(out, /scopes: \['admin:users:list'\]/)
    assert.match(out, /scopes: \['admin:users:create'\]/)
    assert.match(out, /scopes: \['admin:users:ban'\]/)
    assert.match(out, /scopes: \['admin:users:remove'\]/)
    assert.match(out, /scopes: \['admin:users:sessions'\]/)
    assert.match(out, /scopes: \['admin:users:password'\]/)
  })

  test('declares the scopes it gates on, so the vocabulary cannot drift', () => {
    assert.match(out, /defineScope\(\{/)
    for (const leaf of [
      'list',
      'create',
      'ban',
      'remove',
      'sessions',
      'password',
    ]) {
      assert.match(out, new RegExp(`${leaf}: \\{ description:`))
    }
  })

  // pikku rejects two declarations of the same scope root unless they match, so
  // the scaffold must emit the WHOLE admin tree — including leaves it does not
  // implement — or codegen fails wherever @pikku/addon-console is also wired.
  test('declares the whole admin tree, not just what it gates on', () => {
    assert.match(out, /impersonate: \{ description:/)
    assert.match(out, /link: \{ description:/)
  })

  test('brokers through the shared helpers rather than reimplementing auth', () => {
    for (const helper of [
      'createAuthUser',
      'deleteAuthUser',
      'revokeAuthUserSessions',
      'setAuthUserBanned',
      'setAuthUserPassword',
    ]) {
      assert.match(out, new RegExp(`\\b${helper}\\b`))
    }
    assert.match(out, /from '@pikku\/better-auth'/)
    assert.doesNotMatch(out, /internalAdapter/)
  })

  test('gates on the session and the scope, never on a scaffold flag', () => {
    assert.match(out, /pikkuAdminListUsers = pikkuFunc\(/)
    assert.match(out, /scopes: \['admin:users:list'\]/)
    assert.doesNotMatch(out, /^\s*auth: (true|false),?$/m)
  })

  // The inspector reads a zod schema by importing the module that declares it.
  // It cannot import the functions file — that one imports pikku-types over a
  // relative path per-unit deploy codegen rewrites — so the schemas have to
  // stand alone, importing nothing but zod.
  test('the schemas module imports nothing but zod', () => {
    const imports = schemas.match(/^import .*$/gm) ?? []
    assert.deepEqual(imports, ["import { z } from 'zod'"])
  })

  test('every schema the functions use is exported from the schemas module', () => {
    const imported = out
      .match(/import \{([^}]*)\} from '\.\/user-admin\.schemas\.gen\.js'/)![1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)

    assert.ok(imported.length > 0)
    for (const name of imported) {
      assert.match(schemas, new RegExp(`export const ${name} = z\\.`))
    }
  })

  // A user is a user. The directory read must not mint a parallel shape that
  // drifts from the one everything else uses.
  test('the directory returns users, not a bespoke admin type', () => {
    assert.match(schemas, /export const User = z\.object\(/)
    assert.match(schemas, /users: z\.array\(User\)/)
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

  // Ban is one capability of six, so a missing pikkuBan() warns and generates the
  // rest rather than refusing — but it must say so, naming the file to fix.
  test('warns, and still generates, when pikkuBan() is not wired', async () => {
    const warnings: string[] = []
    const svc = services({ ...ADMIN_DEFINITION, plugins: ['bearer'] }, [])
    svc.logger.warn = (message: string) => warnings.push(message)

    assert.equal(
      await (pikkuUserAdminFunctions as any).func(svc, undefined, {}),
      true
    )
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /without the pikkuBan\(\) plugin/)
    assert.match(warnings[0]!, /\/app\/src\/auth\.ts/)
    assert.match(
      warnings[0]!,
      /import \{ pikkuBan \} from '@pikku\/better-auth'/
    )
  })

  test('says nothing when pikkuBan() is wired', async () => {
    const warnings: string[] = []
    const svc = services(ADMIN_DEFINITION, [])
    svc.logger.warn = (message: string) => warnings.push(message)

    await (pikkuUserAdminFunctions as any).func(svc, undefined, {})
    assert.deepEqual(warnings, [])
  })

  // pikkuBan() was `ban()` until the plugins took a pikku prefix, and the alias
  // is still exported — so a project on the old name still reads as banning.
  test('says nothing when the deprecated ban() alias is wired', async () => {
    const warnings: string[] = []
    const svc = services(
      { ...ADMIN_DEFINITION, plugins: ['bearer', 'ban'] },
      []
    )
    svc.logger.warn = (message: string) => warnings.push(message)

    await (pikkuUserAdminFunctions as any).func(svc, undefined, {})
    assert.deepEqual(warnings, [])
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
