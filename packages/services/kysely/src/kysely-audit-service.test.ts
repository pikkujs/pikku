import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect, sql } from 'kysely'
import type { AuditEvent } from '../../../core/src/index.js'

import { KyselyAuditService } from './kysely-audit-service.js'

/**
 * The `audit` table as the docs specify it — all TEXT on every engine, so the
 * service is exercised against the same shape a project would migrate to.
 */
const CREATE_AUDIT_TABLE = `
  CREATE TABLE audit (
    audit_id       TEXT NOT NULL PRIMARY KEY,
    occurred_at    TEXT NOT NULL,
    type           TEXT NOT NULL,
    source         TEXT NOT NULL DEFAULT 'auto',
    outcome        TEXT,
    function_id    TEXT,
    wire_type      TEXT,
    trace_id       TEXT,
    transaction_id TEXT,
    query_id       TEXT,
    user_id        TEXT,
    org_id         TEXT,
    pikku_user_id  TEXT,
    tables         TEXT,
    changed_cols   TEXT,
    event          TEXT,
    old            TEXT,
    data           TEXT
  )
`

let db: Kysely<any>
let service: KyselyAuditService

const event = (
  overrides: Partial<AuditEvent> & Pick<AuditEvent, 'type' | 'occurredAt'>
): AuditEvent => ({
  source: 'explicit',
  ...overrides,
})

beforeEach(async () => {
  db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
  })
  await sql.raw(CREATE_AUDIT_TABLE).execute(db)
  service = new KyselyAuditService(db)
})

const seed = () =>
  service.write([
    event({
      eventId: 'e1',
      type: 'invoice.update',
      occurredAt: '2026-01-01T00:00:00.000Z',
      userIdentity: { userId: 'alice', orgId: 'org-a' },
      metadata: { entity: 'invoice', entityId: 'inv-1' },
    }),
    event({
      eventId: 'e2',
      type: 'invoice.delete',
      occurredAt: '2026-01-02T00:00:00.000Z',
      userIdentity: { userId: 'bob', orgId: 'org-a' },
    }),
    event({
      eventId: 'e3',
      type: 'invoice.update',
      occurredAt: '2026-01-03T00:00:00.000Z',
      userIdentity: { userId: 'alice', orgId: 'org-b' },
    }),
  ])

describe('KyselyAuditService.query', () => {
  test('returns the trail newest first', async () => {
    await seed()
    const { events, nextCursor } = await service.query()
    assert.deepEqual(
      events.map((e) => e.eventId),
      ['e3', 'e2', 'e1']
    )
    assert.equal(nextCursor, null, 'a complete page has no next cursor')
  })

  test('round-trips the event, including parsed metadata', async () => {
    await seed()
    const { events } = await service.query({ types: ['invoice.update'] })
    const first = events.find((e) => e.eventId === 'e1')!
    assert.equal(first.type, 'invoice.update')
    assert.equal(first.source, 'explicit')
    assert.deepEqual(first.userIdentity, {
      userId: 'alice',
      orgId: 'org-a',
      pikkuUserId: undefined,
    })
    assert.deepEqual(first.metadata, { entity: 'invoice', entityId: 'inv-1' })
  })

  test('keeps the wire identity of a caller who never signed in', async () => {
    await service.write([
      event({
        eventId: 'e4',
        type: 'invoice.view',
        occurredAt: '2026-01-04T00:00:00.000Z',
        userIdentity: { pikkuUserId: 'pk_9' },
      }),
    ])
    const { events } = await service.query({ types: ['invoice.view'] })
    assert.deepEqual(events[0]!.userIdentity, {
      userId: undefined,
      orgId: undefined,
      pikkuUserId: 'pk_9',
    })
  })

  test('filters by user', async () => {
    await seed()
    const { events } = await service.query({ userIds: ['alice'] })
    assert.deepEqual(
      events.map((e) => e.eventId),
      ['e3', 'e1']
    )
  })

  test('filters by type', async () => {
    await seed()
    const { events } = await service.query({ types: ['invoice.delete'] })
    assert.deepEqual(
      events.map((e) => e.eventId),
      ['e2']
    )
  })

  test('combines filters as a conjunction', async () => {
    await seed()
    const { events } = await service.query({
      userIds: ['alice'],
      types: ['invoice.update'],
      orgId: 'org-b',
    })
    assert.deepEqual(
      events.map((e) => e.eventId),
      ['e3']
    )
  })

  test('an empty filter array matches nothing rather than everything', async () => {
    await seed()
    const byUser = await service.query({ userIds: [] })
    assert.deepEqual(byUser.events, [])
    const byType = await service.query({ types: [] })
    assert.deepEqual(byType.events, [])
  })

  test('bounds by occurredAt, `from` inclusive and `to` exclusive', async () => {
    await seed()
    const { events } = await service.query({
      from: '2026-01-02T00:00:00.000Z',
      to: '2026-01-03T00:00:00.000Z',
    })
    assert.deepEqual(
      events.map((e) => e.eventId),
      ['e2']
    )
  })

  test('pages, reporting the next offset only while more remain', async () => {
    await seed()
    const first = await service.query({ limit: 2 })
    assert.deepEqual(
      first.events.map((e) => e.eventId),
      ['e3', 'e2']
    )
    assert.equal(first.nextCursor, 2)

    const second = await service.query({ limit: 2, offset: first.nextCursor! })
    assert.deepEqual(
      second.events.map((e) => e.eventId),
      ['e1']
    )
    assert.equal(second.nextCursor, null)
  })

  // Without the audit_id tiebreak the engine may order a same-timestamp batch
  // differently per query, which drops or repeats rows across a page boundary.
  test('orders totally when timestamps tie', async () => {
    const sameTime = '2026-02-01T00:00:00.000Z'
    await service.write(
      ['a', 'b', 'c', 'd'].map((id) =>
        event({ eventId: id, type: 't', occurredAt: sameTime })
      )
    )
    const first = await service.query({ limit: 2 })
    const second = await service.query({ limit: 2, offset: 2 })
    const seen = [...first.events, ...second.events].map((e) => e.eventId)
    assert.deepEqual(seen, ['d', 'c', 'b', 'a'])
    assert.equal(new Set(seen).size, 4, 'no row may appear on two pages')
  })

  test('caps an oversized limit', async () => {
    await service.write(
      Array.from({ length: 5 }, (_, i) =>
        event({
          eventId: `e${i}`,
          type: 't',
          occurredAt: `2026-03-0${i + 1}T00:00:00.000Z`,
        })
      )
    )
    const { events } = await service.query({ limit: 10_000 })
    assert.equal(events.length, 5, 'the cap must not lose rows below it')
  })

  test('a malformed data column surfaces rather than dropping the event', async () => {
    await sql
      .raw(
        `INSERT INTO audit (audit_id, occurred_at, type, source, data)
         VALUES ('bad', '2026-04-01T00:00:00.000Z', 'legacy.write', 'auto', 'not json')`
      )
      .execute(db)
    const { events } = await service.query()
    assert.equal(events.length, 1)
    assert.equal(events[0]!.metadata as unknown, 'not json')
  })
})

/**
 * The two connections a project actually hands this service. `CamelCasePlugin`
 * is on almost every pikku Kysely instance, and it renames result columns on
 * the way out — `audit_id` arrives as `auditId` — so a service that only reads
 * the physical names returns a page of undefined-everything against the setup
 * most projects have.
 */
describe('KyselyAuditService against a CamelCasePlugin connection', () => {
  let camelDb: Kysely<any>
  let camelService: KyselyAuditService

  beforeEach(async () => {
    camelDb = new Kysely<any>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
      plugins: [new CamelCasePlugin()],
    })
    await sql.raw(CREATE_AUDIT_TABLE).execute(camelDb)
    camelService = new KyselyAuditService(camelDb)
  })

  test('reads back everything it wrote', async () => {
    await camelService.write([
      event({
        eventId: 'e1',
        type: 'invoice.update',
        occurredAt: '2026-01-01T00:00:00.000Z',
        outcome: 'success',
        functionId: 'cancelInvoice',
        wireType: 'http',
        traceId: 'trace-1',
        userIdentity: { userId: 'alice', orgId: 'org-a' },
        metadata: { entity: 'invoice' },
      }),
    ])
    const { events } = await camelService.query()
    assert.equal(events.length, 1)
    assert.deepEqual(events[0], {
      eventId: 'e1',
      occurredAt: '2026-01-01T00:00:00.000Z',
      type: 'invoice.update',
      source: 'explicit',
      outcome: 'success',
      functionId: 'cancelInvoice',
      wireType: 'http',
      traceId: 'trace-1',
      transactionId: undefined,
      queryId: undefined,
      userIdentity: {
        userId: 'alice',
        orgId: 'org-a',
        pikkuUserId: undefined,
      },
      metadata: { entity: 'invoice' },
    })
  })

  test('still filters and facets by user', async () => {
    await camelService.write([
      event({
        eventId: 'e1',
        type: 'a',
        occurredAt: '2026-01-01T00:00:00.000Z',
        userIdentity: { userId: 'alice' },
      }),
      event({
        eventId: 'e2',
        type: 'b',
        occurredAt: '2026-01-02T00:00:00.000Z',
        userIdentity: { userId: 'bob' },
      }),
    ])
    const { events } = await camelService.query({ userIds: ['bob'] })
    assert.deepEqual(
      events.map((e) => e.eventId),
      ['e2']
    )
    const facets = await camelService.facets()
    assert.deepEqual(facets.userIds, ['alice', 'bob'])
  })
})

describe('KyselyAuditService.init', () => {
  test('creates the audit table on a database that has none', async () => {
    const fresh = new Kysely<any>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
      plugins: [new CamelCasePlugin()],
    })
    const freshService = new KyselyAuditService(fresh)
    await freshService.init()
    await freshService.write([
      event({ eventId: 'e1', type: 't', occurredAt: '2026-01-01' }),
    ])
    const { events } = await freshService.query()
    assert.deepEqual(
      events.map((e) => e.eventId),
      ['e1']
    )
  })

  // Two boots against one database, and the second must not wipe the first.
  test('is idempotent and keeps what is already there', async () => {
    await service.write([
      event({ eventId: 'e1', type: 't', occurredAt: '2026-01-01' }),
    ])
    await service.init()
    await service.init()
    const { events } = await service.query()
    assert.deepEqual(
      events.map((e) => e.eventId),
      ['e1']
    )
  })
})

describe('KyselyAuditService.facets', () => {
  test('lists the distinct users and types across the whole trail', async () => {
    await seed()
    const facets = await service.facets()
    assert.deepEqual(facets.userIds, ['alice', 'bob'])
    assert.deepEqual(facets.types, ['invoice.delete', 'invoice.update'])
  })

  test('omits userless events from the user list', async () => {
    await service.write([
      event({ eventId: 'cron', type: 'cleanup.ran', occurredAt: '2026-05-01' }),
    ])
    const facets = await service.facets()
    assert.deepEqual(facets.userIds, [])
    assert.deepEqual(facets.types, ['cleanup.ran'])
  })
})
