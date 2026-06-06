import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect, type Generated } from 'kysely'
import {
  createInvocationAudit,
  NoopAuditService,
  type AuditEvent,
  type AuditService,
} from '../../../core/src/index.js'

import { createAuditedKysely } from './create-audited-kysely.js'

interface TodoTable {
  id: Generated<number>
  title: string
  done: number
}

interface TestDB {
  todos: TodoTable
}

interface AuditEventTable {
  eventId: string
  occurredAt: string
  type: string
  source: string
  outcome: string | null
  functionId: string | null
  wireType: string | null
  wireId: string | null
  traceId: string | null
  transactionId: string | null
  queryId: string | null
  actorUserId: string | null
  actorOrgId: string | null
  actorPikkuUserId: string | null
  metadataJson: string | null
}

interface AuditVerifierDB extends TestDB {
  audit_events: AuditEventTable
}

function createDb(): Kysely<TestDB> {
  return new Kysely<TestDB>({
    dialect: new SqliteDialect({
      database: new Database(':memory:'),
    }),
  })
}

async function createTodosTable(db: Kysely<TestDB>): Promise<void> {
  await db.schema
    .createTable('todos')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('done', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
}

async function createAuditEventsTable(
  db: Kysely<AuditVerifierDB>
): Promise<void> {
  await db.schema
    .createTable('audit_events')
    .addColumn('eventId', 'text', (col) => col.primaryKey())
    .addColumn('occurredAt', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('source', 'text', (col) => col.notNull())
    .addColumn('outcome', 'text')
    .addColumn('functionId', 'text')
    .addColumn('wireType', 'text')
    .addColumn('wireId', 'text')
    .addColumn('traceId', 'text')
    .addColumn('transactionId', 'text')
    .addColumn('queryId', 'text')
    .addColumn('actorUserId', 'text')
    .addColumn('actorOrgId', 'text')
    .addColumn('actorPikkuUserId', 'text')
    .addColumn('metadataJson', 'text')
    .execute()
}

class ImmediateAuditService implements AuditService {
  constructor(private readonly db: Kysely<AuditVerifierDB>) {}

  async audit(event: AuditEvent): Promise<void> {
    await this.insertEvent(event)
  }

  async write(batch: AuditEvent[]): Promise<void> {
    for (const event of batch) {
      await this.insertEvent(event)
    }
  }

  private async insertEvent(event: AuditEvent): Promise<void> {
    await this.db
      .insertInto('audit_events')
      .values({
        eventId:
          event.eventId ??
          `${event.traceId ?? 'trace'}:${event.queryId ?? 'single'}:${event.occurredAt}`,
        occurredAt: event.occurredAt,
        type: event.type,
        source: event.source,
        outcome: event.outcome ?? null,
        functionId: event.functionId ?? null,
        wireType: event.wireType ?? null,
        wireId: event.wireId ?? null,
        traceId: event.traceId ?? null,
        transactionId: event.transactionId ?? null,
        queryId: event.queryId ?? null,
        actorUserId: event.actor?.userId ?? null,
        actorOrgId: event.actor?.orgId ?? null,
        actorPikkuUserId: event.actor?.pikkuUserId ?? null,
        metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
      })
      .execute()
  }
}

async function countPersistedEvents(
  db: Kysely<AuditVerifierDB>
): Promise<number> {
  const row = await db
    .selectFrom('audit_events')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow()

  return Number(row.count)
}

async function listPersistedEvents(
  db: Kysely<AuditVerifierDB>
): Promise<
  Array<AuditEventTable & { metadata: Record<string, unknown> | null }>
> {
  const rows = await db
    .selectFrom('audit_events')
    .selectAll()
    .orderBy('occurredAt', 'asc')
    .execute()

  return rows.map((row) => ({
    ...row,
    metadata: row.metadataJson
      ? (JSON.parse(row.metadataJson) as Record<string, unknown>)
      : null,
  }))
}

describe('createAuditedKysely', () => {
  const dbs: Kysely<TestDB>[] = []

  afterEach(async () => {
    while (dbs.length > 0) {
      const db = dbs.pop()!
      await db.destroy()
    }
  })

  test('captures insert queries through the invocation audit wrapper', async () => {
    const events: AuditEvent[] = []
    const db = createDb()
    dbs.push(db)
    await createTodosTable(db)

    const auditService: AuditService = {
      audit: async (event) => {
        events.push(event)
      },
      write: async (batch) => {
        events.push(...batch)
      },
    }
    const wire: any = {
      wireType: 'rpc',
      wireId: 'wire-1',
      traceId: 'trace-1',
      functionId: 'todos:create',
      session: { userId: 'user-1', orgId: 'org-1' },
      pikkuUserId: 'user-1',
      audit: { durability: 'best-effort' },
      logger: { warn: () => {} },
    }
    const audit = createInvocationAudit(auditService, wire)
    const auditedDb = createAuditedKysely(db, { audit })

    await auditedDb
      .insertInto('todos')
      .values({ title: 'write tests', done: 0 })
      .execute()
    await audit.close()

    assert.equal(events.length, 1)
    assert.equal(events[0]?.type, 'db.query')
    assert.equal(events[0]?.traceId, 'trace-1')
    assert.equal(events[0]?.functionId, 'todos:create')
    assert.equal(events[0]?.queryId, null)
    assert.deepEqual(events[0]?.metadata, {
      queryKind: 'insert',
      tables: ['todos'],
      changedColumns: ['title', 'done'],
      changes: { title: 'write tests', done: 0 },
      rowCount: 1,
    })
    assert.deepEqual(events[0]?.actor, {
      userId: 'user-1',
      orgId: 'org-1',
      pikkuUserId: 'user-1',
    })
  })

  test('captures update changes from the query tree', async () => {
    const events: AuditEvent[] = []
    const db = createDb()
    dbs.push(db)
    await createTodosTable(db)
    await db.insertInto('todos').values({ title: 'before', done: 0 }).execute()

    const audit = createInvocationAudit(
      {
        audit: async (event) => {
          events.push(event)
        },
        write: async (batch) => {
          events.push(...batch)
        },
      },
      {
        wireType: 'rpc',
        wireId: 'wire-2',
        traceId: 'trace-2',
        functionId: 'todos:update',
        session: { userId: 'user-2' },
        pikkuUserId: 'user-2',
        audit: { durability: 'best-effort' },
        logger: { warn: () => {} },
      } as any
    )
    const auditedDb = createAuditedKysely(db, { audit })

    await auditedDb
      .updateTable('todos')
      .set({ title: 'after', done: 1 })
      .where('id', '=', 1)
      .execute()
    await audit.close()

    assert.equal(events.length, 1)
    assert.equal(events[0]?.metadata?.queryKind, 'update')
    assert.deepEqual(events[0]?.metadata?.changedColumns, ['title', 'done'])
    assert.deepEqual(events[0]?.metadata?.changes, {
      title: 'after',
      done: 1,
    })
    assert.deepEqual(events[0]?.actor, {
      userId: 'user-2',
      orgId: undefined,
      pikkuUserId: 'user-2',
    })
  })

  test('keeps query ids when multiple queries are captured in one invocation', async () => {
    const events: AuditEvent[] = []
    const db = createDb()
    dbs.push(db)
    await createTodosTable(db)

    const audit = createInvocationAudit(
      {
        audit: async (event) => {
          events.push(event)
        },
        write: async (batch) => {
          events.push(...batch)
        },
      },
      {
        wireType: 'rpc',
        wireId: 'wire-3',
        traceId: 'trace-3',
        functionId: 'todos:multi',
        session: { userId: 'user-3' },
        pikkuUserId: 'user-3',
        audit: { durability: 'best-effort' },
        logger: { warn: () => {} },
      } as any
    )
    const auditedDb = createAuditedKysely(db, {
      audit,
      transactionId: 'tx-1',
    })

    await auditedDb
      .insertInto('todos')
      .values({ title: 'first', done: 0 })
      .execute()
    await auditedDb
      .insertInto('todos')
      .values({ title: 'second', done: 1 })
      .execute()
    await audit.close()

    assert.equal(events.length, 2)
    assert.equal(events[0]?.transactionId, 'tx-1')
    assert.equal(events[1]?.transactionId, 'tx-1')
    assert.equal(events[0]?.queryId, 'q-1')
    assert.equal(events[1]?.queryId, 'q-2')
  })

  test('captures select queries by default', async () => {
    const events: AuditEvent[] = []
    const db = createDb()
    dbs.push(db)
    await createTodosTable(db)
    await db.insertInto('todos').values({ title: 'read me', done: 0 }).execute()

    const audit = createInvocationAudit(
      {
        audit: async (event) => {
          events.push(event)
        },
        write: async (batch) => {
          events.push(...batch)
        },
      },
      {
        wireType: 'rpc',
        wireId: 'wire-4',
        audit: { durability: 'best-effort' },
        logger: { warn: () => {} },
      } as any
    )
    const auditedDb = createAuditedKysely(db, { audit })

    await auditedDb.selectFrom('todos').selectAll().execute()
    await audit.close()

    assert.equal(events.length, 1)
    assert.equal(events[0]?.metadata?.queryKind, 'select')
    assert.deepEqual(events[0]?.metadata?.tables, ['todos'])
  })

  test('can skip select auditing when auditReads is false', async () => {
    const events: AuditEvent[] = []
    const db = createDb()
    dbs.push(db)
    await createTodosTable(db)
    await db
      .insertInto('todos')
      .values({ title: 'skip read', done: 0 })
      .execute()

    const audit = createInvocationAudit(
      {
        audit: async (event) => {
          events.push(event)
        },
        write: async (batch) => {
          events.push(...batch)
        },
      },
      {
        wireType: 'rpc',
        wireId: 'wire-5',
        audit: { durability: 'best-effort' },
        logger: { warn: () => {} },
      } as any
    )
    const auditedDb = createAuditedKysely(db, {
      audit,
      auditReads: false,
    })

    await auditedDb.selectFrom('todos').selectAll().execute()
    await audit.close()

    assert.equal(events.length, 0)
  })

  test('noops when audit is not enabled on the wire', async () => {
    const db = createDb()
    dbs.push(db)
    await createTodosTable(db)

    const audit = createInvocationAudit(new NoopAuditService(), {
      wireType: 'rpc',
      wireId: 'wire-6',
      logger: { warn: () => {} },
    } as any)
    const auditedDb = createAuditedKysely(db, { audit })

    await auditedDb
      .insertInto('todos')
      .values({ title: 'noop', done: 0 })
      .execute()
    await audit.close()

    assert.ok(true)
  })

  test('persists read and update queries after best-effort flush', async () => {
    const db = createDb() as Kysely<AuditVerifierDB>
    dbs.push(db as unknown as Kysely<TestDB>)
    await createTodosTable(db)
    await createAuditEventsTable(db)
    await db.insertInto('todos').values({ title: 'seed', done: 0 }).execute()

    const audit = createInvocationAudit(new ImmediateAuditService(db), {
      wireType: 'rpc',
      wireId: 'wire-best-effort',
      traceId: 'trace-best-effort',
      functionId: 'todos:best-effort',
      session: { userId: 'user-best-effort' },
      pikkuUserId: 'user-best-effort',
      audit: { durability: 'best-effort' },
      logger: { warn: () => {} },
    } as any)
    const auditedDb = createAuditedKysely(db, { audit })

    const beforeCount = await countPersistedEvents(db)
    await auditedDb
      .selectFrom('todos')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirstOrThrow()
    await auditedDb
      .updateTable('todos')
      .set({ done: 1 })
      .where('id', '=', 1)
      .execute()
    const insideCount = await countPersistedEvents(db)

    assert.equal(beforeCount, 0)
    assert.equal(insideCount, 0)

    await audit.close()

    const persisted = await listPersistedEvents(db)
    assert.equal(persisted.length, 2)
    assert.deepEqual(
      persisted.map((event) => event.metadata?.queryKind),
      ['select', 'update']
    )
    assert.deepEqual(
      persisted.map((event) => event.traceId),
      ['trace-best-effort', 'trace-best-effort']
    )
    assert.deepEqual(
      persisted.map((event) => event.functionId),
      ['todos:best-effort', 'todos:best-effort']
    )
    assert.deepEqual(
      persisted.map((event) => event.actorUserId),
      ['user-best-effort', 'user-best-effort']
    )
    assert.equal(persisted[0]?.queryId, 'q-1')
    assert.equal(persisted[1]?.queryId, 'q-2')
    assert.deepEqual(persisted[1]?.metadata?.changedColumns, ['done'])
    assert.deepEqual(persisted[1]?.metadata?.changes, { done: 1 })
  })

  test('writes read and update audit events immediately in transactional mode', async () => {
    const db = createDb()
    dbs.push(db)
    await createTodosTable(db)
    await db.insertInto('todos').values({ title: 'seed', done: 0 }).execute()

    const events: AuditEvent[] = []
    const audit = createInvocationAudit(
      {
        audit: async (event) => {
          events.push(event)
        },
      },
      {
        wireType: 'rpc',
        wireId: 'wire-transactional',
        traceId: 'trace-transactional',
        functionId: 'todos:transactional',
        session: { userId: 'user-transactional' },
        pikkuUserId: 'user-transactional',
        audit: { durability: 'transactional' },
        logger: { warn: () => {} },
      } as any
    )

    const counts: number[] = []

    await db.transaction().execute(async (trx) => {
      const auditedTrx = createAuditedKysely(trx as Kysely<TestDB>, {
        audit,
        transactionId: 'tx-verifier-1',
      })

      await auditedTrx
        .selectFrom('todos')
        .selectAll()
        .where('id', '=', 1)
        .executeTakeFirstOrThrow()
      counts.push(events.length)

      await auditedTrx
        .updateTable('todos')
        .set({ done: 1 })
        .where('id', '=', 1)
        .execute()
      counts.push(events.length)
    })

    assert.deepEqual(counts, [1, 2])
    assert.equal(events.length, 2)
    assert.deepEqual(
      events.map((event) => event.transactionId),
      ['tx-verifier-1', 'tx-verifier-1']
    )
    assert.deepEqual(
      events.map((event) => event.metadata?.queryKind),
      ['select', 'update']
    )
    assert.deepEqual(events[1]?.metadata?.changes, { done: 1 })
  })

  test('does not persist audit rows when the invocation is not audited', async () => {
    const db = createDb() as Kysely<AuditVerifierDB>
    dbs.push(db as unknown as Kysely<TestDB>)
    await createTodosTable(db)
    await createAuditEventsTable(db)
    await db.insertInto('todos').values({ title: 'seed', done: 0 }).execute()

    const audit = createInvocationAudit(new ImmediateAuditService(db), {
      wireType: 'rpc',
      wireId: 'wire-plain',
      traceId: 'trace-plain',
      functionId: 'todos:plain',
      session: { userId: 'user-plain' },
      pikkuUserId: 'user-plain',
      logger: { warn: () => {} },
    } as any)
    const auditedDb = createAuditedKysely(db, { audit })

    await auditedDb
      .selectFrom('todos')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirstOrThrow()
    await auditedDb
      .updateTable('todos')
      .set({ done: 1 })
      .where('id', '=', 1)
      .execute()
    await audit.close()

    assert.equal(await countPersistedEvents(db), 0)
  })
})
