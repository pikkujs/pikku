import { describe, test, after } from 'node:test'
import assert from 'node:assert'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  hasLocalCLIEntrypoint,
  projectHasDatabase,
  writeLocalServices,
} from './write-local-services.js'

describe('hasLocalCLIEntrypoint', () => {
  test('is false for a project with no CLI, or only channel entrypoints', () => {
    assert.strictEqual(hasLocalCLIEntrypoint({}), false)
    assert.strictEqual(
      hasLocalCLIEntrypoint({
        cli: {
          entrypoints: {
            app: {
              type: 'channel',
              wirePath: 'src/cli.gen.ts',
              name: 'cli',
              route: '/cli',
            },
          },
        },
      } as any),
      false
    )
  })

  test('is true for a path, or a local entrypoint among others', () => {
    assert.strictEqual(
      hasLocalCLIEntrypoint({
        cli: { entrypoints: { app: 'client/cli.gen.ts' } },
      } as any),
      true
    )
    assert.strictEqual(
      hasLocalCLIEntrypoint({
        cli: {
          entrypoints: {
            app: [
              { type: 'channel', wirePath: 'src/c.gen.ts' },
              { type: 'local', path: 'client/cli.gen.ts' },
            ],
          },
        },
      } as any),
      true
    )
  })
})

describe('projectHasDatabase', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'pikku-has-db-'))
  after(() => rmSync(rootDir, { recursive: true, force: true }))
  const none = new Set<string>()

  test('is false for a project with no sign of one', () => {
    assert.strictEqual(projectHasDatabase({ rootDir }, none), false)
  })

  test('is true for a db config, or a project declaring kysely', () => {
    assert.strictEqual(projectHasDatabase({ rootDir, db: {} }, none), true)
    assert.strictEqual(
      projectHasDatabase({ rootDir }, new Set(['kysely'])),
      true
    )
    assert.strictEqual(
      projectHasDatabase({ rootDir }, new Set(['@pikku/kysely'])),
      true
    )
  })

  test('is true for the migration directories serve resolves one from', () => {
    for (const dialect of ['sqlite', 'postgres']) {
      const dir = mkdtempSync(join(tmpdir(), 'pikku-has-db-'))
      mkdirSync(join(dir, 'db', dialect), { recursive: true })
      assert.strictEqual(projectHasDatabase({ rootDir: dir }, none), true)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// `pikku dev` syncs the local scope store from what this file bakes. Without the
// `app` tree the virtual users imply, their `app:` grant has no scope row and
// virtual-user sign-in fails, though a deploy syncs the same app fine.
describe('writeLocalServices', () => {
  test('bakes the app tree the virtual users imply into the declared scopes', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-local-services-'))
    after(() => rmSync(rootDir, { recursive: true, force: true }))
    writeFileSync(
      join(rootDir, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { '@pikku/kysely': '*' } })
    )
    const localServicesFile = join(rootDir, '.pikku', 'local-services.gen.ts')
    const logger = { info: () => {}, debug: () => {}, warn: () => {} } as any

    await writeLocalServices(
      logger,
      { rootDir, outDir: join(rootDir, '.pikku'), localServicesFile } as any,
      {
        serviceAggregation: { requiredServices: new Set(['scopeService']) },
        scopes: { definitions: [{ name: 'billing', scopes: {} }] },
        systemRoles: { definitions: [] },
        virtualUsers: {
          definitions: [
            {
              id: 'staffer',
              name: 'staffer',
              roles: [],
              goals: [],
              tags: [],
              runnable: true,
              app: 'staff',
            },
          ],
        },
      } as any
    )

    const code = readFileSync(localServicesFile, 'utf-8')
    const baked = code.slice(code.indexOf('const declaredScopes'))
    assert.match(baked, /"app:staff"/)
    assert.match(baked, /"billing"/)
  })
})
