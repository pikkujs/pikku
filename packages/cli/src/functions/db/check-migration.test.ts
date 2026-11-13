import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import {
  CHECK_PROBE_MAX_ROWS,
  CHECK_PROBE_TIMEOUT_MS,
  addCheckStatements,
  checkProbeSql,
  dropCheckStatement,
  inlineCheckExpression,
  mysqlEnforcesChecks,
  planConstraints,
  probesIn,
  runCheckProbe,
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

test('statements per dialect', () => {
  assert.deepEqual(
    addCheckStatements('mysql', '`t`', 'c', '`a` > 0', (n) => `\`${n}\``),
    [
      '-- pikku:check-probe SELECT 1 FROM `t` WHERE NOT (`a` > 0) LIMIT 1\nALTER TABLE `t` ADD CONSTRAINT `c` CHECK (`a` > 0);',
    ]
  )
  assert.equal(
    dropCheckStatement('mysql', '`t`', 'c', (n) => `\`${n}\``),
    'ALTER TABLE `t` DROP CHECK `c`;'
  )
  assert.equal(
    dropCheckStatement('postgres', '"t"', 'c', q),
    'ALTER TABLE "t" DROP CONSTRAINT "c";'
  )
  assert.deepEqual(
    probesIn(
      addCheckStatements('postgres', '"t"', 'c', '"a" > 0', q).join('\n')
    ),
    ['SELECT 1 FROM "t" WHERE NOT ("a" > 0) LIMIT 1']
  )
})

test('mysql version gate', () => {
  assert.equal(mysqlEnforcesChecks('8.0.36'), true)
  assert.equal(mysqlEnforcesChecks('8.0.16'), true)
  assert.equal(mysqlEnforcesChecks('8.0.15'), false)
  assert.equal(mysqlEnforcesChecks('5.7.44'), false)
  assert.equal(mysqlEnforcesChecks('9.1.0'), true)
  assert.equal(mysqlEnforcesChecks('10.11.2-MariaDB'), true)
  assert.equal(mysqlEnforcesChecks('10.1.9-MariaDB'), false)
})

describe('runCheckProbe on a real postgres', () => {
  const setup = async (rows: number) => {
    const db = new PGlite()
    await db.exec(`create table item (qty integer)`)
    if (rows > 0)
      await db.exec(
        `insert into item select g from generate_series(1, ${rows}) g`
      )
    const execute = async (sql: string) =>
      (await db.query<Record<string, unknown>>(sql)).rows
    const target = (expr: string) => ({
      dialect: 'postgres' as const,
      table: 'item',
      probeSql: checkProbeSql('"item"', expr),
    })
    return { db, execute, target }
  }

  test('defaults', () => {
    assert.equal(CHECK_PROBE_TIMEOUT_MS, 30_000)
    assert.equal(CHECK_PROBE_MAX_ROWS, 10_000_000)
  })

  test('passes when every row satisfies it, reports violations when one does not', async () => {
    const { db, execute, target } = await setup(5)
    assert.deepEqual(await runCheckProbe(target('"qty" >= 1'), execute), {
      ok: true,
    })
    assert.deepEqual(await runCheckProbe(target('"qty" >= 2'), execute), {
      ok: false,
      reason: 'violations',
    })
    await db.close()
  })

  test('a null passes, as it does for a real CHECK', async () => {
    const { db, execute, target } = await setup(0)
    await db.exec(`insert into item values (null)`)
    assert.deepEqual(await runCheckProbe(target('"qty" >= 1'), execute), {
      ok: true,
    })
    await db.close()
  })

  test('a probe that does not finish in time fails as a timeout', async () => {
    const { db, target } = await setup(1)
    const slow = async () =>
      new Promise<never[]>((r) => setTimeout(() => r([]), 200))
    const first = async (sql: string) =>
      sql.includes('reltuples') ? [{ estimate: 0 }] : slow()
    assert.deepEqual(
      await runCheckProbe(target('"qty" >= 1'), first, { timeoutMs: 20 }),
      { ok: false, reason: 'timeout' }
    )
    await db.close()
  })

  test('an estimate above the threshold is declined without scanning', async () => {
    const { db, execute, target } = await setup(0)
    await db.exec(`insert into item select g from generate_series(1, 50) g`)
    await db.exec(`analyze item`)
    const result = await runCheckProbe(target('"qty" >= 1'), execute, {
      maxRows: 10,
    })
    assert.equal(result.ok, false)
    assert.equal((result as { reason: string }).reason, 'too-large')
    await db.close()
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
      '"item"',
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
})
