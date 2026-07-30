import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect, sql } from 'kysely'
import Database from 'better-sqlite3'

import type { KyselyPikkuDB } from './kysely-tables.js'
import { SerializePlugin } from './serialize-plugin.js'
import { KyselyWorkflowService } from './kysely-workflow-service.js'

let db: Kysely<KyselyPikkuDB>
let service: KyselyWorkflowService
let queries: string[]

/**
 * Every statement the service issues, so a test can assert on round-trip count
 * rather than on wall-clock — the only measure that stays stable in CI.
 */
const createDb = () => {
  queries = []
  return new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
    log: (event) => {
      if (event.level === 'query') {
        queries.push(event.query.sql)
      }
    },
  })
}

beforeEach(async () => {
  db = createDb()
  service = new KyselyWorkflowService(db, { wireQueues: false } as any)
  await service.init()
})

afterEach(async () => {
  await db.destroy()
})

const listIndexes = async (table: string): Promise<string[]> => {
  const rows = await sql<{
    name: string
  }>`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ${table} AND name NOT LIKE 'sqlite_%'`.execute(
    db
  )
  return rows.rows.map((r) => r.name)
}

const indexedColumns = async (indexName: string): Promise<string[]> => {
  const rows = await sql<{
    name: string
  }>`SELECT name FROM pragma_index_info(${indexName})`.execute(db)
  return rows.rows.map((r) => r.name)
}

const seedRun = (name = 'wf') =>
  service.createRun(name, { foo: 1 }, false, 'hash1', {
    type: 'internal',
  } as any)

describe('KyselyWorkflowService — schema indexes', () => {
  test('workflow_step_history is indexed by its step, the column every hot query filters on', async () => {
    const indexes = await listIndexes('workflow_step_history')
    assert.notEqual(
      indexes.length,
      0,
      'workflow_step_history has no indexes; the attempt-count subquery and the latest-attempt lookup both seq-scan it'
    )

    const columnsPerIndex = await Promise.all(
      indexes.map((name) => indexedColumns(name))
    )
    assert.ok(
      columnsPerIndex.some((cols) => cols[0] === 'workflow_step_id'),
      `expected an index led by workflow_step_id, got ${JSON.stringify(columnsPerIndex)}`
    )
  })

  test('the step-history index also orders by created_at, so the latest attempt is a lookup not a sort', async () => {
    const indexes = await listIndexes('workflow_step_history')
    const columnsPerIndex = await Promise.all(
      indexes.map((name) => indexedColumns(name))
    )
    assert.ok(
      columnsPerIndex.some(
        (cols) => cols[0] === 'workflow_step_id' && cols[1] === 'created_at'
      ),
      `expected a (workflow_step_id, created_at) index, got ${JSON.stringify(columnsPerIndex)}`
    )
  })

  test('workflow_runs is indexed for the status + recency listing', async () => {
    const indexes = await listIndexes('workflow_runs')
    const columnsPerIndex = await Promise.all(
      indexes.map((name) => indexedColumns(name))
    )
    assert.ok(
      columnsPerIndex.some((cols) => cols.includes('status')),
      `expected an index covering status, got ${JSON.stringify(columnsPerIndex)}`
    )
  })

  test('workflow_step is indexed for the per-run status scan the graph runner does every tick', async () => {
    const indexes = await listIndexes('workflow_step')
    const columnsPerIndex = await Promise.all(
      indexes.map((name) => indexedColumns(name))
    )
    assert.ok(
      columnsPerIndex.some(
        (cols) => cols[0] === 'workflow_run_id' && cols.includes('status')
      ),
      `expected a (workflow_run_id, status) index, got ${JSON.stringify(columnsPerIndex)}`
    )
  })

  test('workflow_versions is indexed for the version lookup', async () => {
    const indexes = await listIndexes('workflow_versions')
    assert.notEqual(
      indexes.length,
      0,
      'workflow_versions is queried on every version-mismatch replay with no index'
    )
  })

  test('init() is idempotent — a second boot does not throw on existing indexes', async () => {
    // A fresh instance, because `init()` returns at its `initialized` guard on
    // the same one — so calling it twice re-issues no DDL and never exercises
    // the duplicate-index path this is here to cover.
    await new KyselyWorkflowService(db, { wireQueues: false } as any).init()

    const indexes = await listIndexes('workflow_step_history')
    assert.ok(indexes.length > 0)
  })
})

/**
 * A step transition writes the step row and its history row, and nothing else.
 * BEGIN/COMMIT are excluded: they are the price of writing the pair atomically,
 * and counting them would make the assertion about transaction framing rather
 * than about the work being done.
 */
const dataStatements = () =>
  queries.filter((q) => !/^\s*(begin|commit|rollback)/i.test(q))

describe('KyselyWorkflowService — step transition round-trips', () => {
  const transitions: Array<[string, (stepId: string) => Promise<void>]> = [
    ['setStepRunning', (id) => service.setStepRunning(id)],
    ['setStepResult', (id) => service.setStepResult(id, { ok: true })],
    ['setStepError', (id) => service.setStepError(id, new Error('boom'))],
  ]

  for (const [name, run] of transitions) {
    test(`${name} writes two rows and reads none`, async () => {
      const runId = await seedRun()
      const step = await service.insertStepState(runId, 's1', 'rpc.fn', {
        x: 1,
      })

      queries.length = 0
      await run(step.stepId)

      const statements = dataStatements()
      assert.equal(
        statements.length,
        2,
        `${name} issued ${statements.length} statements:\n${statements.join('\n')}`
      )
      assert.ok(
        statements.every((q) => /^\s*update/i.test(q)),
        `${name} still reads before it writes — the latest-attempt lookup used to sort an unindexed history table:\n${statements.join('\n')}`
      )
    })

    test(`${name} writes both rows atomically`, async () => {
      const runId = await seedRun()
      const step = await service.insertStepState(runId, 's1', 'rpc.fn', {
        x: 1,
      })

      queries.length = 0
      await run(step.stepId)

      assert.ok(
        /^\s*begin/i.test(queries[0] ?? ''),
        `${name} wrote the step and its history outside a transaction; a crash between them leaves the two disagreeing`
      )
      assert.ok(/^\s*commit/i.test(queries.at(-1) ?? ''))
    })
  }
})

describe('KyselyWorkflowService — step transitions stay consistent', () => {
  test('setStepResult writes the step row and its history row together', async () => {
    const runId = await seedRun()
    const step = await service.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })
    await service.setStepRunning(step.stepId)
    await service.setStepResult(step.stepId, { ok: true })

    const state = await service.getStepState(runId, 's1')
    assert.equal(state.status, 'succeeded')
    assert.deepEqual(state.result, { ok: true })

    const history = await service.getRunHistory(runId)
    const latest = history.at(-1)
    assert.equal(
      latest?.status,
      'succeeded',
      'the step row says succeeded but its latest history row does not'
    )
    assert.deepEqual(latest?.result, { ok: true })
    assert.ok(latest?.succeededAt, 'succeededAt was not stamped on history')
  })

  test('setStepError records the failure on both the step and its history', async () => {
    const runId = await seedRun()
    const step = await service.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })
    await service.setStepRunning(step.stepId)
    await service.setStepError(step.stepId, new Error('boom'))

    const state = await service.getStepState(runId, 's1')
    assert.equal(state.status, 'failed')
    assert.equal(state.error?.message, 'boom')

    const history = await service.getRunHistory(runId)
    const latest = history.at(-1)
    assert.equal(latest?.status, 'failed')
    assert.equal(latest?.error?.message, 'boom')
    assert.ok(latest?.failedAt, 'failedAt was not stamped on history')
  })

  test('a same-millisecond retry resolves the retry attempt, not the failed one', async () => {
    const runId = await seedRun()
    const step = await service.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })
    await service.setStepRunning(step.stepId)
    await service.setStepError(step.stepId, new Error('first'))

    // No delay: both history rows land in the same millisecond, so created_at
    // alone cannot say which is newest.
    const retry = await service.createRetryAttempt(step.stepId, 'running')
    await service.setStepResult(retry.stepId, { ok: true })

    const history = await service.getRunHistory(runId)
    assert.equal(
      history.length,
      2,
      'expected one attempt row plus one retry row'
    )
    assert.deepEqual(
      history.map((h) => h.status),
      ['failed', 'succeeded'],
      `the retry resolved the wrong history row: ${JSON.stringify(
        history.map((h) => h.status)
      )}`
    )
  })
})

describe('KyselyWorkflowService — attempt counting', () => {
  test('attemptCount tracks retries', async () => {
    const runId = await seedRun()
    const step = await service.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })
    assert.equal((await service.getStepState(runId, 's1')).attemptCount, 1)

    await service.setStepError(step.stepId, new Error('one'))
    await service.createRetryAttempt(step.stepId, 'running')
    assert.equal((await service.getStepState(runId, 's1')).attemptCount, 2)

    await service.setStepError(step.stepId, new Error('two'))
    const third = await service.createRetryAttempt(step.stepId, 'running')
    assert.equal(third.attemptCount, 3)
    assert.equal((await service.getStepState(runId, 's1')).attemptCount, 3)
  })

  test('reading a step does not touch the history table', async () => {
    const runId = await seedRun()
    await service.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })

    queries.length = 0
    await service.getStepState(runId, 's1')
    assert.ok(
      !queries.join('\n').includes('workflow_step_history'),
      `the hottest read in the engine still aggregates over the history table:\n${queries.join('\n')}`
    )
  })

  test('a replay reads every step of a run in one query', async () => {
    const runId = await seedRun()
    for (let i = 0; i < 6; i++) {
      await service.insertStepState(runId, `s${i}`, 'rpc.fn', { i })
    }

    queries.length = 0
    const steps = await (service as any).listStepStates(runId)
    assert.equal(steps.length, 6)
    assert.equal(
      queries.length,
      1,
      `expected one query for the whole run, got ${queries.length}`
    )
    assert.deepEqual(steps.map((s: any) => s.stepName).sort(), [
      's0',
      's1',
      's2',
      's3',
      's4',
      's5',
    ])
  })
})

describe('KyselyWorkflowService — run state writes', () => {
  test('concurrent updateRunState calls for different keys do not clobber each other', async () => {
    const runId = await seedRun('wf2')

    await Promise.all([
      service.updateRunState(runId, 'alpha', 1),
      service.updateRunState(runId, 'beta', 2),
      service.updateRunState(runId, 'gamma', 3),
    ])

    assert.deepEqual(
      await service.getRunState(runId),
      { alpha: 1, beta: 2, gamma: 3 },
      'a concurrent read-modify-write over the whole state blob lost a key'
    )
  })

  test('updateRunState costs a single statement', async () => {
    const runId = await seedRun('wf3')
    queries.length = 0
    await service.updateRunState(runId, 'alpha', 1)
    assert.ok(
      queries.length <= 1,
      `updateRunState issued ${queries.length} statements:\n${queries.join('\n')}`
    )
  })

  test('updateRunState still replaces an existing key', async () => {
    const runId = await seedRun('wf4')
    await service.updateRunState(runId, 'alpha', 1)
    await service.updateRunState(runId, 'alpha', { nested: true })
    assert.deepEqual(await service.getRunState(runId), {
      alpha: { nested: true },
    })
  })

  test('values keep their JSON type instead of becoming strings', async () => {
    const runId = await seedRun('wf5')

    await service.updateRunState(runId, 'empty', [])
    await service.updateRunState(runId, 'zero', 0)
    await service.updateRunState(runId, 'no', false)
    await service.updateRunState(runId, 'nothing', null)
    await service.updateRunState(runId, 'deep', { a: [1, { b: true }] })

    assert.deepEqual(await service.getRunState(runId), {
      empty: [],
      zero: 0,
      no: false,
      nothing: null,
      deep: { a: [1, { b: true }] },
    })
  })

  test('a key containing a dot stays one key', async () => {
    const runId = await seedRun('wf6')

    await service.updateRunState(runId, 'a.b', 'flat')

    assert.deepEqual(
      await service.getRunState(runId),
      { 'a.b': 'flat' },
      'the key was read as a nested path instead of a literal name'
    )
  })

  test('a key containing a quote does not break the statement', async () => {
    const runId = await seedRun('wf7')

    await service.updateRunState(runId, 'it\'s "quoted"', 1)

    assert.deepEqual(await service.getRunState(runId), { 'it\'s "quoted"': 1 })
  })
})

/**
 * A step whose `current_attempt` is NULL addresses no history row, so the
 * history half of a transition silently writes nothing while the step half
 * commits — the divergence the transaction exists to prevent.
 */
describe('KyselyWorkflowService — a transition that addresses no history row', () => {
  const orphanStep = async () => {
    const runId = await seedRun('wf-orphan')
    const step = await service.insertStepState(runId, 's1', 'rpc.fn', { x: 1 })
    await sql`UPDATE workflow_step SET current_attempt = NULL WHERE workflow_step_id = ${step.stepId}`.execute(
      db
    )
    return { runId, step }
  }

  test('the history still records the outcome', async () => {
    const { runId, step } = await orphanStep()

    await service.setStepResult(step.stepId, { ok: true })

    const history = await service.getRunHistory(runId)
    assert.equal(
      history.at(-1)?.status,
      'succeeded',
      'the step row says succeeded but no history row does'
    )
    assert.deepEqual(history.at(-1)?.result, { ok: true })
  })

  test('the step is repaired, so the next transition lands in place', async () => {
    const { runId, step } = await orphanStep()

    await service.setStepRunning(step.stepId)
    await service.setStepResult(step.stepId, { ok: true })

    const history = await service.getRunHistory(runId)
    assert.equal(
      history.length,
      1,
      'each transition appended a row instead of updating the one already there'
    )
    assert.equal(history[0]!.status, 'succeeded')
  })
})

