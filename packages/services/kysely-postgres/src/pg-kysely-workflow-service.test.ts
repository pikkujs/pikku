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
import { applyPikkuSchemas, workflowSchema } from '@pikku/kysely'

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
/**
 * How a statement is treated instead of being run: `throw` stands in for a
 * connection that broke mid-statement, `skip` records one PGlite must not
 * actually execute — a single-session database cannot survive terminating its
 * own backend.
 */
type Intercept = (statement: string) => 'throw' | 'skip' | undefined

class PGliteDriver implements Driver {
  #connection: DatabaseConnection
  #queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly pglite: PGlite,
    private readonly intercept?: Intercept
  ) {
    this.#connection = {
      executeQuery: async <R>(compiled: {
        sql: string
        parameters: readonly unknown[]
      }): Promise<QueryResult<R>> => {
        executedSql.push(compiled.sql)
        const intercepted = this.intercept?.(compiled.sql)
        if (intercepted === 'throw') {
          throw new Error(`connection is broken: ${compiled.sql}`)
        }
        if (intercepted === 'skip') {
          return { rows: [], numAffectedRows: BigInt(0) }
        }
        const result = await this.pglite.query<R>(compiled.sql, [
          ...compiled.parameters,
        ])
        return {
          rows: result.rows,
          numAffectedRows: BigInt(result.affectedRows ?? 0),
        }
      },
      streamQuery(): never {
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

/** Every statement the dialect issued, so a test can assert on the shape of a
 *  critical section rather than only on its result. */
const executedSql: string[] = []

class PGliteDialect implements Dialect {
  constructor(
    private readonly pglite: PGlite,
    private readonly intercept?: Intercept
  ) {}
  createAdapter() {
    return new PostgresAdapter()
  }
  createDriver() {
    return new PGliteDriver(this.pglite, this.intercept)
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

const createDb = (intercept?: Intercept) => {
  const created = new Kysely<KyselyPikkuDB>({
    dialect: new PGliteDialect(new PGlite(), intercept),
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
  await applyPikkuSchemas(db, [workflowSchema])
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
  test('the migration creates every workflow table', async () => {
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

  test('the migration creates the indexes the engine reads by', async () => {
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

  test('boot is idempotent, so a second one does not throw', async () => {
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

  const heldBody = () => {
    let release!: () => void
    let entered!: () => void
    const body = new Promise<void>((resolve) => {
      release = resolve
    })
    const bodyEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    return {
      run: () => {
        entered()
        return body
      },
      bodyEntered,
      release,
    }
  }

  /** PGlite's single connection stands in for a saturated pool. */
  test('a run lock on the query pool blocks unrelated queries', async () => {
    let queryFinished = false
    const { run, bodyEntered, release } = heldBody()

    const held = service.withRunLock('run-1', run)
    await bodyEntered

    const query = sql`select 1`.execute(db).then(() => {
      queryFinished = true
    })
    await new Promise((r) => setImmediate(r))
    assert.equal(queryFinished, false)

    release()
    await Promise.all([held, query])
    assert.equal(queryFinished, true)
  })

  /**
   * Each PGlite instance is its own single-session database, so this can only
   * show the query pool staying free, not two workers contending for the lock.
   */
  test('a run lock on lockDb leaves the query pool free', async () => {
    const lockDb = createDb()
    const isolated = new PgKyselyWorkflowService(db, {
      wireQueues: false,
      lockDb,
    } as any)
    await isolated.init()

    const { run, bodyEntered, release } = heldBody()

    const held = isolated.withRunLock('run-1', run)
    await bodyEntered

    const rows = await sql<{
      one: number
    }>`select 1 as one`.execute(db)
    assert.equal(rows.rows[0]!.one, 1)

    release()
    await held
  })

  /**
   * The bug this guards: the run lock used to be `pg_advisory_xact_lock` inside
   * `lockDb.transaction()`, so a workflow body awaiting a build or an LLM left
   * the connection `idle in transaction` for as long as it ran. On a shared
   * pool that starves every other caller, and Postgres cannot vacuum past the
   * pinned xid.
   */
  test('a run lock holds no transaction while the body runs', async () => {
    const { run, bodyEntered, release } = heldBody()

    executedSql.length = 0
    const held = service.withRunLock('run-1', run)
    await bodyEntered

    assert.deepEqual(
      executedSql.filter((statement) => statement === 'begin'),
      [],
      'the run lock opened a transaction around the workflow body'
    )
    assert.ok(
      executedSql.some((statement) => statement.includes('pg_advisory_lock')),
      'the run lock was never taken'
    )

    release()
    await held

    assert.ok(
      executedSql.some((statement) => statement.includes('pg_advisory_unlock')),
      'the run lock was never released'
    )
  })

  test('a lock timeout is reset before the connection goes back', async () => {
    const timed = new PgKyselyWorkflowService(db, {
      wireQueues: false,
      lockTimeoutMs: 250,
    } as any)
    await timed.init()

    executedSql.length = 0
    await timed.withRunLock('run-1', async () => 'done')

    assert.ok(
      executedSql.some((statement) => statement === 'SET lock_timeout = 250'),
      'lock_timeout was never applied'
    )
    assert.ok(
      executedSql.some((statement) => statement === 'RESET lock_timeout'),
      'lock_timeout rode the connection back into the pool'
    )
  })

  /**
   * The leak this guards, seen in production: a workflow body that never
   * settles never reaches the `finally` that unlocks, so the session keeps the
   * advisory lock and the pooled connection for as long as the process lives.
   * Every later message for that run then blocks for the full `lock_timeout`
   * before failing, and a bounded worker pool ends up entirely queued behind
   * runs that will never finish.
   */
  test(
    'takes the lock back from a body that never settles',
    { timeout: 10_000 },
    async () => {
      const bounded = new PgKyselyWorkflowService(db, {
        wireQueues: false,
        maxLockHoldMs: 100,
      } as any)
      await bounded.init()

      executedSql.length = 0
      await assert.rejects(
        bounded.withRunLock('run-1', () => new Promise<never>(() => {})),
        (err: Error) => {
          assert.equal(err.name, 'RunLockHoldTimeoutError')
          return true
        }
      )

      assert.ok(
        executedSql.some((statement) =>
          statement.includes('pg_advisory_unlock')
        ),
        'the abandoned body kept the run lock'
      )
      // The connection matters as much as the lock: PGlite's single session
      // stands in for the pool the leak drains.
      const rows = await sql<{ one: number }>`select 1 as one`.execute(db)
      assert.equal(rows.rows[0]!.one, 1, 'the lock connection never came back')
    }
  )

  test('an unbounded hold is still the default', async () => {
    const { run, bodyEntered, release } = heldBody()

    const held = service.withRunLock('run-1', run)
    await bodyEntered
    await new Promise((r) => setTimeout(r, 150))

    release()
    assert.equal(await held, undefined, 'a slow body was cut short')
  })

  /**
   * `idle_session_timeout` is what reclaims a holder that went away without
   * closing its connection, but on its own it cannot tell that holder from a
   * body legitimately awaiting a twenty-minute build — both leave the session
   * idle. The keepalive is what makes idleness mean something, so the two only
   * ever ship together.
   */
  test('a keepalive keeps a long hold from reading as idle', async () => {
    const kept = new PgKyselyWorkflowService(db, {
      wireQueues: false,
      lockIdleTimeoutMs: 3_000,
    } as any)
    await kept.init()
    const { run, bodyEntered, release } = heldBody()

    executedSql.length = 0
    const held = kept.withRunLock('run-1', run)
    await bodyEntered
    await new Promise((r) => setTimeout(r, 2_200))
    release()
    await held

    assert.ok(
      executedSql.some(
        (statement) => statement === 'SET idle_session_timeout = 3000'
      ),
      'the idle timeout was never applied'
    )
    const beats = executedSql.filter((statement) =>
      statement.includes('pikku run lock heartbeat')
    )
    assert.ok(
      beats.length >= 2,
      `a 2.2s hold under a 3s idle timeout sent ${beats.length} keepalives, so the session read as idle`
    )
    assert.ok(
      executedSql.some(
        (statement) => statement === 'RESET idle_session_timeout'
      ),
      'the idle timeout rode the connection back into the pool'
    )
  })

  /**
   * A session lock outlives the statement that failed to release it, so an
   * unlock that throws hands the next caller a pooled connection that still
   * holds the run lock. Terminating our own backend is the release Postgres
   * always honours.
   */
  test('a failed unlock kills the session rather than pool a held lock', async () => {
    const brittle = createDb((statement) =>
      statement.includes('pg_advisory_unlock')
        ? 'throw'
        : statement.includes('pg_terminate_backend')
          ? 'skip'
          : undefined
    )
    const unlucky = new PgKyselyWorkflowService(db, {
      wireQueues: false,
      lockDb: brittle,
      lockTimeoutMs: 250,
    } as any)
    await unlucky.init()

    executedSql.length = 0
    const result = await unlucky.withRunLock('run-1', async () => 'done')

    assert.equal(
      result,
      'done',
      "the body's outcome was replaced by the unlock's own failure"
    )
    assert.ok(
      executedSql.some((statement) =>
        statement.includes('pg_terminate_backend')
      ),
      'a connection still holding the run lock went back to the pool'
    )
    assert.ok(
      !executedSql.includes('RESET lock_timeout'),
      'a terminated session was issued on anyway'
    )
  })

  test('a non-finite lock timeout is rejected', () => {
    assert.throws(
      () =>
        new PgKyselyWorkflowService(db, {
          wireQueues: false,
          lockTimeoutMs: Number.NaN,
        } as any),
      RangeError
    )
  })
})
