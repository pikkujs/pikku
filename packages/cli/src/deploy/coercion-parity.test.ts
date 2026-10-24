import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
} from 'kysely'
import { createCoercionPlugin, type CoercionMap } from '@pikku/kysely'
import { CloudflareProviderAdapter } from '@pikku/deploy-cloudflare'
import { writeUnitPlatformServices } from './platform-services.js'
import {
  generateSchemaTypes,
  readCoercionMap,
} from '../functions/db/db-codegen.js'
import type {
  ColumnInfo,
  DbIntrospector,
} from '../functions/db/db-introspector.js'

const columns: ColumnInfo[] = ['id', 'due_at', 'done', 'meta', 'title'].map(
  (name) => ({
    name,
    type: 'text',
    notNull: true,
    pk: name === 'id',
    defaultValue: null,
  })
)

const annotations = {
  todo: {
    id: { kind: 'uuid' },
    due_at: { kind: 'date' },
    done: { kind: 'bool' },
    meta: { kind: 'json', tsType: '{ a: number }' },
  },
}

const introspector: DbIntrospector = {
  listTables: async () => ['todo'],
  getColumns: async () => columns,
  getForeignKeys: async () => [],
  getAllColumns: async () => new Map([['todo', columns]]),
  getAllForeignKeys: async () => new Map(),
  listEnums: async () => [],
  close: async () => {},
}

/** A dialect whose every query answers with `rows`, as the driver handed them over. */
const answering = (rows: Record<string, unknown>[]): Dialect => {
  const connection: DatabaseConnection = {
    executeQuery: async () => ({ rows: structuredClone(rows) as never[] }),
    streamQuery: async function* () {},
  }
  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    releaseConnection: async () => {},
    destroy: async () => {},
  }
  return {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => driver,
    createQueryCompiler: () => new SqliteQueryCompiler(),
    createIntrospector: (db) => new SqliteIntrospector(db),
  }
}

/** What `pikku db migrate` writes and `pikku dev` attaches. */
const generateDevMap = async (dialect: 'sqlite' | 'postgres') => {
  const dir = mkdtempSync(join(tmpdir(), 'coercion-parity-'))
  mkdirSync(join(dir, 'db'))
  writeFileSync(
    join(dir, 'db', 'annotations.gen.json'),
    JSON.stringify(annotations)
  )
  const { coercionFile } = await generateSchemaTypes(introspector, {
    outFile: join(dir, 'schema.gen.ts'),
    coercionFile: join(dir, 'coercion.gen.ts'),
    dialect,
    rootDir: dir,
  })
  const generated = (await import(coercionFile)) as { coercionMap: CoercionMap }
  return { coercionFile, devMap: generated.coercionMap }
}

/**
 * Runs the real pipeline step for a Cloudflare unit: the adapter selects the
 * coercion contributor, the shared writer generates the platform-services file
 * next to the entry, and that file is imported and run against a raw kysely.
 * The project opts in to one contributor that provides `kysely`; without
 * something providing it the coercion contributor has nothing to decorate.
 */
const applyCloudflareEntry = async (
  coercionMap: CoercionMap | undefined,
  kysely: Kysely<any>,
  options: { providesKysely?: boolean } = {}
) => {
  const root = mkdtempSync(join(tmpdir(), 'coercion-parity-unit-'))
  const unitDir = join(root, 'api')
  mkdirSync(unitDir, { recursive: true })
  mkdirSync(join(root, 'node_modules', 'addon', 'src'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'addon', 'package.json'), '{}')
  writeFileSync(
    join(root, 'node_modules', 'addon', 'src', 'kysely.ts'),
    `export const kysely = { provides: ['kysely'], run(services: any) { services.kysely = (globalThis as any).__parityKysely } }\n`
  )
  const state = {
    optedInContributors:
      options.providesKysely === false
        ? {}
        : {
            db: {
              packageName: 'addon',
              contributors: {
                kysely: {
                  deploy: { module: 'src/kysely.ts', export: 'kysely' },
                },
              },
            },
          },
    rpc: {
      wireAddonDeclarations: new Map([
        ['db', { file: join(root, 'src/a.ts') }],
      ]),
    },
  } as never
  const adapter = new CloudflareProviderAdapter()
  const ctx = {
    unit: {
      name: 'api',
      role: 'function',
      target: 'serverless',
      functionIds: [],
      services: [],
      handlers: [],
      dependsOn: [],
      tags: [],
    },
    unitDir,
    contributorPlatform: {
      serviceNames: [],
      needsQueue: false,
      needsWorkflow: false,
      needsAgent: false,
      ...(coercionMap ? { db: { engine: 'sqlite', coercionMap } } : {}),
    },
  } as never
  const platformServices = await writeUnitPlatformServices({
    provider: adapter,
    ctx,
    state,
    projectDir: root,
  })
  if (!platformServices) return kysely
  ;(globalThis as any).__parityKysely = kysely
  const { createPlatformServices } = await import(
    join(unitDir, 'platform-services.gen.ts')
  )
  const services = await createPlatformServices({}, {})
  return services.kysely as Kysely<any>
}

const stored = {
  sqlite: {
    id: '7d0f',
    due_at: '2026-01-02T03:04:05.000Z',
    done: 1,
    meta: '{"a":1}',
    title: 'ship it',
  },
  postgres: {
    id: '7d0f',
    due_at: new Date('2026-01-02T03:04:05.000Z'),
    done: true,
    meta: { a: 1 },
    title: 'ship it',
  },
}

describe('a Cloudflare deploy coerces columns the way pikku dev does', () => {
  for (const dialect of ['sqlite', 'postgres'] as const) {
    test(`${dialect}: the same query returns the same values`, async () => {
      const { coercionFile, devMap } = await generateDevMap(dialect)
      const raw = new Kysely<any>({ dialect: answering([stored[dialect]]) })

      const dev = raw.withPlugin(createCoercionPlugin({ map: devMap }))
      const deployed = await applyCloudflareEntry(
        readCoercionMap(coercionFile),
        raw
      )

      const query = (db: Kysely<any>) =>
        db.selectFrom('todo').selectAll().executeTakeFirstOrThrow()
      const [devRow, deployedRow] = await Promise.all([
        query(dev),
        query(deployed),
      ])

      assert.deepEqual(deployedRow, devRow)
      assert.ok(deployedRow.due_at instanceof Date)
      assert.equal(deployedRow.done, true)
      assert.deepEqual(deployedRow.meta, { a: 1 })
      // `uuid` is a type, not a coercion: the id comes back as stored.
      assert.equal(deployedRow.id, '7d0f')
    })
  }

  test('a project with no annotated columns deploys without the plugin', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'coercion-parity-'))
    assert.equal(readCoercionMap(join(dir, 'coercion.gen.ts')), undefined)

    const raw = new Kysely<any>({ dialect: answering([stored.sqlite]) })
    assert.equal(await applyCloudflareEntry(undefined, raw), raw)
  })

  test('a map with nothing providing kysely leaves the unit without the plugin', async () => {
    const { coercionFile } = await generateDevMap('sqlite')
    const raw = new Kysely<any>({ dialect: answering([stored.sqlite]) })
    const services = await applyCloudflareEntry(
      readCoercionMap(coercionFile),
      raw,
      { providesKysely: false }
    )
    assert.equal(services, raw)
  })

  test('uuid columns never reach the map', async () => {
    const { coercionFile } = await generateDevMap('sqlite')
    assert.deepEqual(readCoercionMap(coercionFile), {
      todo: { due_at: 'date', done: 'bool', meta: 'json' },
    })
  })
})
