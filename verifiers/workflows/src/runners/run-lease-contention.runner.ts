/**
 * Run lease contention runner: many wake-ups for one run, one pass at a time.
 *
 * Every run here fans out to parallel steps that all finish at the same
 * instant (`run-lease-contention.functions.ts`, and its graph twin), so the
 * orchestration messages their completions enqueue arrive together and race
 * for the same run lease — within one worker, and in the second phase across
 * two worker processes consuming the same queues.
 *
 * Correctness is measured from the outside. The app's `LeaseService` is wrapped
 * in `RunLeaseProbe`, which records every `workflow-run:*` holder and every
 * refused acquire; the workflow service records every orchestration pass
 * whether or not it took the lease. Each phase then asserts:
 *
 *   - no run ever had two passes (or two lease holders) at once, across processes
 *   - every pass ran under the lease
 *   - some acquires were refused, so the lease was actually contended
 *   - every run completed within the bound, with every step's result present
 *
 * Usage:
 *   yarn test:run-lease-contention:pg            # pg-boss + PgKyselyWorkflowService + PgKyselyLeaseService
 *   yarn test:run-lease-contention:bullmq        # BullMQ + PgKyselyWorkflowService + PgKyselyLeaseService
 *   yarn test:run-lease-contention:bullmq-mysql  # BullMQ + MySQLKyselyWorkflowService + MySQLKyselyLeaseService
 *   yarn test:run-lease-contention:memory        # InMemoryQueueService + PgKyselyWorkflowService + InMemoryLeaseService
 *
 * Postgres from `DATABASE_URL` (migrated by `pikku db migrate`), Redis from
 * `REDIS_URL`, MySQL from `MYSQL_URL` — its tables are created here because
 * pikku ships no MySQL migrations.
 */

import { fork, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { LeaseService } from '@pikku/core/services'
import {
  InMemoryLeaseService,
  InMemoryQueueService,
  LogLevel,
} from '@pikku/core/services'
import type { PikkuWorkflowService } from '@pikku/core/workflow'
import { pikkuState } from '@pikku/core/state'
import { CamelCasePlugin, Kysely, MysqlDialect, sql } from 'kysely'

import { createSingletonServices } from '../services.js'
import { createConfig, connectionString } from '../config.js'
import {
  RunLeaseProbe,
  maxOverlap,
  recordingPasses,
  type Interval,
} from './run-lease-contention-probe.js'

import '../../.pikku/pikku-bootstrap.gen.js'

type Backend = 'pgboss' | 'bullmq' | 'bullmq-mysql' | 'memory'

const DSL_RUNS = 20
const GRAPH_RUNS = 5
const WIDTH = 10
const RUN_BOUND_MS = 90_000
const POLL_INTERVAL_MS = 250
/** Long enough for every step of every run to be dispatched and waiting. */
const RELEASE_AFTER_MS = 4_000

const OWN_QUEUES = [
  'wf-orchestrator-run-lease-contention-workflow',
  'wf-orchestrator-graph-run-lease-contention',
  'wf-step-contention-step',
  // The graph's unqueued nodes still reach a worker through the shared queues.
  'pikku-workflow-orchestrator',
  'pikku-workflow-step-worker',
]

const argValue = (name: string) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const backend = (argValue('--backend') ?? 'pgboss') as Backend
const isWorker = process.argv.includes('--worker')

const redisConnection = () => {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379')
  return { host: url.hostname, port: Number(url.port || 6379) }
}
const mysqlUrl =
  process.env.MYSQL_URL ?? 'mysql://root:password@localhost:3306/pikku_leases'

const MYSQL_TABLES = [
  `create table if not exists workflow_runs (workflow_run_id varchar(64) primary key, workflow varchar(255) not null, status varchar(32) not null, input longtext not null, output longtext, error longtext, state longtext, inline boolean default false, graph_hash varchar(255), \`deterministic\` boolean default false, planned_steps longtext, wire longtext, created_at timestamp(3) default current_timestamp(3) not null, updated_at timestamp(3) default current_timestamp(3) not null)`,
  `create table if not exists workflow_step (workflow_step_id varchar(64) primary key, workflow_run_id varchar(64) not null, step_name varchar(255) not null, rpc_name varchar(255), data longtext, status varchar(32) default 'pending' not null, result longtext, error longtext, child_run_id varchar(64), branch_taken varchar(255), retries integer, retry_delay varchar(64), from_step_name varchar(255), current_attempt integer, lease_expires_at bigint, created_at timestamp(3) default current_timestamp(3) not null, updated_at timestamp(3) default current_timestamp(3) not null, unique key workflow_step_run_name_unique (workflow_run_id, step_name), foreign key (workflow_run_id) references workflow_runs (workflow_run_id) on delete cascade)`,
  `create table if not exists workflow_step_history (history_id varchar(64) primary key, workflow_step_id varchar(64) not null, status varchar(32) not null, result longtext, error longtext, attempt integer, created_at timestamp(3) default current_timestamp(3) not null, running_at timestamp(3) null, scheduled_at timestamp(3) null, succeeded_at timestamp(3) null, failed_at timestamp(3) null, foreign key (workflow_step_id) references workflow_step (workflow_step_id) on delete cascade)`,
  `create table if not exists workflow_versions (workflow_name varchar(255) not null, graph_hash varchar(255) not null, graph longtext not null, source varchar(32) not null, status varchar(32) default 'active' not null, created_at timestamp(3) default current_timestamp(3) not null, primary key (workflow_name, graph_hash))`,
  `create table if not exists pikku_lease (\`key\` varchar(255) primary key, holder text not null, token integer not null, expires_at bigint not null)`,
]

type Recording = PikkuWorkflowService & {
  init(): Promise<void>
  passes: { intervals: Interval[]; maxInside: number }
}

type Harness = {
  workflowService: Recording
  probe: RunLeaseProbe
  registerQueues: () => Promise<unknown>
  close: () => Promise<void>
}

async function setup(): Promise<Harness> {
  const config = await createConfig()
  const closers: Array<() => Promise<unknown>> = []

  let workflowService: Recording
  let leaseService: LeaseService
  let probe: RunLeaseProbe
  if (backend === 'bullmq-mysql') {
    const { MySQLKyselyWorkflowService, MySQLKyselyLeaseService } =
      await import('@pikku/kysely-mysql')
    const { createPool } = await import('mysql2')
    const db = new Kysely<any>({
      dialect: new MysqlDialect({
        pool: createPool({ uri: mysqlUrl, connectionLimit: 20 }) as any,
      }),
      plugins: [new CamelCasePlugin()],
    })
    closers.push(() => db.destroy())
    for (const statement of MYSQL_TABLES) {
      await sql.raw(statement).execute(db)
    }
    leaseService = new MySQLKyselyLeaseService(db)
    const Service = recordingPasses(MySQLKyselyWorkflowService)
    probe = new RunLeaseProbe(leaseService)
    workflowService = new (Service as any)(db, { leaseService: probe })
  } else {
    const { PgKyselyWorkflowService, PgKyselyLeaseService } =
      await import('@pikku/kysely-postgres')
    const { PostgresJSDialect } = await import('kysely-postgres-js')
    const postgres = (await import('postgres')).default
    const pg = postgres(connectionString, { max: 20 })
    closers.push(() => pg.end())
    const db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: pg }),
      plugins: [new CamelCasePlugin()],
    })
    leaseService =
      backend === 'memory'
        ? new InMemoryLeaseService()
        : new PgKyselyLeaseService(db)
    const Service = recordingPasses(PgKyselyWorkflowService)
    probe = new RunLeaseProbe(leaseService)
    workflowService = new (Service as any)(db, { leaseService: probe })
  }
  await workflowService.init()
  closers.unshift(() => workflowService.close())

  let queues: Parameters<typeof createSingletonServices>[1]
  let registerQueues: () => Promise<unknown> = async () => {}
  if (backend === 'pgboss') {
    const { PgBossServiceFactory } = await import('@pikku/queue-pg-boss')
    const factory = new PgBossServiceFactory(connectionString)
    await factory.init()
    closers.unshift(() => factory.close())
    queues = {
      queueService: factory.getQueueService(),
      schedulerService: factory.getSchedulerService(),
    }
    registerQueues = () => factory.getQueueWorkers().registerQueues()
  } else if (backend === 'memory') {
    queues = { queueService: new InMemoryQueueService() }
  } else {
    const { BullServiceFactory } = await import('@pikku/queue-bullmq')
    const factory = new BullServiceFactory(redisConnection())
    await factory.init()
    closers.unshift(() => factory.close())
    const { BullQueueService } = await import('@pikku/queue-bullmq')
    class TMPQ extends BullQueueService {
      protected override createQueue(name: string, config?: any) {
        return super.createQueue(name, {
          connection: redisConnection(),
          ...config,
        })
      }
    }
    const tmpq = new TMPQ(redisConnection())
    closers.unshift(async () => {
      for (const q of (tmpq as any).queues.values()) await q.close()
      for (const q of (tmpq as any).queueEvents.values()) await q.close()
    })
    queues = {
      queueService: tmpq,
      schedulerService: factory.getSchedulerService(),
    }
    registerQueues = () => factory.getQueueWorkers().registerQueues()
  }

  const services = await createSingletonServices(config, {
    ...queues,
    workflowService,
    leaseService: probe,
  })
  // Every refused acquire logs a wake-up; thousands of them bury the verdict.
  services.logger.setLevel(LogLevel.warn)

  // This process runs only the workers these workflows need, as a deployment
  // running a subset would, and gives them enough concurrency that a run's
  // wake-ups are handled side by side rather than queued behind each other.
  const registrations = pikkuState(null, 'queue', 'registrations')
  for (const name of [...registrations.keys()]) {
    if (!OWN_QUEUES.includes(name)) registrations.delete(name)
  }
  for (const name of OWN_QUEUES) {
    const worker = registrations.get(name)
    if (!worker) throw new Error(`queue ${name} is not wired; run pikku`)
    worker.config = {
      ...worker.config,
      batchSize: name.includes('step-') ? 64 : 16,
      pollInterval: 1_000,
    }
  }

  return {
    workflowService,
    probe,
    registerQueues,
    close: async () => {
      for (const close of closers) await close()
    },
  }
}

type Report = {
  passes: Interval[]
  holders: Interval[]
  refused: number
  lost: number
}

const report = ({ workflowService, probe }: Harness): Report => ({
  passes: workflowService.passes.intervals,
  holders: probe.holders.intervals,
  refused: probe.refused,
  lost: probe.lost,
})

/** A second worker process: consumes the same queues until told to report. */
async function worker(): Promise<void> {
  const harness = await setup()
  await harness.registerQueues()
  process.send!({ ready: true })
  process.on('message', async () => {
    const r = report(harness)
    await new Promise<void>((resolve) => process.send!(r, () => resolve()))
    await harness.close()
    process.exit(0)
  })
}

const startWorker = async (): Promise<ChildProcess> => {
  const child = fork(fileURLToPath(import.meta.url), [
    '--backend',
    backend,
    '--worker',
  ])
  await new Promise<void>((resolve, reject) => {
    child.once('message', () => resolve())
    child.once('exit', (code) =>
      reject(new Error(`worker exited with ${code} before it was ready`))
    )
  })
  return child
}

const stopWorker = (child: ChildProcess) =>
  new Promise<Report>((resolve, reject) => {
    child.once('message', (r) => resolve(r as Report))
    child.once('exit', (code) =>
      reject(new Error(`worker exited with ${code} before reporting`))
    )
    child.send('report')
  })

type Started = { runId: string; kind: 'dsl' | 'graph' }

async function runBatch(
  workflowService: PikkuWorkflowService
): Promise<{ failures: string[]; failedRuns: number; elapsed: number }> {
  const start = Date.now()
  const releaseAt = start + RELEASE_AFTER_MS
  const indexes = Array.from({ length: WIDTH }, (_, i) => i)
  const started: Started[] = []
  for (let i = 0; i < DSL_RUNS; i++) {
    const { runId } = await workflowService.startWorkflow(
      'runLeaseContentionWorkflow',
      { indexes, releaseAt },
      { type: 'test' },
      null as any
    )
    started.push({ runId, kind: 'dsl' })
  }
  for (let i = 0; i < GRAPH_RUNS; i++) {
    const { runId } = await workflowService.startWorkflow(
      'graphRunLeaseContention',
      { width: WIDTH, releaseAt },
      { type: 'test' },
      null as any
    )
    started.push({ runId, kind: 'graph' })
  }

  const pending = new Set(started.map((s) => s.runId))
  while (pending.size > 0 && Date.now() - start < RUN_BOUND_MS) {
    for (const runId of [...pending]) {
      const status = (await workflowService.getRun(runId))?.status
      if (status === 'completed' || status === 'failed') pending.delete(runId)
    }
    if (pending.size > 0) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  }
  const elapsed = Date.now() - start

  const squares = indexes.map((i) => i * i)
  const failures: string[] = []
  for (const { runId, kind } of started) {
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'completed') {
      failures.push(`${kind} run ${runId} ended ${run?.status}`)
      continue
    }
    if (kind === 'dsl') {
      if (JSON.stringify(run.output?.squares) !== JSON.stringify(squares)) {
        failures.push(`dsl run ${runId} output ${JSON.stringify(run.output)}`)
      }
      for (const i of indexes) {
        const step = await workflowService.getStepState(runId, `square ${i}`)
        if (step.status !== 'succeeded' || step.result?.square !== i * i) {
          failures.push(
            `dsl run ${runId} step ${i} is ${step.status} with ${JSON.stringify(step.result)}`
          )
        }
      }
    } else {
      const steps = await workflowService.getStepInstances(runId)
      const succeeded = steps.filter((s) => s.status === 'succeeded').length
      const { total } = await workflowService.getNodeResults(runId, ['total'])
      const expected = squares.reduce((a, b) => a + b, 0)
      if (
        succeeded !== WIDTH + 2 ||
        total?.count !== WIDTH ||
        total?.sum !== expected
      ) {
        failures.push(
          `graph run ${runId}: ${succeeded}/${WIDTH + 2} steps succeeded, total ${JSON.stringify(total)}`
        )
      }
    }
  }
  const failedRuns = started.filter(({ runId }) =>
    failures.some((f) => f.includes(runId))
  ).length
  return { failures, failedRuns, elapsed }
}

type PhaseResult = { name: string; ok: boolean }

async function phase(
  name: string,
  harness: Harness,
  withSecondWorker: boolean
): Promise<PhaseResult> {
  const before = report(harness)
  const mark = {
    passes: before.passes.length,
    holders: before.holders.length,
    refused: before.refused,
    lost: before.lost,
  }
  const child = withSecondWorker ? await startWorker() : undefined
  const { failures, failedRuns, elapsed } = await runBatch(
    harness.workflowService
  )

  const mine = report(harness)
  const theirs: Report = child
    ? await stopWorker(child)
    : { passes: [], holders: [], refused: 0, lost: 0 }
  const passes = [...mine.passes.slice(mark.passes), ...theirs.passes]
  const holders = [...mine.holders.slice(mark.holders), ...theirs.holders]
  const refused = mine.refused - mark.refused + theirs.refused
  const lost = mine.lost - mark.lost + theirs.lost
  const maxPasses = maxOverlap(passes)
  const maxHolders = maxOverlap(holders)

  const checks: Array<[boolean, string]> = [
    [maxPasses <= 1, `max concurrent passes per run: ${maxPasses}`],
    [maxHolders <= 1, `max concurrent lease holders per run: ${maxHolders}`],
    [
      passes.length === holders.length,
      `passes under the lease: ${holders.length}/${passes.length}`,
    ],
    [refused > 0, `acquires refused (contention): ${refused}, lost: ${lost}`],
    [
      failures.length === 0,
      `runs completed with every step's result: ${DSL_RUNS + GRAPH_RUNS - failedRuns}/${DSL_RUNS + GRAPH_RUNS}`,
    ],
    [elapsed < RUN_BOUND_MS, `elapsed: ${elapsed}ms (bound ${RUN_BOUND_MS}ms)`],
  ]
  if (child) {
    const ownPasses = passes.length - theirs.passes.length
    checks.push([
      ownPasses > 0 && theirs.passes.length > 0,
      `passes by worker: first ${ownPasses}, second ${theirs.passes.length}`,
    ])
  }
  console.log(`\n--- ${name} ---`)
  for (const [ok, line] of checks)
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${line}`)
  for (const failure of failures.slice(0, 10)) console.log(`       ${failure}`)
  return { name, ok: checks.every(([ok]) => ok) }
}

async function main(): Promise<void> {
  console.log(`=== Run Lease Contention Runner (${backend}) ===`)
  const harness = await setup()
  await harness.registerQueues()

  const results = [await phase('one worker', harness, false)]
  if (backend !== 'memory') {
    results.push(await phase('two worker processes', harness, true))
  }

  await harness.close()
  const ok = results.every((r) => r.ok)
  console.log(`\n${ok ? 'PASS' : 'FAIL'}: run lease contention (${backend})`)
  process.exit(ok ? 0 : 1)
}

;(isWorker ? worker() : main()).catch((error) => {
  console.error('Runner failed:', error)
  process.exit(1)
})
