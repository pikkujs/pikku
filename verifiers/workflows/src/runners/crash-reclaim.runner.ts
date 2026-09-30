/**
 * Crash-reclaim runner: a worker SIGKILLed mid-step does not wedge its run.
 *
 * Every worker is a child process (`crash-reclaim-worker.ts`) and every crash a
 * real SIGKILL, taken while `crashProneStep` hangs after recording its start.
 * Nothing in the dead worker gets to write anything: the step is left
 * `running`, under a lease that simply stops being renewed.
 *
 * What brings the step back is the stalled-run sweep, and nothing else. pg-boss
 * keeps the killed job `active` until its own expiry (900s by default, and not
 * derived from `lockDuration`), so queue redelivery is out of reach of this
 * runner — and of any run that cannot wait a quarter of an hour. The sweep here
 * stands in for the app's scheduled task calling `recoverStalledRuns`; each
 * pass is made on a fresh service instance so the per-instance redispatch
 * backoff never hides a run from the next one.
 *
 *   1. A DSL step killed on attempt 1 is re-run as attempt 2 by a new worker,
 *      and the run completes with that attempt's result.
 *   2. A step that loses its worker on every attempt fails with
 *      `WorkflowStepLeaseExpiredError` once they are spent, and the run fails.
 *   3. (1) for a `pikkuWorkflowGraph` node.
 *   4. The sweep leaves a run alone while its step's lease is live, nothing
 *      re-dispatches the step once the lease lapses until the sweep runs, and
 *      the sweep then picks the run up.
 *
 * Usage:
 *   yarn test:crash-reclaim:pg   # pg-boss + PgKyselyWorkflowService + PgKyselyLeaseService
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PikkuWorkflowService } from '@pikku/core/workflow'

import { createSingletonServices } from '../services.js'
import { createConfig, connectionString } from '../config.js'
import { readStepStarts } from './crash-reclaim-markers.js'

import '../../.pikku/pikku-bootstrap.gen.js'

const STEP_LEASE_MS = 3_000
const LEASE_MARGIN_MS = 500
const QUIET_WINDOW_MS = 5_000
const STEP_TIMEOUT_MS = 30_000
const RUN_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 100

const markerDir = mkdtempSync(
  join(process.env.CRASH_MARKER_BASE ?? tmpdir(), 'pikku-crash-reclaim-')
)
process.env.CRASH_MARKER_DIR = markerDir

const workerPath = fileURLToPath(
  new URL('./crash-reclaim-worker.ts', import.meta.url)
)

let failures = 0
const check = (ok: boolean, message: string, detail?: unknown): void => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${message}`)
  if (!ok && detail !== undefined) {
    console.log(`      got: ${JSON.stringify(detail)}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const waitFor = async <T>(
  read: () => Promise<T | undefined> | T | undefined,
  timeoutMs: number,
  what: string
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined) return value
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`)
}

type Worker = { pid: number; kill: () => Promise<void> }
const workers: ChildProcess[] = []

const spawnWorker = async (label: string): Promise<Worker> => {
  const child = spawn(process.execPath, [...process.execArgv, workerPath], {
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      CRASH_STEP_LEASE_MS: String(STEP_LEASE_MS),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  workers.push(child)
  const exited = new Promise<void>((resolve) =>
    child.once('exit', () => resolve())
  )
  let output = ''
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout!.on('data', (chunk) => {
      output += chunk
      if (output.includes('worker ready')) resolve()
    })
    child.stderr!.on('data', (chunk) => (output += chunk))
    child.once('exit', (code) =>
      reject(
        new Error(`worker ${label} exited (${code}) before ready:\n${output}`)
      )
    )
  })
  if (process.env.CRASH_VERBOSE) {
    child.stdout!.on('data', (c) => process.stdout.write(`[${label}] ${c}`))
    child.stderr!.on('data', (c) => process.stderr.write(`[${label}] ${c}`))
  }
  await ready
  return {
    pid: child.pid!,
    kill: async () => {
      child.kill('SIGKILL')
      await exited
    },
  }
}

type Harness = {
  workflowService: PikkuWorkflowService & {
    getStepState(runId: string, stepName: string): Promise<any>
    getRunHistory(runId: string): Promise<any[]>
  }
  sweep: () => Promise<string[]>
  cleanup: () => Promise<void>
}

async function setup(): Promise<Harness> {
  const config = await createConfig()
  const { PgKyselyWorkflowService, PgKyselyLeaseService } =
    await import('@pikku/kysely-postgres')
  const { PgBossServiceFactory } = await import('@pikku/queue-pg-boss')
  const { Kysely, CamelCasePlugin } = await import('kysely')
  const { PostgresJSDialect } = await import('kysely-postgres-js')
  const postgres = (await import('postgres')).default

  const pgBossFactory = new PgBossServiceFactory(connectionString)
  await pgBossFactory.init()
  const sql = postgres(connectionString)
  const db = new Kysely<any>({
    dialect: new PostgresJSDialect({ postgres: sql }),
    plugins: [new CamelCasePlugin()],
  })
  const workflowService = new PgKyselyWorkflowService(db)
  await workflowService.init()
  const leaseService = new PgKyselyLeaseService(db)
  await leaseService.init()

  await createSingletonServices(config, {
    queueService: pgBossFactory.getQueueService(),
    schedulerService: pgBossFactory.getSchedulerService(),
    workflowService,
    leaseService,
  })

  return {
    workflowService: workflowService as Harness['workflowService'],
    sweep: async () => {
      const sweeper = new PgKyselyWorkflowService(db)
      const { resumed } = await sweeper.recoverStalledRuns({
        stalledAfterMs: 0,
      })
      return resumed
    },
    cleanup: async () => {
      await workflowService.close()
      await pgBossFactory.close()
      await sql.end()
    },
  }
}

const startAttempt = (runId: string, attempt: number) =>
  waitFor(
    () => readStepStarts(markerDir, runId).find((s) => s.attempt === attempt),
    STEP_TIMEOUT_MS,
    `attempt ${attempt} of run ${runId} to start`
  )

const stepNameOf = async (h: Harness, runId: string): Promise<string> =>
  waitFor(
    async () => (await h.workflowService.getRunHistory(runId))[0]?.stepName,
    STEP_TIMEOUT_MS,
    `run ${runId} to have a step`
  )

const leaseLapsed = async (h: Harness, runId: string): Promise<void> => {
  const stepName = await stepNameOf(h, runId)
  const { leaseExpiresAt } = await h.workflowService.getStepState(
    runId,
    stepName
  )
  if (!leaseExpiresAt) throw new Error(`step ${stepName} holds no lease`)
  await sleep(
    Math.max(0, leaseExpiresAt.getTime() - Date.now()) + LEASE_MARGIN_MS
  )
}

const runEnd = (h: Harness, runId: string) =>
  waitFor(
    async () => {
      const run = await h.workflowService.getRun(runId)
      return run && run.status !== 'running' ? run : undefined
    },
    RUN_TIMEOUT_MS,
    `run ${runId} to end`
  ).catch(async () => h.workflowService.getRun(runId))

const attemptsOf = async (h: Harness, runId: string) =>
  (await h.workflowService.getRunHistory(runId)).map((row) => ({
    attempt: row.attemptCount,
    status: row.status,
  }))

const start = (h: Harness, workflow: string, crashes: number) =>
  h.workflowService
    .startWorkflow(workflow, { crashes }, { type: 'test' }, null as any)
    .then(({ runId }) => runId)

/** Kill the worker on attempt 1, let its lease lapse, and sweep into a new one. */
async function reclaimAfterOneCrash(
  h: Harness,
  label: string,
  workflow: string
): Promise<void> {
  console.log(`\n--- ${label} ---`)
  const first = await spawnWorker('w1')
  const runId = await start(h, workflow, 1)
  const killed = await startAttempt(runId, 1)
  check(
    killed.pid === first.pid,
    `attempt 1 started on the first worker`,
    killed
  )
  await first.kill()
  await leaseLapsed(h, runId)

  const second = await spawnWorker('w2')
  const resumed = await h.sweep()
  check(
    resumed.includes(runId),
    `the sweep picked up the run once its lease lapsed`,
    resumed
  )

  const run = await runEnd(h, runId)
  const stepName = await stepNameOf(h, runId)
  const step = await h.workflowService.getStepState(runId, stepName)
  check(run?.status === 'completed', `the run completed`, run?.status)
  check(
    step.result?.attempt === 2 && step.result?.pid === second.pid,
    `the step's result is attempt 2's, from the second worker (pid ${second.pid})`,
    step.result
  )
  const attempts = await attemptsOf(h, runId)
  check(
    attempts.length === 2 &&
      attempts[0]!.status === 'running' &&
      attempts[1]!.status === 'succeeded',
    `the step history keeps the killed attempt: attempt 1 running, attempt 2 succeeded`,
    attempts
  )
  await second.kill()
}

async function failsOnceAttemptsAreSpent(h: Harness): Promise<void> {
  console.log(`\n--- 2. a step that kills its worker every time ---`)
  const runId = await start(h, 'crashReclaimWorkflow', 2)
  for (const attempt of [1, 2]) {
    const worker = await spawnWorker(`w${attempt}`)
    if (attempt > 1) await h.sweep()
    const started = await startAttempt(runId, attempt)
    check(
      started.pid === worker.pid,
      `attempt ${attempt} started on worker ${attempt}, then was killed`,
      started
    )
    await worker.kill()
    await leaseLapsed(h, runId)
  }

  const last = await spawnWorker('w3')
  const resumed = await h.sweep()
  check(
    resumed.includes(runId),
    `the sweep picked up the run after attempt 2 died`,
    resumed
  )
  const run = await runEnd(h, runId)
  const stepName = await stepNameOf(h, runId)
  const step = await h.workflowService.getStepState(runId, stepName)
  check(
    run?.status === 'failed',
    `the run failed rather than staying running`,
    run?.status
  )
  check(
    step.status === 'failed' &&
      /lost its worker/.test(step.error?.message ?? ''),
    `the step failed with WorkflowStepLeaseExpiredError`,
    { status: step.status, error: step.error }
  )
  const starts = readStepStarts(markerDir, runId)
  check(
    starts.length === 2,
    `no third attempt ran (retries: 1 allows two)`,
    starts
  )
  await last.kill()
}

async function sweepJudgesTheLease(h: Harness): Promise<void> {
  console.log(`\n--- 4. the stalled-run sweep ---`)
  const first = await spawnWorker('w1')
  const runId = await start(h, 'crashReclaimWorkflow', 1)
  await startAttempt(runId, 1)
  await first.kill()

  const second = await spawnWorker('w2')
  const early = await h.sweep()
  check(
    !early.includes(runId),
    `a step under a live lease keeps its run out of the sweep`,
    early
  )

  await leaseLapsed(h, runId)
  await sleep(QUIET_WINDOW_MS)
  const starts = readStepStarts(markerDir, runId)
  const idle = await h.workflowService.getRun(runId)
  check(
    starts.length === 1 && idle?.status === 'running',
    `nothing re-dispatched the step in the ${QUIET_WINDOW_MS}ms after its lease lapsed; pg-boss still holds the killed job`,
    { starts, status: idle?.status }
  )

  const late = await h.sweep()
  check(
    late.includes(runId),
    `the sweep picks the run up once the lease has lapsed`,
    late
  )
  const run = await runEnd(h, runId)
  check(run?.status === 'completed', `and the run then completes`, run?.status)
  await second.kill()
}

async function main(): Promise<void> {
  console.log('=== Crash Reclaim Runner (pg) ===')
  const h = await setup()
  const scenarios: Array<[string, () => Promise<void>]> = [
    [
      '1',
      () =>
        reclaimAfterOneCrash(
          h,
          '1. a worker killed mid-step (DSL)',
          'crashReclaimWorkflow'
        ),
    ],
    ['2', () => failsOnceAttemptsAreSpent(h)],
    [
      '3',
      () =>
        reclaimAfterOneCrash(
          h,
          '3. a worker killed mid-node (graph)',
          'crashReclaimGraph'
        ),
    ],
    ['4', () => sweepJudgesTheLease(h)],
  ]
  const only = process.argv.slice(2).filter((a) => /^\d$/.test(a))
  for (const [id, scenario] of scenarios) {
    if (only.length && !only.includes(id)) continue
    try {
      await scenario()
    } catch (error: any) {
      check(false, `scenario ${id} could not finish: ${error.message}`)
    }
    for (const child of workers) child.kill('SIGKILL')
  }

  await h.cleanup()
  rmSync(markerDir, { recursive: true, force: true })
  console.log(`\n${failures === 0 ? 'All passed' : `${failures} failed`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('Runner failed:', error)
  for (const child of workers) child.kill('SIGKILL')
  process.exit(1)
})
