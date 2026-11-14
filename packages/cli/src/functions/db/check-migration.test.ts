import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CHECK_PROBE_MAX_ROWS,
  CHECK_PROBE_TIMEOUT_MS,
  MigrationFailedError,
  checkProbeHook,
  migrate,
  postgresProbeExecutor,
  probesIn,
  runCheckProbe,
  type CheckProbe,
} from '@pikku/migrator-sql'
import { PostgresMigrationExecutor } from '@pikku/migrator-sql/postgres'
import {
  addCheckStatements,
  checkChangeStatements,
  checkProbeSql,
  dropCheckStatement,
  inlineCheckExpression,
  interimCheckName,
  mysqlCheckSupport,
  planConstraints,
  singleSpaced,
  type CheckTable,
} from './check-migration.js'
import type { ColumnInfo } from './db-introspector.js'

const q = (n: string) => `"${n}"`
const col = (checks: { name: string; expression: string }[]): ColumnInfo =>
  ({ name: 'qty', type: 'integer', notNull: false, pk: false, checks }) as never

describe('planConstraints', () => {
  const min0 = { name: 'item_qty_min_check', expression: '"qty" >= 0' }
  test('adds a missing check, drops a changed one first, drops an undeclared generated one', () => {
    assert.deepEqual(planConstraints('item', 'qty', col([min0]), col([])).add, [
      min0,
    ])
    const changed = planConstraints(
      'item',
      'qty',
      col([min0]),
      col([{ name: min0.name, expression: '"qty" >= 1' }])
    )
    assert.deepEqual(changed.drop, [min0.name])
    assert.deepEqual(changed.add, [min0])
    const removed = planConstraints('item', 'qty', col([]), col([min0]))
    assert.deepEqual(removed.drop, [min0.name])
    assert.deepEqual(removed.add, [])
  })
  test('leaves a hand-written check, and an equal one under another name, alone', () => {
    const mine = { name: 'my_rule', expression: '"qty" >= 0' }
    assert.equal(
      planConstraints('item', 'qty', col([min0]), col([mine])).add.length,
      0
    )
    assert.equal(
      planConstraints('item', 'qty', col([]), col([mine])).drop.length,
      0
    )
  })
})

test('inlineCheckExpression lifts the condition, quotes and nested brackets included', () => {
  const def = `"kind" text constraint "item_kind_enum_check" check ("kind" in ('a)', 'b''c')) not null`
  assert.equal(
    inlineCheckExpression(def, 'item_kind_enum_check'),
    `"kind" in ('a)', 'b''c')`
  )
  assert.equal(inlineCheckExpression(def, 'other'), undefined)
})

const myq = (n: string) => `\`${n}\``
const pgTable: CheckTable = {
  schema: 'app',
  table: 't',
  qualified: '"app"."t"',
}
const myTable: CheckTable = { table: 't', qualified: '`t`' }

test('statements per dialect', () => {
  assert.deepEqual(addCheckStatements('mysql', myTable, 'c', '`a` > 0', myq), [
    `-- pikku:check-probe {"table":"t","sql":"SELECT 1 FROM \`t\` WHERE NOT (\`a\` > 0) LIMIT 1"}\nALTER TABLE \`t\` ADD CONSTRAINT \`c\` CHECK (\`a\` > 0);`,
  ])
  assert.equal(
    dropCheckStatement('mysql', '`t`', 'c', myq),
    'ALTER TABLE `t` DROP CHECK `c`;'
  )
  assert.equal(
    dropCheckStatement('postgres', '"t"', 'c', q),
    'ALTER TABLE "t" DROP CONSTRAINT "c";'
  )
  assert.deepEqual(
    probesIn(
      addCheckStatements('postgres', pgTable, 'c', '"a" > 0', q).join('\n')
    ),
    [
      {
        schema: 'app',
        table: 't',
        sql: 'SELECT 1 FROM "app"."t" WHERE NOT ("a" > 0) LIMIT 1',
      },
    ]
  )
})

describe('a changed check', () => {
  const change = { drop: ['c'], add: [{ name: 'c', expression: '`a` > 1' }] }
  const kinds = (statements: string[]) =>
    statements.map((s) =>
      s
        .split('\n')
        .pop()!
        .replace(/ CHECK \(.*$/, '')
    )

  test('on mysql goes in under an interim name first, so refused rows leave the old check in place', () => {
    const statements = checkChangeStatements('mysql', myTable, change, myq)
    assert.deepEqual(kinds(statements), [
      `ALTER TABLE \`t\` ADD CONSTRAINT \`${interimCheckName('c')}\``,
      'ALTER TABLE `t` DROP CHECK `c`;',
      'ALTER TABLE `t` ADD CONSTRAINT `c`',
      `ALTER TABLE \`t\` DROP CHECK \`${interimCheckName('c')}\`;`,
    ])
    // Nothing is dropped until the replacement has been accepted.
    assert.match(statements[0]!, /^-- pikku:check-probe /)
  })

  test('on postgres is a drop then an add, which the migration transaction makes atomic', () => {
    const statements = checkChangeStatements(
      'postgres',
      pgTable,
      { drop: ['c'], add: [{ name: 'c', expression: '"a" > 1' }] },
      q
    )
    assert.match(statements[0]!, /DROP CONSTRAINT "c"/)
    assert.match(
      statements[1]!,
      /ADD CONSTRAINT "c" CHECK \("a" > 1\) NOT VALID/
    )
    assert.match(statements[2]!, /VALIDATE CONSTRAINT "c"/)
  })

  test('a plain add or drop stays one statement', () => {
    assert.equal(
      checkChangeStatements('mysql', myTable, { drop: ['x'], add: [] }, myq)
        .length,
      1
    )
    assert.equal(
      checkChangeStatements(
        'mysql',
        myTable,
        { drop: [], add: [{ name: 'y', expression: '`a` > 0' }] },
        myq
      ).length,
      1
    )
  })

  test('the interim name stays within the 64 characters MySQL allows', () => {
    assert.ok(interimCheckName('x'.repeat(64)).length <= 64)
  })
})

test('the probe SQL keeps whitespace inside a string and refuses a comment', () => {
  assert.equal(
    singleSpaced(`"kind"   in ('a   b',\n  'c')`),
    `"kind" in ('a   b', 'c')`
  )
  assert.equal(
    checkProbeSql('"t"', `"p" <> 'two  spaces'`),
    `SELECT 1 FROM "t" WHERE NOT ("p" <> 'two  spaces') LIMIT 1`
  )
  assert.equal(
    singleSpaced(`"a" <> '-- not a comment'`),
    `"a" <> '-- not a comment'`
  )
  assert.throws(() => singleSpaced(`"a" > 0 -- why`), /comment/)
  assert.throws(() => singleSpaced(`"a" > 0 /* why */`), /comment/)
})

test('mysql version gate', () => {
  assert.equal(mysqlCheckSupport('8.0.36'), 'ok')
  assert.equal(mysqlCheckSupport('8.0.16'), 'ok')
  assert.equal(mysqlCheckSupport('8.0.15'), 'too-old')
  assert.equal(mysqlCheckSupport('5.7.44'), 'too-old')
  assert.equal(mysqlCheckSupport('9.1.0'), 'ok')
})

test('a MariaDB server is refused, whatever its version', () => {
  for (const version of [
    '10.11.2-MariaDB',
    '11.4.2-MariaDB',
    '5.5.5-10.11.6-MariaDB',
    '10.1.9-MariaDB',
  ]) {
    assert.equal(mysqlCheckSupport(version), 'mariadb', version)
  }
})

/** A PGlite as the migrator's client. */
const pgClient = (db: PGlite) => ({
  query: async <T = unknown>(sql: string, params?: unknown[]) => ({
    rows: (await db.query<T>(sql, params)).rows,
  }),
  exec: (sql: string) => db.exec(sql),
})

describe('the probe on a real postgres', () => {
  const probe = (expr: string): CheckProbe => ({
    table: 'item',
    sql: checkProbeSql('"item"', expr),
  })
  const setup = async (rows: number) => {
    const db = new PGlite()
    await db.exec(`create table item (qty integer)`)
    if (rows > 0)
      await db.exec(
        `insert into item select g from generate_series(1, ${rows}) g`
      )
    const execute = async (sql: string) =>
      (await db.query<Record<string, unknown>>(sql)).rows
    return { db, execute }
  }

  test('defaults', () => {
    assert.equal(CHECK_PROBE_TIMEOUT_MS, 30_000)
    assert.equal(CHECK_PROBE_MAX_ROWS, 10_000_000)
  })

  test('passes when every row satisfies it, reports violations when one does not', async () => {
    const { db, execute } = await setup(5)
    assert.deepEqual(
      await runCheckProbe('postgres', probe('"qty" >= 1'), execute),
      { ok: true }
    )
    assert.deepEqual(
      await runCheckProbe('postgres', probe('"qty" >= 2'), execute),
      {
        ok: false,
        reason: 'violations',
      }
    )
    await db.close()
  })

  test('a null passes, as it does for a real CHECK', async () => {
    const { db, execute } = await setup(0)
    await db.exec(`insert into item values (null)`)
    assert.deepEqual(
      await runCheckProbe('postgres', probe('"qty" >= 1'), execute),
      { ok: true }
    )
    await db.close()
  })

  test('a table that does not exist has nothing to break the check', async () => {
    const { db, execute } = await setup(0)
    assert.deepEqual(
      await runCheckProbe(
        'postgres',
        { table: 'nowhere', sql: 'SELECT 1 FROM nowhere' },
        execute
      ),
      { ok: true }
    )
    await db.close()
  })

  test('a probe that does not finish in time fails as a timeout', async () => {
    const slow = async (sql: string) =>
      sql.includes('reltuples')
        ? [{ estimate: 5 }]
        : new Promise<never[]>((r) => setTimeout(() => r([]), 200))
    assert.deepEqual(
      await runCheckProbe('postgres', probe('"qty" >= 1'), slow, {
        timeoutMs: 20,
      }),
      { ok: false, reason: 'timeout' }
    )
  })

  test('an estimate above the threshold is declined without scanning', async () => {
    const { db, execute } = await setup(0)
    await db.exec(`insert into item select g from generate_series(1, 50) g`)
    await db.exec(`analyze item`)
    const result = await runCheckProbe(
      'postgres',
      probe('"qty" >= 1'),
      execute,
      { maxRows: 10 }
    )
    assert.equal((result as { reason: string }).reason, 'too-large')
    await db.close()
  })

  test('a table never analysed (reltuples -1) is counted, not waved through', async () => {
    const { db, execute } = await setup(50)
    const { rows } = await db.query<{ e: number }>(
      `select reltuples::bigint as e from pg_class where oid = 'item'::regclass`
    )
    assert.ok(
      Number(rows[0]!.e) <= 0,
      `precondition: reltuples is ${rows[0]!.e}`
    )
    const seen: string[] = []
    const result = await runCheckProbe(
      'postgres',
      probe('"qty" >= 1'),
      async (sql) => (seen.push(sql), execute(sql)),
      { maxRows: 10 }
    )
    assert.equal((result as { reason: string }).reason, 'too-large')
    assert.ok(seen.some((sql) => /count\(\*\)/.test(sql)))
    await db.close()
  })

  test('a schema or table name with a quote in it cannot break out of the estimate', async () => {
    const { db, execute } = await setup(0)
    await db.exec(`create table "we'ird""t" (qty integer)`)
    assert.deepEqual(
      await runCheckProbe(
        'postgres',
        { table: `we'ird"t`, sql: `SELECT 1 FROM "we'ird""t" LIMIT 1` },
        execute
      ),
      { ok: true }
    )
    await db.close()
  })
})

describe('the probe in front of a migration', () => {
  const withMigrations = async (
    setupSql: string,
    probes: string,
    body: (db: PGlite, dir: string) => Promise<void>
  ) => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-probe-'))
    const db = new PGlite()
    try {
      writeFileSync(join(dir, '0001-init.sql'), setupSql)
      writeFileSync(join(dir, '0002-check.sql'), probes)
      await body(db, dir)
    } finally {
      await db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const migration = (expr: string) =>
    addCheckStatements(
      'postgres',
      { table: 'item', qualified: '"item"' },
      'item_qty_min_check',
      expr,
      q
    ).join('\n')

  test('refuses a migration whose rows break the check, before any of it runs', async () => {
    await withMigrations(
      `create table item (qty integer); insert into item values (0), (2);`,
      `${migration('"qty" >= 1')}\ncreate table after_it (x integer);`,
      async (db, dir) => {
        const client = pgClient(db)
        await assert.rejects(
          migrate(new PostgresMigrationExecutor(client), dir, {
            beforeMigration: checkProbeHook(
              'postgres',
              postgresProbeExecutor(client)
            ),
          }),
          (error) =>
            error instanceof MigrationFailedError &&
            /rows in item already break the check/.test(error.message) &&
            /Applied before it failed: 0001-init\.sql/.test(error.message)
        )
        const applied = await db.query(`select name from sql_migrations`)
        assert.deepEqual(applied.rows, [{ name: '0001-init.sql' }])
        assert.equal(
          (await db.query(`select to_regclass('after_it') as t`)).rows[0]!.t,
          null
        )
      }
    )
  })

  test('lets it through, and the table it creates in an earlier migration is probed after that migration ran', async () => {
    await withMigrations(
      `create table item (qty integer); insert into item values (1), (2);`,
      migration('"qty" >= 1'),
      async (db, dir) => {
        const client = pgClient(db)
        const result = await migrate(
          new PostgresMigrationExecutor(client),
          dir,
          {
            beforeMigration: checkProbeHook(
              'postgres',
              postgresProbeExecutor(client)
            ),
          }
        )
        assert.deepEqual(result.applied, ['0001-init.sql', '0002-check.sql'])
      }
    )
  })

  test('a data fix earlier in the same file is not refused on the rows it is about to change', async () => {
    await withMigrations(
      `create table item (qty integer); insert into item values (0), (2);`,
      `update item set qty = 1 where qty = 0;\n${migration('"qty" >= 1')}`,
      async (db, dir) => {
        const client = pgClient(db)
        const result = await migrate(
          new PostgresMigrationExecutor(client),
          dir,
          {
            beforeMigration: checkProbeHook(
              'postgres',
              postgresProbeExecutor(client)
            ),
          }
        )
        assert.deepEqual(result.applied, ['0001-init.sql', '0002-check.sql'])
      }
    )
  })

  test('a failure with nothing applied before it says so', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-probe-'))
    const db = new PGlite()
    try {
      writeFileSync(
        join(dir, '0001-init.sql'),
        `create table item (qty integer); insert into item values (0);\n${migration('"qty" >= 1')}`
      )
      // The table does not exist when the probe runs, so it passes and the
      // database itself refuses; the message must not claim anything applied.
      await assert.rejects(
        migrate(new PostgresMigrationExecutor(pgClient(db)), dir, {
          beforeMigration: checkProbeHook(
            'postgres',
            postgresProbeExecutor(pgClient(db))
          ),
        }),
        /Nothing was applied in this run/
      )
    } finally {
      await db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('refuses a table above the row cap', async () => {
    await withMigrations(
      `create table item (qty integer); insert into item select g from generate_series(1, 30) g;`,
      migration('"qty" >= 1'),
      async (db, dir) => {
        const client = pgClient(db)
        await assert.rejects(
          migrate(new PostgresMigrationExecutor(client), dir, {
            beforeMigration: checkProbeHook(
              'postgres',
              postgresProbeExecutor(client),
              { maxRows: 10 }
            ),
          }),
          /more than the 10000000 the probe will scan/
        )
      }
    )
  })
})

describe('the generated postgres statements on a populated table', () => {
  const run = async (rows: string) => {
    const db = new PGlite()
    await db.exec(
      `create table item (qty integer); insert into item values ${rows}`
    )
    const [add, validate] = addCheckStatements(
      'postgres',
      { table: 'item', qualified: '"item"' },
      'item_qty_min_check',
      '"qty" >= 1',
      q
    )
    return { db, add: add!, validate: validate! }
  }

  test('the check is added and validated when the rows satisfy it', async () => {
    const { db, add, validate } = await run('(1), (2), (null)')
    await db.exec(add)
    await db.exec(validate)
    const { rows } = await db.query<{ convalidated: boolean }>(
      `select convalidated from pg_constraint where conname = 'item_qty_min_check'`
    )
    assert.equal(rows[0]!.convalidated, true)
    await db.close()
  })

  test('a violating row fails VALIDATE, after ADD left new writes checked and the old rows alone', async () => {
    const { db, add, validate } = await run('(0), (2)')
    await db.exec(add)
    await assert.rejects(db.exec(`insert into item values (-5)`))
    await assert.rejects(db.exec(validate), /violated by some row/)
    assert.equal((await db.query(`select * from item`)).rows.length, 2)
    await db.close()
  })

  test('inside one transaction, which is how the migrator runs it, the lock is held to the commit', async () => {
    // The honest version of the claim: the NOT VALID / VALIDATE split does not
    // release the table's lock between the two statements here, because they
    // share a transaction. PGlite is one connection, so this can only show the
    // lock mode survives until the end of the transaction.
    const { db, add, validate } = await run('(1)')
    await db.exec('BEGIN')
    await db.exec(add)
    await db.exec(validate)
    const { rows } = await db.query<{ mode: string }>(
      `select mode from pg_locks where relation = 'item'::regclass and mode = 'AccessExclusiveLock'`
    )
    assert.equal(rows.length, 1)
    await db.exec('COMMIT')
    await db.close()
  })
})
