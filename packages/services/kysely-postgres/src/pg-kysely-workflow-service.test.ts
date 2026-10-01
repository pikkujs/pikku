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
import {
  applyPikkuSchemas,
  KyselyLeaseService,
  leaseSchema,
  workflowSchema,
} from '@pikku/kysely'
import { pikkuState } from '@pikku/core/state'
import { RPCNotFoundError } from '@pikku/core/rpc'
import { defineServiceTests } from '@pikku/core/testing'
import { InMemoryLeaseService } from '@pikku/core/services'
import type { WorkflowServiceOptions } from '@pikku/core/workflow'

import { PgKyselyWorkflowService } from './pg-kysely-workflow-service.js'
import { pgNowMs } from './pg-now-ms.js'

/**
 * Kysely over an in-process Postgres.
 *
 * The Postgres workflow service had no coverage at all — its SQL only ever ran
 * against a real server, so a dialect mistake surfaced in production rather
 * than in CI. PGlite is genuine Postgres compiled to WASM, so `jsonb`,
 * advisory leases, transactional DDL and the real error codes all behave as
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
  service = new PgKyselyWorkflowService(db, {
    wireQueues: false,
    leaseService: new InMemoryLeaseService(),
  } as WorkflowServiceOptions)
  await service.init()
})

afterEach(async () => {
  await Promise.all(open.map((it) => it.destroy()))
})

const seedRun = (name = 'wf') =>
  service.createRun(name, { foo: 1 }, false, 'hash1', {
    type: 'internal',
  } as any)

const seedStep = async (stepOptions?: { retries?: number }) => {
  const runId = await seedRun()
  const step = await service.insertStepState(
    runId,
    'step-1',
    'rpc.fn',
    { x: 1 },
    stepOptions
  )
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
    const again = new PgKyselyWorkflowService(db, {
      wireQueues: false,
      leaseService: new InMemoryLeaseService(),
    } as WorkflowServiceOptions)
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

describe('run and step leases', () => {
  const withLeases = async () => {
    await applyPikkuSchemas(db, [leaseSchema])
    const leases = new KyselyLeaseService(db)
    await leases.init()
    pikkuState(null, 'package', 'singletonServices', {
      leaseService: leases,
    } as any)
    return leases
  }

  afterEach(() => {
    pikkuState(null, 'package', 'singletonServices', {} as any)
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

  test('without a leaseService the run lease passes through', async () => {
    pikkuState(null, 'package', 'singletonServices', {} as any)
    assert.equal(await service.withRunLease('run-1', async () => 42), 42)
  })

  test('a second orchestration of a held run is refused', async () => {
    await withLeases()
    const { run, bodyEntered, release } = heldBody()

    const held = service.withRunLease('run-1', run)
    await bodyEntered
    await assert.rejects(
      service.withRunLease('run-1', async () => {}),
      (err: Error) => err.name === 'LeaseTakenError'
    )

    release()
    await held
    assert.equal(
      await service.withRunLease('run-1', async () => 'next'),
      'next'
    )
  })

  test('a run lease holds no connection or transaction while the body runs', async () => {
    await withLeases()
    const { run, bodyEntered, release } = heldBody()

    executedSql.length = 0
    const held = service.withRunLease('run-1', run)
    await bodyEntered

    const rows = await sql<{ one: number }>`select 1 as one`.execute(db)
    assert.equal(rows.rows[0]!.one, 1, 'the run lease pinned the connection')
    assert.deepEqual(
      executedSql.filter((statement) => statement === 'begin'),
      [],
      'the run lease opened a transaction around the workflow body'
    )

    release()
    await held
  })

  test('a step lock returns its callback value', async () => {
    const result = await service.withStepLock('run-1', 'step-1', async () => 42)
    assert.equal(result, 42)
  })
})

describe('a step lease on Postgres', () => {
  const claim = (runId: string, leaseMs = 60_000) =>
    (service as any).claimStepForExecution(runId, 'step-1', 'rpc.fn', leaseMs)

  /**
   * The worker died: nothing is left to push its lease forward. Written on the
   * database's clock, which is the one the engine judges leases by.
   */
  const lapseTheLease = () =>
    db
      .updateTable('workflowStep')
      .set({ leaseExpiresAt: sql<number>`${pgNowMs()} - 60000` })
      .execute()

  test('a live lease turns away a second dispatch', async () => {
    const { runId } = await seedStep()

    const first = await claim(runId)
    const second = await claim(runId)

    assert.ok(first)
    assert.equal(second, null)
  })

  test('a lapsed lease hands the step to the next dispatch', async () => {
    const { runId } = await seedStep()

    await claim(runId)
    await lapseTheLease()
    const second = await claim(runId)

    assert.ok(second, 'the abandoned step is claimable again')
    assert.equal(second.attemptCount, 2, 're-claiming it counts as an attempt')
  })

  test('only the first dispatch to reach a lapsed lease gets the step', async () => {
    const { runId } = await seedStep()

    await claim(runId)
    await lapseTheLease()
    await claim(runId)
    const third = await claim(runId)

    assert.equal(third, null, 'the re-claim took the lease with it')
  })

  // A worker that stalled rather than died wakes up after its step was claimed
  // again. Neither its renewals nor its outcome may land on the newer attempt.
  test('a superseded attempt can neither renew the lease nor record an outcome', async () => {
    const { runId } = await seedStep()

    const stale = await claim(runId)
    await lapseTheLease()
    const current = await claim(runId)
    const leaseOf = async () =>
      (await service.getStepState(runId, 'step-1')).leaseExpiresAt?.getTime()
    const held = await leaseOf()

    assert.equal(
      await service.refreshStepLease(
        stale.stepId,
        10 * 60_000,
        stale.attemptCount
      ),
      false,
      'the stale attempt was told it still holds the step'
    )
    assert.equal(await leaseOf(), held, 'the stale renewal changed nothing')

    await assert.rejects(
      service.setStepResult(stale.stepId, 'stale', stale.attemptCount),
      (e: Error) => e.name === 'WorkflowStepSupersededError'
    )
    await service.setStepResult(current.stepId, 'fresh', current.attemptCount)
    const step = await service.getStepState(runId, 'step-1')
    assert.equal(step.status, 'succeeded')
    assert.equal(step.result, 'fresh')
  })

  test('a superseded attempt that finds its RPC missing neither fails the step nor suspends the run', async () => {
    pikkuState(null, 'package', 'singletonServices', {
      logger: { error() {}, info() {}, warn() {}, debug() {} },
    } as any)
    const { runId } = await seedStep()
    let current: { attemptCount: number } | undefined
    const staleWorker = {
      rpcWithWire: async () => {
        await lapseTheLease()
        current = await claim(runId)
        throw new RPCNotFoundError('rpc.fn')
      },
    }

    try {
      const outcome = await service
        .executeWorkflowStep(runId, 'step-1', 'rpc.fn', {}, staleWorker as any)
        .catch((e: Error) => e)

      const step = await service.getStepState(runId, 'step-1')
      assert.equal(step.status, 'running', 'the stale attempt failed the step')
      assert.equal(step.attemptCount, current!.attemptCount)
      assert.notEqual(
        (await service.getRun(runId))?.status,
        'suspended',
        'the stale attempt suspended the run'
      )
      assert.equal(outcome, undefined, 'a superseded dispatch ends quietly')
    } finally {
      pikkuState(null, 'package', 'singletonServices', {} as any)
    }
  })

  test('a step that failed on its last attempt is not claimed again', async () => {
    const { runId } = await seedStep({ retries: 0 })

    const held = await claim(runId)
    await service.setStepError(
      held.stepId,
      new Error('boom'),
      held.attemptCount
    )

    assert.equal(
      await claim(runId),
      null,
      'a redelivered message bought the step an attempt past its limit'
    )
  })

  // The dispatch read a lapsed lease, but the worker renewed it before the
  // dispatch got round to failing the step for running out of attempts.
  test('a lease renewed after it was read is not failed as exhausted', async () => {
    const { runId } = await seedStep({ retries: 0 })
    await claim(runId)

    const read = service.getStepState.bind(service)
    ;(service as any).getStepState = async (id: string, name: string) => ({
      ...(await read(id, name)),
      leaseExpiresAt: new Date(Date.now() - 60_000),
    })
    try {
      assert.equal(await claim(runId), null)
    } finally {
      delete (service as any).getStepState
    }

    const step = await service.getStepState(runId, 'step-1')
    assert.equal(step.status, 'running', 'a live worker had its step failed')
  })

  test('a run wedged on a lapsed lease is found as stalled', async () => {
    const { runId } = await seedStep()
    // Far enough ahead that the run and its step both read as idle, leaving
    // what is in flight as the only thing the sweep is deciding on.
    const longSinceIdle = new Date(Date.now() + 24 * 60 * 60_000)

    await claim(runId)
    const held = await (service as any).findStalledRunIds(longSinceIdle, 10)
    await lapseTheLease()
    const lapsed = await (service as any).findStalledRunIds(longSinceIdle, 10)

    assert.deepEqual(held, [], 'a step under a live lease is still in flight')
    assert.deepEqual(lapsed, [runId], 'a step with no worker on it is not')
  })
})

defineServiceTests({
  name: 'PGlite',
  services: {
    workflowCompensationQueued: async () => {
      const compensated = createDb()
      await applyPikkuSchemas(compensated, [workflowSchema])
      const service = new PgKyselyWorkflowService(compensated, {
        wireQueues: false,
        leaseService: new InMemoryLeaseService(),
      } as WorkflowServiceOptions)
      await service.init()
      return service
    },
    workflowFencing: async () => {
      const fenced = createDb()
      await applyPikkuSchemas(fenced, [workflowSchema])
      const service = new PgKyselyWorkflowService(fenced, {
        wireQueues: false,
        leaseService: new InMemoryLeaseService(),
      } as WorkflowServiceOptions)
      await service.init()
      return {
        service,
        lapseLease: async (runId, stepName) => {
          await fenced
            .updateTable('workflowStep')
            .set({ leaseExpiresAt: sql<number>`${pgNowMs()} - 60000` })
            .where('workflowRunId', '=', runId)
            .where('stepName', '=', stepName)
            .execute()
        },
      }
    },
  },
})
