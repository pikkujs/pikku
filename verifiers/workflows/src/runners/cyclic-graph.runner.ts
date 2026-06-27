/**
 * Cyclic Graph Runner
 *
 * Drives a graph whose node loops back to itself (`attempt --again--> attempt`)
 * through a REAL queue + workflow storage, then asserts the engine's revisit +
 * provenance invariants:
 *
 *   1. revisit instances — a self-cycling node runs once per pass as a fresh
 *      ordinal instance (attempt, attempt#1, attempt#2 …), NOT a single step.
 *   2. provenance        — each step records the predecessor it was reached from
 *      (fromStepName); entry steps have none.
 *   3. path reconstruction — walking the fromStepName chain back from the
 *      terminal node reproduces the exact walked path, cycle included.
 *
 * Usage:
 *   yarn test:cyclic-graph:pg      # pg-boss + Postgres (KyselyWorkflowService)
 *   yarn test:cyclic-graph:redis   # bullmq + Redis (RedisWorkflowService)
 */

import type { PikkuWorkflowService } from '@pikku/core/workflow'

import { createConfig, createSingletonServices } from '../services.js'

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

async function main(): Promise<void> {
  const backend = parseBackend()
  console.log(`=== Cyclic Graph Runner (${backend}) ===\n`)

  const { workflowService, registerQueues, cleanup } = await setup(backend)
  await registerQueues()

  const results: Array<{ name: string; ok: boolean; error?: string }> = []

  async function runToTerminal(
    name: string,
    input: unknown
  ): Promise<{ status: string; runId: string }> {
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
        return { status: run.status, runId }
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

  await test(
    'cyclic node revisits as ordinal instances and the fromStepName chain reconstructs the path',
    async () => {
      const { status, runId } = await runToTerminal('graphCyclicRetry', {
        attempts: 3,
      })
      assert(status === 'completed', `expected completed, got ${status}`)

      const steps = await workflowService.getRunHistory(runId)
      const from = new Map(
        steps.map((s: any) => [s.stepName, s.fromStepName ?? undefined])
      )

      // The self-cycle produced three ordinal instances of `attempt`.
      const stepNames = steps.map((s: any) => s.stepName).sort()
      assert(
        stepNames.includes('attempt') &&
          stepNames.includes('attempt#1') &&
          stepNames.includes('attempt#2'),
        `expected attempt/attempt#1/attempt#2, got ${JSON.stringify(stepNames)}`
      )

      // Each step records its predecessor; the entry has none.
      assert(
        from.get('begin') === undefined,
        `entry step must have no predecessor, got ${from.get('begin')}`
      )

      // Walk back from the terminal node — the cycle is fully reconstructable.
      const path: string[] = []
      let cursor: string | undefined = 'finish'
      while (cursor) {
        path.unshift(cursor)
        cursor = from.get(cursor)
      }
      assert(
        JSON.stringify(path) ===
          JSON.stringify([
            'begin',
            'attempt',
            'attempt#1',
            'attempt#2',
            'finish',
          ]),
        `reconstructed path mismatch, got ${JSON.stringify(path)}`
      )
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
