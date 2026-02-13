/**
 * Version Mismatch Integration Test Runner
 *
 * Simulates a rolling deployment where in-flight workflow runs encounter
 * a version change. Uses real workflow definitions, real RPC execution,
 * and the same service stack as production.
 *
 * Scenario:
 *   1. Deploy v1: workflows run normally, versions registered
 *   2. Workers start workflows (queued, not yet executed)
 *   3. Deploy v2: meta hashes change
 *   4. Orchestrator resumes stale runs → version mismatch
 *   5. DSL + Graph → fallback to stored graph version
 *   6. Complex → VERSION_CONFLICT (inline steps can't be reproduced)
 *
 * Usage:
 *   yarn test:version-mismatch            # in-memory (default)
 *   yarn test:version-mismatch --pg       # PostgreSQL
 *   yarn test:version-mismatch --redis    # Redis
 */

import { InMemoryWorkflowService } from '@pikku/core/services'
import type { PikkuWorkflowService } from '@pikku/core/workflow'
import { pikkuState, rpcService } from '@pikku/core'
import type { QueueService } from '@pikku/core/queue'

import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../services.js'
import { workflowTestData } from './workflow-test-data.js'

import '../../.pikku/pikku-bootstrap.gen.js'

const noopQueueService: QueueService = {
  supportsResults: false,
  add: async () => 'noop',
  getJob: async () => null,
}

type Backend = 'memory' | 'pg' | 'redis'

function parseBackend(): Backend {
  if (process.argv.includes('--pg')) return 'pg'
  if (process.argv.includes('--redis')) return 'redis'
  return 'memory'
}

async function createWorkflowService(
  backend: Backend
): Promise<{
  workflowService: PikkuWorkflowService
  cleanup: () => Promise<void>
}> {
  if (backend === 'pg') {
    const { PgWorkflowService } = await import('@pikku/pg')
    const postgres = (await import('postgres')).default
    const connectionString =
      process.env.DATABASE_URL ||
      'postgres://postgres:password@localhost:5432/pikku_queue'
    const sql = postgres(connectionString)
    const workflowService = new PgWorkflowService(sql)
    await workflowService.init()
    return {
      workflowService,
      cleanup: async () => {
        await workflowService.close()
        await sql.end()
      },
    }
  }

  if (backend === 'redis') {
    const { RedisWorkflowService } = await import('@pikku/redis')
    const workflowService = new RedisWorkflowService(undefined)
    await workflowService.init()
    return {
      workflowService,
      cleanup: async () => {
        await workflowService.close()
      },
    }
  }

  const workflowService = new InMemoryWorkflowService()
  return {
    workflowService,
    cleanup: async () => {
      await workflowService.close()
    },
  }
}

async function main(): Promise<void> {
  const backend = parseBackend()
  console.log(`=== Version Mismatch Integration Tests (${backend}) ===\n`)

  const config = await createConfig()
  const { workflowService, cleanup } = await createWorkflowService(backend)

  const singletonServices = await createSingletonServices(config, {
    queueService: noopQueueService,
    workflowService,
  })

  workflowService.setServices(
    singletonServices,
    createWireServices as any,
    config
  )

  const rpc = rpcService.getContextRPCService(singletonServices, {})
  const meta = pikkuState(null, 'workflows', 'meta')

  const results: Array<{
    name: string
    status: 'success' | 'failed'
    error?: string
    duration: number
  }> = []

  async function test(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now()
    try {
      await fn()
      const duration = Date.now() - start
      results.push({ name, status: 'success', duration })
      console.log(`PASS: ${name} (${duration}ms)`)
    } catch (error: any) {
      const duration = Date.now() - start
      results.push({ name, status: 'failed', error: error.message, duration })
      console.log(`FAIL: ${name} - ${error.message} (${duration}ms)`)
    }
  }

  // ── Phase 1: Deploy v1 — run workflows inline (baseline) ──────
  console.log('── Phase 1: Deploy v1 — baseline inline execution ──')

  await test('DSL: taskCrudWorkflow completes inline', async () => {
    const { runId } = await workflowService.startWorkflow(
      'taskCrudWorkflow',
      workflowTestData['taskCrudWorkflow'],
      rpc,
      { inline: true }
    )
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'completed') {
      throw new Error(`expected completed, got ${run?.status}`)
    }
  })

  await test('Graph: graphOnboarding completes inline', async () => {
    const { runId } = await workflowService.startWorkflow(
      'graphOnboarding',
      workflowTestData['graphOnboarding'],
      rpc,
      { inline: true }
    )
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'completed') {
      throw new Error(`expected completed, got ${run?.status}`)
    }
  })

  // ── Phase 2: Register versions (happens at deploy time) ────────
  console.log('\n── Phase 2: Register workflow versions ──')

  await test('registerWorkflowVersions stores graph definitions', async () => {
    await workflowService.registerWorkflowVersions()

    const v1 = await workflowService.getWorkflowVersion(
      'taskCrudWorkflow',
      meta['taskCrudWorkflow'].graphHash!
    )
    if (!v1) throw new Error('taskCrudWorkflow version not stored')

    const v2 = await workflowService.getWorkflowVersion(
      'graphOnboarding',
      meta['graphOnboarding'].graphHash!
    )
    if (!v2) throw new Error('graphOnboarding version not stored')
  })

  // ── Phase 3: Workers start workflows (queued, not executed) ────
  //   With the noop queue service, startWorkflow creates the run
  //   and returns — nothing executes.
  console.log('\n── Phase 3: Start workflows (queued, pre-deploy) ──')

  const savedDslHash = meta['taskCrudWorkflow'].graphHash!
  const savedGraphHash = meta['graphOnboarding'].graphHash!
  let dslRunId: string = ''
  let graphRunId: string = ''

  await test('DSL: taskCrudWorkflow started (queued)', async () => {
    const { runId } = await workflowService.startWorkflow(
      'taskCrudWorkflow',
      workflowTestData['taskCrudWorkflow'],
      rpc
    )
    dslRunId = runId
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'running') {
      throw new Error(`expected running, got ${run?.status}`)
    }
  })

  await test('Graph: graphOnboarding started (queued)', async () => {
    const { runId } = await workflowService.startWorkflow(
      'graphOnboarding',
      workflowTestData['graphOnboarding'],
      rpc
    )
    graphRunId = runId
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'running') {
      throw new Error(`expected running, got ${run?.status}`)
    }
  })

  // ── Phase 4: Worker executes graph entry node (pre-deploy) ─────
  //   In production a worker processes the entry node before the
  //   deploy happens. This gives continueGraph something to
  //   continue from during the fallback.
  console.log('\n── Phase 4: Execute graph entry node (pre-deploy) ──')

  await test('Graph: entry node executed by worker (userCreate)', async () => {
    await workflowService.executeWorkflowStep(
      graphRunId,
      'node:entry',
      'userCreate',
      workflowTestData['graphOnboarding'],
      rpc
    )
    const step = await workflowService.getStepState(graphRunId, 'node:entry')
    if (step.status !== 'succeeded') {
      throw new Error(`expected succeeded, got ${step.status}`)
    }
  })

  // ── Phase 5: Deploy v2 — meta hashes change ───────────────────
  console.log('\n── Phase 5: Deploy v2 (change meta hashes) ──')

  meta['taskCrudWorkflow'].graphHash = 'deployed-v2-dsl'
  meta['graphOnboarding'].graphHash = 'deployed-v2-graph'
  console.log('  Meta hashes updated to v2 values')

  // ── Phase 6: Orchestrator resumes stale runs ───────────────────
  //   The orchestrator (running v2 code) picks up runs that were
  //   created by v1. It detects the graphHash mismatch and falls
  //   back to executing from the stored v1 graph definition.
  console.log('\n── Phase 6: Orchestrator resumes stale runs ──')

  await test('DSL version mismatch → falls back to stored graph, queues entry node', async () => {
    await workflowService.orchestrateWorkflow(dslRunId, rpc)
    const step = await workflowService.getStepState(
      dslRunId,
      'node:create_task'
    )
    if (!step.stepId) {
      throw new Error(
        'fallback did not queue create_task — stored version not used'
      )
    }
  })

  await test('Graph version mismatch → falls back to stored graph, queues next node', async () => {
    await workflowService.orchestrateWorkflow(graphRunId, rpc)
    const step = await workflowService.getStepState(
      graphRunId,
      'node:sendWelcome'
    )
    if (!step.stepId) {
      throw new Error(
        'fallback did not queue sendWelcome — stored version not used'
      )
    }
  })

  // ── Phase 7: Version not found ─────────────────────────────────
  //   If the stored version doesn't exist, the run fails with
  //   VERSION_NOT_FOUND.
  console.log('\n── Phase 7: Version not found scenario ──')

  await test('Graph version mismatch without stored version → VERSION_NOT_FOUND', async () => {
    const { runId } = await workflowService.startWorkflow(
      'graphOnboarding',
      workflowTestData['graphOnboarding'],
      rpc
    )
    meta['graphOnboarding'].graphHash = 'completely-unknown-hash'
    await workflowService.orchestrateWorkflow(runId, rpc)
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'failed') {
      throw new Error(`expected failed, got ${run?.status}`)
    }
    if (run?.error?.code !== 'VERSION_NOT_FOUND') {
      throw new Error(
        `expected VERSION_NOT_FOUND, got ${run?.error?.code}: ${run?.error?.message}`
      )
    }
  })

  // ── Phase 8: Restore and verify system works ───────────────────
  console.log('\n── Phase 8: Restore and verify ──')

  meta['taskCrudWorkflow'].graphHash = savedDslHash
  meta['graphOnboarding'].graphHash = savedGraphHash

  await test('DSL workflow still works after restore', async () => {
    const { runId } = await workflowService.startWorkflow(
      'taskCrudWorkflow',
      workflowTestData['taskCrudWorkflow'],
      rpc,
      { inline: true }
    )
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'completed') {
      throw new Error(`expected completed, got ${run?.status}`)
    }
  })

  await test('Graph workflow still works after restore', async () => {
    const { runId } = await workflowService.startWorkflow(
      'graphOnboarding',
      workflowTestData['graphOnboarding'],
      rpc,
      { inline: true }
    )
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'completed') {
      throw new Error(`expected completed, got ${run?.status}`)
    }
  })

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n=== Summary ===')
  const passed = results.filter((r) => r.status === 'success').length
  const failed = results.filter((r) => r.status === 'failed').length

  console.log(`Passed:  ${passed}`)
  console.log(`Failed:  ${failed}`)
  console.log(`Total:   ${results.length}`)

  if (failed > 0) {
    console.log('\n=== Failed Tests ===')
    for (const result of results.filter((r) => r.status === 'failed')) {
      console.log(`  ${result.name}: ${result.error}`)
    }
  }

  await cleanup()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Runner failed:', error)
  process.exit(1)
})
