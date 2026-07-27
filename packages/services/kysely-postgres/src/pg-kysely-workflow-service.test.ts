import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from 'kysely'
import { PGlite } from '@electric-sql/pglite'
import type { KyselyPikkuDB } from '@pikku/kysely'

import { PgKyselyWorkflowService } from './pg-kysely-workflow-service.js'

/**
 * Kysely over an in-process Postgres.
 *
 * The Postgres workflow service had no coverage at all — its SQL only ever ran
 * against a real server, so a dialect mistake surfaced in production rather
 * than in CI. PGlite is genuine Postgres compiled to WASM, so `jsonb`,
 * advisory locks, transactional DDL and the real error codes all behave as
 * they do on a server, with no Docker to install.
 *
 * PGlite is a single session, so connections are handed out one at a time.
 * That is what makes `BEGIN`/`COMMIT` from Kysely's transaction API safe here:
 * without the queue two overlapping transactions would interleave onto the one
 * underlying session and corrupt each other.
 */
class PGliteDriver implements Driver {
  #connection: DatabaseConnection
  #queue: Promise<void> = Promise.resolve()

  constructor(private readonly pglite: PGlite) {
    this.#connection = {
      executeQuery: async <R>(compiled: {
        sql: string
        parameters: readonly unknown[]
      }): Promise<QueryResult<R>> => {
        const result = await this.pglite.query<R>(compiled.sql, [
          ...compiled.parameters,
        ])
        return {
          rows: result.rows,
          numAffectedRows: BigInt(result.affectedRows ?? 0),
        }
      },
      async *streamQuery() {
        throw new Error('streaming is not supported by the PGlite test driver')
      },
    }
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const mine = this.#queue.then(() => this.#connection)
    this.#queue = this.#queue.then(() => held)
    const connection = await mine
    releases.set(connection, [...(releases.get(connection) ?? []), release])
    return connection
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery({ sql: 'begin', parameters: [] } as any)
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery({ sql: 'commit', parameters: [] } as any)
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery({ sql: 'rollback', parameters: [] } as any)
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    releases.get(connection)?.shift()?.()
  }

  async destroy(): Promise<void> {
    await this.pglite.close()
  }
}

const releases = new Map<DatabaseConnection, Array<() => void>>()

class PGliteDialect implements Dialect {
  constructor(private readonly pglite: PGlite) {}
  createAdapter() {
    return new PostgresAdapter()
  }
  createDriver() {
    return new PGliteDriver(this.pglite)
  }
  createIntrospector(db: Kysely<any>) {
    return new PostgresIntrospector(db)
  }
  createQueryCompiler() {
    return new PostgresQueryCompiler()
  }
}

let db: Kysely<KyselyPikkuDB>
let service: PgKyselyWorkflowService
let open: Kysely<KyselyPikkuDB>[] = []

const createDb = () => {
  const created = new Kysely<KyselyPikkuDB>({
    dialect: new PGliteDialect(new PGlite()),
    // `CamelCasePlugin` alone, matching `PikkuKysely` — the SQLite-style
    // `SerializePlugin` is deliberately absent on Postgres, which takes JSON
    // and booleans natively.
    plugins: [new CamelCasePlugin()],
  })
  open.push(created)
  return created
}

beforeEach(async () => {
  open = []
  db = createDb()
  service = new PgKyselyWorkflowService(db, { wireQueues: false } as any)
  await service.init()
})

afterEach(async () => {
  await Promise.all(open.map((it) => it.destroy()))
})

const seedRun = (name = 'wf') =>
  service.createRun(name, { foo: 1 }, false, 'hash1', {
    type: 'internal',
  } as any)

const seedStep = async () => {
  const runId = await seedRun()
  const step = await service.insertStepState(runId, 'step-1', 'rpc.fn', {
    x: 1,
  })
  return { runId, step }
}

describe('the schema Postgres actually gets', () => {
  test('init creates every workflow table', async () => {
    const { rows } = await sql<{ tablename: string }>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `.execute(db)
    const tables = rows.map((r) => r.tablename).sort()

    assert.deepEqual(tables, [
      'workflow_runs',
      'workflow_step',
      'workflow_step_history',
      'workflow_versions',
    ])
  })

  test('init creates the indexes the engine reads by', async () => {
    const { rows } = await sql<{ indexname: string }>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `.execute(db)
    const indexes = rows.map((r) => r.indexname)

    for (const expected of [
      'idx_workflow_step_history_step',
      'idx_workflow_step_run_status',
      'idx_workflow_runs_status_created',
      'idx_workflow_runs_workflow_created',
      'idx_workflow_versions_source_status',
    ]) {
      assert.ok(
        indexes.includes(expected),
        `${expected} is missing, so its query is a sequential scan on Postgres`
      )
    }
  })

  test('init is idempotent, so a second boot does not throw', async () => {
    const again = new PgKyselyWorkflowService(db, { wireQueues: false } as any)
    await again.init()
  })
})

describe('run state on jsonb', () => {
  test('a key survives the text/jsonb round trip', async () => {
    const runId = await seedRun()

    await service.updateRunState(runId, 'alpha', 1)

    assert.deepEqual(await service.getRunState(runId), { alpha: 1 })
  })

  test('separate keys merge rather than replace', async () => {
    const runId = await seedRun()

    await service.updateRunState(runId, 'alpha', 1)
    await service.updateRunState(runId, 'beta', 2)
    await service.updateRunState(runId, 'gamma', 3)

    assert.deepEqual(await service.getRunState(runId), {
      alpha: 1,
      beta: 2,
      gamma: 3,
    })
  })

  test('a key is replaced, not merged into, on rewrite', async () => {
    const runId = await seedRun()

    await service.updateRunState(runId, 'alpha', { a: 1 })
    await service.updateRunState(runId, 'alpha', { b: 2 })

    assert.deepEqual(await service.getRunState(runId), { alpha: { b: 2 } })
  })

  test('values keep their JSON type instead of becoming strings', async () => {
    const runId = await seedRun()

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
    const runId = await seedRun()

    await service.updateRunState(runId, 'a.b', 'flat')

    assert.deepEqual(
      await service.getRunState(runId),
      { 'a.b': 'flat' },
      'the key was read as a nested path instead of a literal name'
    )
  })

  test('a key containing a quote does not break the statement', async () => {
    const runId = await seedRun()

    await service.updateRunState(runId, 'it\'s "quoted"', 1)

    assert.deepEqual(await service.getRunState(runId), { 'it\'s "quoted"': 1 })
  })
})

describe('a step transition on Postgres', () => {
  test('running, then succeeded, reaches both the step and its history', async () => {
    const { runId, step } = await seedStep()

    await service.setStepRunning(step.stepId)
    await service.setStepResult(step.stepId, { ok: true })

    const state = await service.getStepState(runId, 'step-1')
    assert.equal(state.status, 'succeeded')
    assert.deepEqual(state.result, { ok: true })

    const [attempt] = await service.getRunHistory(runId)
    assert.equal(attempt!.status, 'succeeded')
    assert.deepEqual(attempt!.result, { ok: true })
  })

  test('a failure carries the error to both rows', async () => {
    const { runId, step } = await seedStep()

    await service.setStepRunning(step.stepId)
    await service.setStepError(step.stepId, new Error('exploded'))

    const state = await service.getStepState(runId, 'step-1')
    assert.equal(state.status, 'failed')
    assert.equal(state.error?.message, 'exploded')

    const [attempt] = await service.getRunHistory(runId)
    assert.equal(attempt!.status, 'failed')
    assert.equal(attempt!.error?.message, 'exploded')
  })

  test('a retry writes the new attempt and leaves the failed one intact', async () => {
    const { runId, step } = await seedStep()

    await service.setStepRunning(step.stepId)
    await service.setStepError(step.stepId, new Error('first go'))
    await service.createRetryAttempt(step.stepId, 'pending')
    await service.setStepRunning(step.stepId)
    await service.setStepResult(step.stepId, 'second go')

    const history = await service.getRunHistory(runId)
    assert.equal(history.length, 2)
    assert.equal(history[0]!.status, 'failed')
    assert.equal(history[0]!.error?.message, 'first go')
    assert.equal(history[1]!.status, 'succeeded')
    assert.equal(history[1]!.result, 'second go')

    const state = await service.getStepState(runId, 'step-1')
    assert.equal(state.attemptCount, 2)
    assert.equal(state.error, undefined)
  })

  test('two attempts in the same millisecond still resolve the newer row', async () => {
    const { runId, step } = await seedStep()

    await service.setStepError(step.stepId, new Error('first go'))
    await service.createRetryAttempt(step.stepId, 'pending')
    await service.setStepResult(step.stepId, 'second go')

    const history = await service.getRunHistory(runId)
    assert.equal(history[0]!.status, 'failed')
    assert.equal(
      history[1]!.status,
      'succeeded',
      'the transition landed on the wrong attempt'
    )
  })
})

describe('advisory locks', () => {
  test('a run lock serialises its critical section', async () => {
    const order: string[] = []
    const hold = async (tag: string, ms: number) => {
      await service.withRunLock('run-1', async () => {
        order.push(`${tag}:in`)
        await new Promise((r) => setTimeout(r, ms))
        order.push(`${tag}:out`)
      })
    }

    await Promise.all([hold('a', 20), hold('b', 0)])

    assert.deepEqual(order, ['a:in', 'a:out', 'b:in', 'b:out'])
  })

  test('a step lock returns its callback value', async () => {
    const result = await service.withStepLock('run-1', 'step-1', async () => 42)
    assert.equal(result, 42)
  })
})
