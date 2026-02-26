import { InMemoryWorkflowService } from '@pikku/core/services'
import type { PikkuWorkflowService } from '@pikku/core/workflow'
import { pikkuState } from '@pikku/core/internal'
import { rpcService } from '@pikku/core/rpc'
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

async function createWorkflowService(backend: Backend): Promise<{
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
  console.log(`=== Function Versioning Integration Tests (${backend}) ===\n`)

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
  const functionMeta = pikkuState(null, 'function', 'meta')!
  const rpcMeta = pikkuState(null, 'rpc', 'meta')!
  const workflowsMeta = pikkuState(null, 'workflows', 'meta')!

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

  // ── Phase 1: Meta validation ──────────────────────────────────
  console.log('── Phase 1: Meta validation ──')

  await test('function.meta has processItem@v1', async () => {
    const meta = functionMeta['processItem@v1']
    if (!meta) throw new Error('processItem@v1 not found in function.meta')
    if (meta.version !== 1) {
      throw new Error(`expected version 1, got ${meta.version}`)
    }
  })

  await test('function.meta has processItem@v2', async () => {
    const meta = functionMeta['processItem@v2']
    if (!meta) throw new Error('processItem@v2 not found in function.meta')
    if (meta.version !== 2) {
      throw new Error(`expected version 2, got ${meta.version}`)
    }
  })

  await test('function.meta does not have bare processItem', async () => {
    if (functionMeta['processItem']) {
      throw new Error(
        'bare processItem should have been renamed to processItem@v2'
      )
    }
  })

  await test('rpc.meta maps processItem to processItem@v2', async () => {
    const mapped = rpcMeta['processItem']
    if (mapped !== 'processItem@v2') {
      throw new Error(`expected processItem@v2, got ${mapped}`)
    }
  })

  await test('rpc.meta maps processItem@v1 to processItem@v1', async () => {
    const mapped = rpcMeta['processItem@v1']
    if (mapped !== 'processItem@v1') {
      throw new Error(`expected processItem@v1, got ${mapped}`)
    }
  })

  // ── Phase 2: Workflow graph validation ────────────────────────
  console.log('\n── Phase 2: Workflow graph validation ──')

  await test('versionedItemWorkflow has graphHash', async () => {
    const meta = workflowsMeta['versionedItemWorkflow'] as any
    if (!meta)
      throw new Error('versionedItemWorkflow not found in workflows.meta')
    if (!meta.graphHash) throw new Error('graphHash is missing')
  })

  await test('workflow graph nodes have @v suffixed rpcNames', async () => {
    const meta = workflowsMeta['versionedItemWorkflow'] as any
    const nodes = meta.nodes
    let foundVersioned = false
    for (const node of Object.values(nodes) as any[]) {
      if (node.rpcName) {
        if (!node.rpcName.includes('@v')) {
          throw new Error(
            `rpcName '${node.rpcName}' is missing @v version suffix`
          )
        }
        foundVersioned = true
      }
    }
    if (!foundVersioned) {
      throw new Error('no rpc nodes found in workflow graph')
    }
  })

  await test('workflow graph stamps processItem@v2 (latest)', async () => {
    const meta = workflowsMeta['versionedItemWorkflow'] as any
    const processNode = meta.nodes['process_item']
    if (!processNode) throw new Error('process_item node not found')
    if (processNode.rpcName !== 'processItem@v2') {
      throw new Error(`expected processItem@v2, got ${processNode.rpcName}`)
    }
  })

  // ── Phase 3: Inline execution (latest version) ───────────────
  console.log('\n── Phase 3: Inline execution (latest version) ──')

  await test('versionedItemWorkflow inline produces v2 output', async () => {
    const { runId } = await workflowService.startWorkflow(
      'versionedItemWorkflow',
      workflowTestData['versionedItemWorkflow'],
      { type: 'test' },
      rpc,
      { inline: true }
    )
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'completed') {
      throw new Error(`expected completed, got ${run?.status}`)
    }
    const output = run.output as { result: string; version: number }
    if (output.result !== 'processed-v2') {
      throw new Error(`expected processed-v2, got ${output.result}`)
    }
    if (output.version !== 2) {
      throw new Error(`expected version 2, got ${output.version}`)
    }
  })

  // ── Phase 4: Direct v1 invocation ─────────────────────────────
  console.log('\n── Phase 4: Direct v1 invocation ──')

  await test('rpc.invoke processItem@v1 returns v1 output', async () => {
    const result = await (rpc as any).invoke('processItem@v1', {
      itemId: 'item-456',
    })
    if (result.result !== 'processed-v1') {
      throw new Error(`expected processed-v1, got ${result.result}`)
    }
    if (result.version !== 1) {
      throw new Error(`expected version 1, got ${result.version}`)
    }
  })

  await test('rpc.invoke processItem resolves to v2', async () => {
    const result = await (rpc as any).invoke('processItem', {
      itemId: 'item-789',
    })
    if (result.result !== 'processed-v2') {
      throw new Error(`expected processed-v2, got ${result.result}`)
    }
    if (result.version !== 2) {
      throw new Error(`expected version 2, got ${result.version}`)
    }
  })

  // ── Phase 5: Version mismatch with fallback ───────────────────
  console.log('\n── Phase 5: Version mismatch with fallback ──')

  await test('registerWorkflowVersions stores versioned workflow graph', async () => {
    await workflowService.registerWorkflowVersions()
    const meta = workflowsMeta['versionedItemWorkflow'] as any
    const v = await workflowService.getWorkflowVersion(
      'versionedItemWorkflow',
      meta.graphHash
    )
    if (!v) throw new Error('versionedItemWorkflow version not stored')
  })

  const savedHash = (workflowsMeta['versionedItemWorkflow'] as any).graphHash
  let queuedRunId = ''

  await test('start workflow (queued, pre-deploy)', async () => {
    const { runId } = await workflowService.startWorkflow(
      'versionedItemWorkflow',
      workflowTestData['versionedItemWorkflow'],
      { type: 'test' },
      rpc
    )
    queuedRunId = runId
    const run = await workflowService.getRun(runId)
    if (run?.status !== 'running') {
      throw new Error(`expected running, got ${run?.status}`)
    }
  })

  await test('deploy v2 — change hash, orchestrate falls back to stored graph', async () => {
    ;(workflowsMeta['versionedItemWorkflow'] as any).graphHash =
      'deployed-v2-hash'
    await workflowService.orchestrateWorkflow(queuedRunId, rpc)
    const step = await workflowService.getStepState(
      queuedRunId,
      'node:process_item'
    )
    if (!step.stepId) {
      throw new Error(
        'fallback did not queue process_item — stored version not used'
      )
    }
  })

  await test('restore hash and verify workflow still works', async () => {
    ;(workflowsMeta['versionedItemWorkflow'] as any).graphHash = savedHash
    const { runId } = await workflowService.startWorkflow(
      'versionedItemWorkflow',
      workflowTestData['versionedItemWorkflow'],
      { type: 'test' },
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
