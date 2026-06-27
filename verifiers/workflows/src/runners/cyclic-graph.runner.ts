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
import { rpcService } from '@pikku/core/rpc'

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
  singletonServices: any
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

    const singletonServices = await createSingletonServices(config, {
      queueService: pgBossFactory.getQueueService(),
      schedulerService: pgBossFactory.getSchedulerService(),
      workflowService,
    })

    return {
      workflowService,
      singletonServices,
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

  const singletonServices = await createSingletonServices(config, {
    queueService: bullFactory.getQueueService(),
    schedulerService: bullFactory.getSchedulerService(),
    workflowService,
  })

  const queueWorkers = bullFactory.getQueueWorkers()
  return {
    workflowService,
    singletonServices,
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

type HistoryStep = {
  stepName: string
  status: string
  result?: any
  attemptCount: number
  fromStepName?: string
}

// The full, transport-independent node state a `graphCyclicRetry { attempts: 3 }`
// run must produce: every node present, succeeded, with the exact result and the
// exact predecessor it was reached from. Inline and queued runs must match this
// to the letter — that is the whole point of the equivalence test below.
const EXPECTED_NODES: Record<
  string,
  { from: string | undefined; result: any }
> = {
  begin: { from: undefined, result: { attempts: 3 } },
  attempt: { from: 'begin', result: { count: 1, target: 3 } },
  'attempt#1': { from: 'attempt', result: { count: 2, target: 3 } },
  'attempt#2': { from: 'attempt#1', result: { count: 3, target: 3 } },
  finish: { from: 'attempt#2', result: { ok: true, loops: 3 } },
}

// Normalize a run's history into a sorted, comparable shape (drops per-run noise
// like stepId/runId/timestamps, keeps the node-correctness fields).
function normalizeNodes(steps: HistoryStep[]) {
  return steps
    .map((s) => ({
      stepName: s.stepName,
      status: s.status,
      from: s.fromStepName ?? undefined,
      result: s.result,
    }))
    .sort((a, b) => a.stepName.localeCompare(b.stepName))
}

// Assert EVERY node is correct — not just the path: presence, no extras, status,
// single attempt (no retries in this graph), result payload, and provenance.
function assertAllNodesCorrect(steps: HistoryStep[]): void {
  const byName = new Map(steps.map((s) => [s.stepName, s]))
  const expectedNames = Object.keys(EXPECTED_NODES).sort()
  const actualNames = steps.map((s) => s.stepName).sort()
  assert(
    JSON.stringify(actualNames) === JSON.stringify(expectedNames),
    `node set mismatch — expected ${JSON.stringify(expectedNames)}, got ${JSON.stringify(actualNames)}`
  )

  for (const [name, expected] of Object.entries(EXPECTED_NODES)) {
    const node = byName.get(name)!
    assert(
      node.status === 'succeeded',
      `node '${name}' status — expected succeeded, got ${node.status}`
    )
    assert(
      node.attemptCount === 1,
      `node '${name}' attemptCount — expected 1, got ${node.attemptCount}`
    )
    assert(
      (node.fromStepName ?? undefined) === expected.from,
      `node '${name}' fromStepName — expected ${expected.from}, got ${node.fromStepName}`
    )
    assert(
      JSON.stringify(node.result) === JSON.stringify(expected.result),
      `node '${name}' result — expected ${JSON.stringify(expected.result)}, got ${JSON.stringify(node.result)}`
    )
  }

  // The provenance chain reconstructs the exact walked path, cycle included.
  const from = new Map(steps.map((s) => [s.stepName, s.fromStepName ?? undefined]))
  const path: string[] = []
  let cursor: string | undefined = 'finish'
  while (cursor) {
    path.unshift(cursor)
    cursor = from.get(cursor)
  }
  assert(
    JSON.stringify(path) ===
      JSON.stringify(['begin', 'attempt', 'attempt#1', 'attempt#2', 'finish']),
    `reconstructed path mismatch, got ${JSON.stringify(path)}`
  )
}

async function main(): Promise<void> {
  const backend = parseBackend()
  console.log(`=== Cyclic Graph Runner (${backend}) ===\n`)

  const { workflowService, singletonServices, registerQueues, cleanup } =
    await setup(backend)
  await registerQueues()

  // Inline graph execution runs the nodes in-process, so it needs a real RPC
  // service (the queued path rebuilds one inside each worker).
  const rpc = rpcService.getContextRPCService(singletonServices, {})

  const results: Array<{ name: string; ok: boolean; error?: string }> = []

  // Start QUEUED (default): step execution happens in the queue workers; poll.
  async function runQueued(
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

  // Start INLINE: the whole graph runs straight-through in-process (no queue),
  // so startWorkflow returns only once the run has reached a terminal state.
  async function runInline(
    name: string,
    input: unknown
  ): Promise<{ status: string; runId: string }> {
    const { runId } = await workflowService.startWorkflow(
      name,
      input,
      { type: 'test' },
      rpc,
      { inline: true }
    )
    const run = await workflowService.getRun(runId)
    return { status: run?.status ?? 'unknown', runId }
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

  let queuedNodes: ReturnType<typeof normalizeNodes> | null = null

  await test(
    'QUEUED cyclic graph: every node is correct (status, result, provenance)',
    async () => {
      const { status, runId } = await runQueued('graphCyclicRetry', {
        attempts: 3,
      })
      assert(status === 'completed', `expected completed, got ${status}`)
      const steps = (await workflowService.getRunHistory(runId)) as HistoryStep[]
      assertAllNodesCorrect(steps)
      queuedNodes = normalizeNodes(steps)
    }
  )

  await test(
    'INLINE cyclic graph: every node is correct (proves inline supports cycles)',
    async () => {
      const { status, runId } = await runInline('graphCyclicRetry', {
        attempts: 3,
      })
      assert(status === 'completed', `expected completed, got ${status}`)
      const steps = (await workflowService.getRunHistory(runId)) as HistoryStep[]
      assertAllNodesCorrect(steps)
    }
  )

  await test(
    'INLINE and QUEUED produce byte-identical node state (transport independence)',
    async () => {
      assert(queuedNodes !== null, 'queued run did not record node state')
      const { status, runId } = await runInline('graphCyclicRetry', {
        attempts: 3,
      })
      assert(status === 'completed', `expected completed, got ${status}`)
      const steps = (await workflowService.getRunHistory(runId)) as HistoryStep[]
      const inlineNodes = normalizeNodes(steps)
      assert(
        JSON.stringify(inlineNodes) === JSON.stringify(queuedNodes),
        `inline vs queued node state diverged\n  inline: ${JSON.stringify(inlineNodes)}\n  queued: ${JSON.stringify(queuedNodes)}`
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
