import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import type { AnalyticsRecord } from '@pikku/core/analytics'

import { KyselyAnalyticsService } from './kysely-analytics-service.js'
import { applyPikkuSchemas } from './schema/index.js'
import { analyticsSchema } from './schema/analytics.schema.js'

let db: Kysely<any>
let service: KyselyAnalyticsService

const record = (overrides: Partial<AnalyticsRecord> = {}): AnalyticsRecord => ({
  name: 'page_viewed',
  occurredAt: '2026-09-13T10:00:00.000Z',
  source: 'client',
  userIdentity: { userId: null },
  ...overrides,
})

const rows = () =>
  db.selectFrom('pikkuAnalyticsEvents').selectAll().orderBy('name').execute()

beforeEach(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin()],
  })
  await applyPikkuSchemas(db, [analyticsSchema])
  service = new KyselyAnalyticsService(db)
  await service.init()
})

describe('KyselyAnalyticsService', () => {
  test('writes a batch as one row each', async () => {
    await service.write([
      record({ name: 'a' }),
      record({ name: 'b' }),
      record({ name: 'c' }),
    ])

    assert.deepEqual(
      (await rows()).map((row) => row.name),
      ['a', 'b', 'c']
    )
  })

  test('an empty batch touches the database not at all', async () => {
    await service.write([])

    assert.equal((await rows()).length, 0)
  })

  test('keeps the identity queryable rather than buried in the JSON', async () => {
    await service.write([
      record({
        userIdentity: {
          userId: 'u1',
          orgId: 'org1',
          anonymousId: 'aid1',
          vendorIds: { gaClientId: 'GA1.1.1.1' },
          consent: { analytics: true },
        },
        traceId: 't1',
        functionId: 'f1',
        props: { path: '/pricing' },
      }),
    ])

    const [row] = await rows()
    assert.equal(row.userId, 'u1')
    assert.equal(row.orgId, 'org1')
    assert.equal(row.anonymousId, 'aid1')
    assert.equal(row.traceId, 't1')
    assert.equal(row.functionId, 'f1')
    assert.deepEqual(JSON.parse(row.props), { path: '/pricing' })
    assert.deepEqual(JSON.parse(row.vendorIds), { gaClientId: 'GA1.1.1.1' })
    assert.deepEqual(JSON.parse(row.consent), { analytics: true })
  })

  test('an anonymous visitor stores a null user, not the string', async () => {
    await service.write([record({ userIdentity: { userId: null } })])

    const [row] = await rows()
    assert.equal(row.userId, null)
    assert.equal(row.props, null)
  })

  test('two events in one batch get their own ids', async () => {
    await service.write([record({ name: 'a' }), record({ name: 'b' })])

    const [a, b] = await rows()
    assert.notEqual(a.eventId, b.eventId)
  })

  test('refuses to start against a database with no table', async () => {
    const bare = new Kysely<any>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
      plugins: [new CamelCasePlugin()],
    })

    await assert.rejects(
      () => new KyselyAnalyticsService(bare).init(),
      /pikku db generate/
    )
  })
})
