/**
 * Retry + Idempotency UNHAPPY-PATH Runner
 *
 * Drives purpose-built failing workflows through a REAL queue (pg-boss or
 * bullmq) and real workflow storage, then asserts the retry/idempotency
 * invariants the engine promises — actively trying to break them:
 *
 *   1. idempotent dedupe  — step crashes twice then succeeds; the invocationId
 *      is identical across all 3 attempts (stepId is not), and an
 *      invocationId-keyed side effect runs exactly ONCE.
 *   2. retries: 0         — an always-failing step runs EXACTLY once (the queue
 *      must never sneak in its own default retries) and the workflow fails.
 *   3. default exhaust    — a step with NO retries option runs exactly
 *      DEFAULT_STEP_RETRIES + 1 times then the workflow fails (proves the
 *      default is honored and engine + queue agree on the count).
 *   4. default recover    — a step with NO retries option recovers within the
 *      default budget and the workflow completes.
 *
 * Usage:
 *   yarn test:retry-idempotency:pg      # pg-boss + Postgres (KyselyWorkflowService)
 *   yarn test:retry-idempotency:redis   # bullmq + Redis (RedisWorkflowService)
 */

import { DEFAULT_STEP_RETRIES } from '@pikku/core/workflow'
import type { PikkuWorkflowService } from '@pikku/core/workflow'

import { createConfig, createSingletonServices } from '../services.js'
import { tracker, type StepExecution } from './retry-idempotency-tracker.js'

import '../../.pikku/pikku-bootstrap.gen.js'

type Backend = 'pg' | 'redis'

const TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 100

function parseBackend(): Backend {
  if (process.argv.includes('--redis')) return 'redis'
  if (process.argv.includes('--pg')) return 'pg'
  throw new Error('Specify a backend: --pg or --redis')
}

async function setup(backend: Backend): Promise<{
  workflowService: PikkuWorkflowService
  registerQueues: () => Promise<unknown>
  cleanup: () => Promise<void>
}> {
  const config = await createConfig()

  if (backend === 'pg') {
    const { KyselyWorkflowService } = await import('@pikku/kysely')
    const { PgBossServiceFactory } = await import('@pikku/queue-pg-boss')
    const { Kysely, CamelCasePlugin } = await import('kysely')
    const { PostgresJSDialect } = await import('kysely-postgres-js')
    const postgres = (await import('postgres')).default
    const connectionString =
      process.env.DATABASE_URL ||
      'postgres://postgres:password@localhost:5432/pikku_queue'

    const pgBossFactory = new PgBossServiceFactory(connectionString)
    await pgBossFactory.init()
    const sql = postgres(connectionString)
    // KyselyWorkflowService creates snake_case tables but queries in camelCase —
    // it requires the CamelCasePlugin to bridge the two.
    const db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sql }),
      plugins: [new CamelCasePlugin()],
    })
    const workflowService = new KyselyWorkflowService(db)
    await workflowService.init()

    await createSingletonServices(config, {
      queueService: pgBossFactory.getQueueService(),
      schedulerService: pgBossFactory.getSchedulerService(),
      workflowService,
    })

    return {
      workflowService,
      registerQueues: () => pgBossFactory.getQueueWorkers().registerQueues(),
      cleanup: async () => {
        await workflowService.close()
        await pgBossFactory.close()
        await sql.end()
      },
    }
  }

  const { RedisWorkflowService } = await import('@pikku/redis')
  const { BullServiceFactory } = await import('@pikku/queue-bullmq')

  const bullFactory = new BullServiceFactory()
  await bullFactory.init()
  const workflowService = new RedisWorkflowService(undefined)
  await workflowService.init()

  await createSingletonServices(config, {
    queueService: bullFactory.getQueueService(),
    schedulerService: bullFactory.getSchedulerService(),
    workflowService,
  })

  const queueWorkers = bullFactory.getQueueWorkers()
  return {
    workflowService,
    registerQueues: () => queueWorkers.registerQueues(),
    cleanup: async () => {
      await queueWorkers.close()
      await workflowService.close()
      await bullFactory.close()
    },
  }
}

class AssertionFailed extends Error {}
function assert(condition: boolean, message: string): void {
  if (!condition) throw new AssertionFailed(message)
}

const attemptCounts = (execs: StepExecution[]) =>
  execs.map((e) => e.attemptCount)
const allSameInvocationId = (execs: StepExecution[]) =>
  execs.length > 0 && execs.every((e) => e.invocationId === execs[0]!.invocationId)

async function main(): Promise<void> {
  const backend = parseBackend()
  console.log(`=== Retry + Idempotency Unhappy-Path Runner (${backend}) ===\n`)

  const { workflowService, registerQueues, cleanup } = await setup(backend)
  await registerQueues()

  const results: Array<{ name: string; ok: boolean; error?: string }> = []

  async function runToTerminal(
    name: string,
    input: unknown
  ): Promise<'completed' | 'failed' | 'cancelled'> {
    const { runId } = await workflowService.startWorkflow(
      name,
      input,
      { type: 'test' },
      null as any
    )
    const deadline = Date.now() + TIMEOUT_MS
    while (true) {
      const run = await workflowService.getRun(runId)
      if (
        run &&
        (run.status === 'completed' ||
          run.status === 'failed' ||
          run.status === 'cancelled')
      ) {
        return run.status
      }
      if (Date.now() > deadline) {
        throw new AssertionFailed(
          `${name} timed out after ${TIMEOUT_MS}ms (status: ${run?.status})`
        )
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  async function test(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now()
    try {
      await fn()
      results.push({ name, ok: true })
      console.log(`PASS: ${name} (${Date.now() - start}ms)`)
    } catch (error: any) {
      results.push({ name, ok: false, error: error.message })
      console.log(`FAIL: ${name} — ${error.message} (${Date.now() - start}ms)`)
    }
  }

  // 1) Idempotent dedupe across retries
  await test(
    'idempotent dedupe: same invocationId across retries, side effect once',
    async () => {
      const key = 'dedupe'
      tracker.reset(key)
      const status = await runToTerminal('idempotentDedupeWorkflow', {
        trackerKey: key,
        failTimes: 2,
      })
      const execs = tracker.executions(key)
      assert(status === 'completed', `expected completed, got ${status}`)
      assert(execs.length === 3, `expected 3 executions, got ${execs.length}`)
      assert(
        allSameInvocationId(execs),
        `invocationId must be stable across retries, got ${JSON.stringify(execs.map((e) => e.invocationId))}`
      )
      assert(
        JSON.stringify(attemptCounts(execs)) === JSON.stringify([1, 2, 3]),
        `expected attemptCounts [1,2,3], got ${JSON.stringify(attemptCounts(execs))}`
      )
      // The payoff: a side effect keyed on the stable invocationId runs exactly
      // once even though the step body executed 3 times. (stepId is deliberately
      // NOT asserted here — whether it changes per attempt is store-specific;
      // invocationId is the cross-store dedupe key, which is the whole point.)
      assert(
        tracker.sideEffectCount(key) === 1,
        `idempotent side effect must run once, ran ${tracker.sideEffectCount(key)} times`
      )
    }
  )

  // 2) retries: 0 is honored — exactly one execution, workflow fails
  await test(
    'retries:0 honored: step runs exactly once and workflow fails',
    async () => {
      const key = 'noretry'
      tracker.reset(key)
      const status = await runToTerminal('noRetryWorkflow', { trackerKey: key })
      const execs = tracker.executions(key)
      assert(status === 'failed', `expected failed, got ${status}`)
      assert(
        execs.length === 1,
        `retries:0 must run exactly once, ran ${execs.length} times`
      )
      assert(
        execs[0]!.attemptCount === 1,
        `expected attemptCount 1, got ${execs[0]?.attemptCount}`
      )
    }
  )

  // 3) Default retries exhausted — exactly DEFAULT_STEP_RETRIES + 1 executions
  await test(
    `default retries: exhausts at DEFAULT_STEP_RETRIES+1 (${DEFAULT_STEP_RETRIES + 1}) then fails`,
    async () => {
      const key = 'exhaust'
      tracker.reset(key)
      const status = await runToTerminal('defaultRetryExhaustWorkflow', {
        trackerKey: key,
      })
      const execs = tracker.executions(key)
      assert(status === 'failed', `expected failed, got ${status}`)
      assert(
        execs.length === DEFAULT_STEP_RETRIES + 1,
        `expected ${DEFAULT_STEP_RETRIES + 1} executions, got ${execs.length}`
      )
      assert(
        allSameInvocationId(execs),
        `invocationId must be stable across all attempts`
      )
      const expected = Array.from(
        { length: DEFAULT_STEP_RETRIES + 1 },
        (_, i) => i + 1
      )
      assert(
        JSON.stringify(attemptCounts(execs)) === JSON.stringify(expected),
        `expected attemptCounts ${JSON.stringify(expected)}, got ${JSON.stringify(attemptCounts(execs))}`
      )
    }
  )

  // 4) Default retries recover — completes within the default budget
  await test(
    'default retries: recovers within the default budget and completes',
    async () => {
      const key = 'recover'
      tracker.reset(key)
      const status = await runToTerminal('defaultRetryRecoverWorkflow', {
        trackerKey: key,
        failTimes: 2,
      })
      const execs = tracker.executions(key)
      assert(status === 'completed', `expected completed, got ${status}`)
      assert(execs.length === 3, `expected 3 executions, got ${execs.length}`)
      assert(allSameInvocationId(execs), `invocationId must be stable`)
    }
  )

  console.log('\n=== Summary ===')
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log(`Passed: ${passed}/${results.length}`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ${r.name}: ${r.error}`)
    }
  }

  await cleanup()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Runner failed:', error)
  process.exit(1)
})
