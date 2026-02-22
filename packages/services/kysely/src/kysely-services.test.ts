import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Kysely, SqliteDialect } from 'kysely'
import { SerializePlugin } from 'kysely-plugin-serialize'
import Database from 'better-sqlite3'

import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyChannelStore } from './kysely-channel-store.js'
import { KyselyEventHubStore } from './kysely-eventhub-store.js'
import { KyselyWorkflowService } from './kysely-workflow-service.js'
import { KyselyWorkflowRunService } from './kysely-workflow-run-service.js'
import { KyselyDeploymentService } from './kysely-deployment-service.js'
import { KyselyAIStorageService } from './kysely-ai-storage-service.js'
import { KyselyAgentRunService } from './kysely-agent-run-service.js'

function createSqliteDb(): Kysely<KyselyPikkuDB> {
  return new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({
      database: new Database(':memory:'),
    }),
    plugins: [new SerializePlugin()],
  })
}

async function createPostgresDb(): Promise<Kysely<KyselyPikkuDB> | null> {
  const url = process.env.DATABASE_URL
  if (!url) return null

  const { PostgresJSDialect } = await import('kysely-postgres-js')
  const postgres = (await import('postgres')).default
  return new Kysely<KyselyPikkuDB>({
    dialect: new PostgresJSDialect({ postgres: postgres(url) }),
  })
}

async function dropAllTables(db: Kysely<KyselyPikkuDB>): Promise<void> {
  const tables = [
    'pikku_deployment_functions',
    'pikku_deployments',
    'ai_tool_call',
    'ai_message',
    'ai_run',
    'ai_working_memory',
    'ai_threads',
    'channel_subscriptions',
    'channels',
    'workflow_step_history',
    'workflow_step',
    'workflow_runs',
    'workflow_versions',
  ]
  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute()
  }
}

function defineTestSuite(
  dialectName: string,
  getDb: () => Kysely<KyselyPikkuDB>
) {
  describe(`KyselyChannelStore [${dialectName}]`, () => {
    let store: KyselyChannelStore

    before(async () => {
      store = new KyselyChannelStore(getDb())
      await store.init()
    })

    test('addChannel and getChannelAndSession', async () => {
      await store.addChannel({
        channelId: 'ch-1',
        channelName: 'test-channel',
        openingData: { foo: 'bar' },
      })

      const result = await store.getChannelAndSession('ch-1')
      assert.equal(result.channelId, 'ch-1')
      assert.equal(result.channelName, 'test-channel')
      assert.deepEqual(result.openingData, { foo: 'bar' })
      assert.deepEqual(result.session, {})
    })

    test('setUserSession', async () => {
      const session = { userId: 'user-1' } as any
      await store.setUserSession('ch-1', session)

      const result = await store.getChannelAndSession('ch-1')
      assert.deepEqual(result.session, session)
    })

    test('getChannelAndSession throws for missing channel', async () => {
      await assert.rejects(() => store.getChannelAndSession('missing'), {
        message: 'Channel not found: missing',
      })
    })

    test('removeChannels', async () => {
      await store.addChannel({
        channelId: 'ch-2',
        channelName: 'temp-channel',
      })
      await store.removeChannels(['ch-2'])
      await assert.rejects(() => store.getChannelAndSession('ch-2'))
    })

    test('removeChannels with empty array is no-op', async () => {
      await store.removeChannels([])
    })
  })

  describe(`KyselyEventHubStore [${dialectName}]`, () => {
    let store: KyselyEventHubStore

    before(async () => {
      store = new KyselyEventHubStore(getDb())
      await store.init()
    })

    test('subscribe and getChannelIdsForTopic', async () => {
      const result = await store.subscribe('topic-1', 'ch-1')
      assert.equal(result, true)

      const ids = await store.getChannelIdsForTopic('topic-1')
      assert.deepEqual(ids, ['ch-1'])
    })

    test('subscribe duplicate is idempotent', async () => {
      const result = await store.subscribe('topic-1', 'ch-1')
      assert.equal(result, true)
    })

    test('unsubscribe returns true when exists', async () => {
      const result = await store.unsubscribe('topic-1', 'ch-1')
      assert.equal(result, true)
    })

    test('unsubscribe returns false when not exists', async () => {
      const result = await store.unsubscribe('topic-1', 'ch-1')
      assert.equal(result, false)
    })

    test('getChannelIdsForTopic returns empty for unknown topic', async () => {
      const ids = await store.getChannelIdsForTopic('unknown')
      assert.deepEqual(ids, [])
    })
  })

  describe(`KyselyWorkflowService [${dialectName}]`, () => {
    let service: KyselyWorkflowService
    let runService: KyselyWorkflowRunService

    before(async () => {
      service = new KyselyWorkflowService(getDb())
      runService = new KyselyWorkflowRunService(getDb())
      await service.init()
    })

    test('createRun and getRun', async () => {
      const runId = await service.createRun(
        'test-workflow',
        { key: 'value' },
        false,
        'hash-1'
      )

      assert.ok(runId)
      const run = await service.getRun(runId)
      assert.ok(run)
      assert.equal(run.workflow, 'test-workflow')
      assert.equal(run.status, 'running')
      assert.deepEqual(run.input, { key: 'value' })
      assert.equal(run.graphHash, 'hash-1')
    })

    test('updateRunStatus', async () => {
      const runId = await service.createRun(
        'status-workflow',
        {},
        false,
        'hash-2'
      )
      await service.updateRunStatus(runId, 'completed', { result: 'done' })

      const run = await service.getRun(runId)
      assert.ok(run)
      assert.equal(run.status, 'completed')
      assert.deepEqual(run.output, { result: 'done' })
    })

    test('insertStepState and getStepState', async () => {
      const runId = await service.createRun(
        'step-workflow',
        {},
        false,
        'hash-3'
      )

      const step = await service.insertStepState(
        runId,
        'step-1',
        'myRpc',
        { data: 'test' },
        { retries: 3, retryDelay: '1000' }
      )

      assert.ok(step.stepId)
      assert.equal(step.status, 'pending')
      assert.equal(step.attemptCount, 1)
      assert.equal(step.retries, 3)
      assert.equal(step.retryDelay, '1000')

      const fetched = await service.getStepState(runId, 'step-1')
      assert.equal(fetched.stepId, step.stepId)
      assert.equal(fetched.status, 'pending')
      assert.equal(fetched.attemptCount, 1)
    })

    test('setStepRunning, setStepResult', async () => {
      const runId = await service.createRun(
        'result-workflow',
        {},
        false,
        'hash-4'
      )
      const step = await service.insertStepState(
        runId,
        'result-step',
        'myRpc',
        {}
      )

      await service.setStepRunning(step.stepId)
      let fetched = await service.getStepState(runId, 'result-step')
      assert.equal(fetched.status, 'running')

      await service.setStepResult(step.stepId, { answer: 42 })
      fetched = await service.getStepState(runId, 'result-step')
      assert.equal(fetched.status, 'succeeded')
      assert.deepEqual(fetched.result, { answer: 42 })
    })

    test('setStepError', async () => {
      const runId = await service.createRun(
        'error-workflow',
        {},
        false,
        'hash-5'
      )
      const step = await service.insertStepState(
        runId,
        'error-step',
        'myRpc',
        {}
      )

      await service.setStepRunning(step.stepId)
      await service.setStepError(step.stepId, new Error('boom'))

      const fetched = await service.getStepState(runId, 'error-step')
      assert.equal(fetched.status, 'failed')
      assert.equal(fetched.error?.message, 'boom')
    })

    test('createRetryAttempt', async () => {
      const runId = await service.createRun(
        'retry-workflow',
        {},
        false,
        'hash-6'
      )
      const step = await service.insertStepState(
        runId,
        'retry-step',
        'myRpc',
        {},
        { retries: 2 }
      )

      await service.setStepError(step.stepId, new Error('fail'))
      const retried = await service.createRetryAttempt(step.stepId, 'pending')
      assert.equal(retried.status, 'pending')
      assert.equal(retried.attemptCount, 2)
      assert.equal(retried.error, undefined)
      assert.equal(retried.result, undefined)
    })

    test('getNodesWithoutSteps', async () => {
      const runId = await service.createRun(
        'graph-workflow',
        {},
        false,
        'hash-7'
      )
      await service.insertStepState(runId, 'existing-node', 'rpc', {})

      const missing = await service.getNodesWithoutSteps(runId, [
        'existing-node',
        'missing-node',
      ])
      assert.deepEqual(missing, ['missing-node'])
    })

    test('getNodesWithoutSteps with empty array', async () => {
      const result = await service.getNodesWithoutSteps('any-id', [])
      assert.deepEqual(result, [])
    })

    test('getNodeResults', async () => {
      const runId = await service.createRun(
        'results-workflow',
        {},
        false,
        'hash-8'
      )
      const step = await service.insertStepState(runId, 'node-a', 'rpc', {})
      await service.setStepResult(step.stepId, { out: 'hello' })

      const results = await service.getNodeResults(runId, ['node-a'])
      assert.deepEqual(results['node-a'], { out: 'hello' })
    })

    test('setBranchTaken and getCompletedGraphState', async () => {
      const runId = await service.createRun(
        'branch-workflow',
        {},
        false,
        'hash-9'
      )
      const step = await service.insertStepState(
        runId,
        'branch-node',
        'rpc',
        {}
      )
      await service.setStepResult(step.stepId, {})
      await service.setBranchTaken(step.stepId, 'left')

      const state = await service.getCompletedGraphState(runId)
      assert.ok(state.completedNodeIds.includes('branch-node'))
      assert.equal(state.branchKeys['branch-node'], 'left')
    })

    test('updateRunState and getRunState', async () => {
      const runId = await service.createRun(
        'state-workflow',
        {},
        false,
        'hash-10'
      )

      await service.updateRunState(runId, 'counter', 5)
      await service.updateRunState(runId, 'name', 'test')

      const state = await service.getRunState(runId)
      assert.equal(state.counter, 5)
      assert.equal(state.name, 'test')
    })

    test('upsertWorkflowVersion and getWorkflowVersion', async () => {
      await service.upsertWorkflowVersion(
        'my-workflow',
        'v1-hash',
        { nodes: ['a', 'b'] },
        'dsl'
      )

      const version = await service.getWorkflowVersion('my-workflow', 'v1-hash')
      assert.ok(version)
      assert.deepEqual(version.graph, { nodes: ['a', 'b'] })
      assert.equal(version.source, 'dsl')
    })

    test('upsertWorkflowVersion duplicate is no-op', async () => {
      await service.upsertWorkflowVersion(
        'my-workflow',
        'v1-hash',
        { nodes: ['changed'] },
        'dsl'
      )

      const version = await service.getWorkflowVersion('my-workflow', 'v1-hash')
      assert.ok(version)
      assert.deepEqual(version.graph, { nodes: ['a', 'b'] })
    })

    test('getWorkflowVersion returns null for missing', async () => {
      const version = await service.getWorkflowVersion('missing', 'missing')
      assert.equal(version, null)
    })
  })

  describe(`KyselyWorkflowRunService [${dialectName}]`, () => {
    let runService: KyselyWorkflowRunService

    before(async () => {
      runService = new KyselyWorkflowRunService(getDb())
    })

    test('listRuns returns runs', async () => {
      const runs = await runService.listRuns()
      assert.ok(Array.isArray(runs))
      assert.ok(runs.length > 0)
    })

    test('listRuns with filter', async () => {
      const runs = await runService.listRuns({
        workflowName: 'test-workflow',
      })
      assert.ok(runs.every((r) => r.workflow === 'test-workflow'))
    })

    test('getDistinctWorkflowNames', async () => {
      const names = await runService.getDistinctWorkflowNames()
      assert.ok(Array.isArray(names))
      assert.ok(names.includes('test-workflow'))
    })

    test('deleteRun', async () => {
      const runs = await runService.listRuns({
        workflowName: 'status-workflow',
      })
      assert.ok(runs.length > 0)

      const deleted = await runService.deleteRun(runs[0]!.id)
      assert.equal(deleted, true)

      const afterDelete = await runService.getRun(runs[0]!.id)
      assert.equal(afterDelete, null)
    })

    test('deleteRun returns false for missing', async () => {
      const deleted = await runService.deleteRun('non-existent-id')
      assert.equal(deleted, false)
    })
  })

  describe(`KyselyAIStorageService [${dialectName}]`, () => {
    let storage: KyselyAIStorageService

    before(async () => {
      storage = new KyselyAIStorageService(getDb())
      await storage.init()
    })

    test('createThread and getThread', async () => {
      const thread = await storage.createThread('resource-1', {
        title: 'Test Thread',
        metadata: { key: 'val' },
      })

      assert.ok(thread.id)
      assert.equal(thread.resourceId, 'resource-1')
      assert.equal(thread.title, 'Test Thread')
      assert.deepEqual(thread.metadata, { key: 'val' })

      const fetched = await storage.getThread(thread.id)
      assert.equal(fetched.id, thread.id)
      assert.equal(fetched.title, 'Test Thread')
    })

    test('getThreads', async () => {
      const threads = await storage.getThreads('resource-1')
      assert.ok(threads.length >= 1)
      assert.ok(threads.every((t) => t.resourceId === 'resource-1'))
    })

    test('getThread throws for missing', async () => {
      await assert.rejects(() => storage.getThread('missing-thread'))
    })

    test('saveMessages and getMessages', async () => {
      const thread = await storage.createThread('resource-2')
      const now = new Date()

      await storage.saveMessages(thread.id, [
        { id: 'msg-1', role: 'user', content: 'Hello', createdAt: now },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          createdAt: new Date(now.getTime() + 1000),
        },
      ])

      const messages = await storage.getMessages(thread.id)
      assert.equal(messages.length, 2)
      assert.equal(messages[0]!.role, 'user')
      assert.equal(messages[0]!.content, 'Hello')
      assert.equal(messages[1]!.role, 'assistant')
      assert.equal(messages[1]!.content, 'Hi there')
    })

    test('saveMessages with tool calls and results', async () => {
      const thread = await storage.createThread('resource-3')
      const now = new Date()

      await storage.saveMessages(thread.id, [
        {
          id: 'msg-tc',
          role: 'assistant',
          content: 'Let me call a tool',
          toolCalls: [{ id: 'tc-1', name: 'search', args: { query: 'test' } }],
          createdAt: now,
        },
      ])

      await storage.saveMessages(thread.id, [
        {
          id: 'tool-results-msg-tc',
          role: 'tool',
          toolResults: [{ id: 'tc-1', name: 'search', result: 'found it' }],
          createdAt: new Date(now.getTime() + 1000),
        },
      ])

      const messages = await storage.getMessages(thread.id)
      assert.equal(messages.length, 2)

      const assistantMsg = messages[0]!
      assert.equal(assistantMsg.role, 'assistant')
      assert.ok(assistantMsg.toolCalls)
      assert.equal(assistantMsg.toolCalls[0]!.name, 'search')

      const toolMsg = messages[1]!
      assert.equal(toolMsg.role, 'tool')
      assert.ok(toolMsg.toolResults)
      assert.equal(toolMsg.toolResults[0]!.result, 'found it')
    })

    test('getMessages with lastN', async () => {
      const thread = await storage.createThread('resource-4')
      const base = Date.now()

      await storage.saveMessages(
        thread.id,
        Array.from({ length: 5 }, (_, i) => ({
          id: `bulk-msg-${i}`,
          role: 'user' as const,
          content: `Message ${i}`,
          createdAt: new Date(base + i * 1000),
        }))
      )

      const messages = await storage.getMessages(thread.id, { lastN: 2 })
      assert.equal(messages.length, 2)
      assert.equal(messages[0]!.content, 'Message 3')
      assert.equal(messages[1]!.content, 'Message 4')
    })

    test('working memory: save and get', async () => {
      await storage.saveWorkingMemory('res-1', 'resource', {
        key: 'value',
      })

      const mem = await storage.getWorkingMemory('res-1', 'resource')
      assert.deepEqual(mem, { key: 'value' })
    })

    test('working memory: upsert overwrites', async () => {
      await storage.saveWorkingMemory('res-1', 'resource', {
        key: 'updated',
      })

      const mem = await storage.getWorkingMemory('res-1', 'resource')
      assert.deepEqual(mem, { key: 'updated' })
    })

    test('working memory: returns null for missing', async () => {
      const mem = await storage.getWorkingMemory('missing', 'thread')
      assert.equal(mem, null)
    })

    test('createRun and getRun', async () => {
      const thread = await storage.createThread('resource-5')
      const now = new Date()

      const runId = await storage.createRun({
        agentName: 'test-agent',
        threadId: thread.id,
        resourceId: 'resource-5',
        status: 'running',
        usage: { inputTokens: 100, outputTokens: 50, model: 'test-model' },
        createdAt: now,
        updatedAt: now,
      })

      assert.ok(runId)

      const run = await storage.getRun(runId)
      assert.ok(run)
      assert.equal(run.agentName, 'test-agent')
      assert.equal(run.status, 'running')
      assert.equal(run.usage.inputTokens, 100)
    })

    test('updateRun', async () => {
      const thread = await storage.createThread('resource-6')
      const now = new Date()

      const runId = await storage.createRun({
        agentName: 'update-agent',
        threadId: thread.id,
        resourceId: 'resource-6',
        status: 'running',
        usage: { inputTokens: 0, outputTokens: 0, model: 'test' },
        createdAt: now,
        updatedAt: now,
      })

      await storage.updateRun(runId, {
        status: 'completed',
        usage: { inputTokens: 200, outputTokens: 100, model: 'test-v2' },
      })

      const run = await storage.getRun(runId)
      assert.ok(run)
      assert.equal(run.status, 'completed')
      assert.equal(run.usage.inputTokens, 200)
      assert.equal(run.usage.model, 'test-v2')
    })

    test('getRunsByThread', async () => {
      const thread = await storage.createThread('resource-7')
      const now = new Date()

      await storage.createRun({
        agentName: 'multi-agent',
        threadId: thread.id,
        resourceId: 'resource-7',
        status: 'completed',
        usage: { inputTokens: 10, outputTokens: 5, model: 'test' },
        createdAt: now,
        updatedAt: now,
      })

      const runs = await storage.getRunsByThread(thread.id)
      assert.ok(runs.length >= 1)
      assert.ok(runs.every((r) => r.threadId === thread.id))
    })

    test('resolveApproval', async () => {
      const thread = await storage.createThread('resource-8')
      const now = new Date()

      await storage.saveMessages(thread.id, [
        {
          id: 'approval-msg',
          role: 'assistant',
          toolCalls: [{ id: 'approval-tc', name: 'dangerous-tool', args: {} }],
          createdAt: now,
        },
      ])

      const runId = await storage.createRun({
        agentName: 'approval-agent',
        threadId: thread.id,
        resourceId: 'resource-8',
        status: 'suspended',
        suspendReason: 'approval',
        pendingApprovals: [
          { toolCallId: 'approval-tc', toolName: 'dangerous-tool', args: {} },
        ],
        usage: { inputTokens: 0, outputTokens: 0, model: 'test' },
        createdAt: now,
        updatedAt: now,
      })

      let run = await storage.getRun(runId)
      assert.ok(run)
      assert.ok(run.pendingApprovals)
      assert.equal(run.pendingApprovals.length, 1)

      await storage.resolveApproval('approval-tc', 'approved')

      run = await storage.getRun(runId)
      assert.ok(run)
      assert.equal(run.pendingApprovals, undefined)
    })

    test('deleteThread cascades', async () => {
      const thread = await storage.createThread('resource-del')
      await storage.saveMessages(thread.id, [
        {
          id: 'del-msg',
          role: 'user',
          content: 'goodbye',
          createdAt: new Date(),
        },
      ])

      await storage.deleteThread(thread.id)
      await assert.rejects(() => storage.getThread(thread.id))
    })
  })

  describe(`KyselyDeploymentService [${dialectName}]`, () => {
    let service: KyselyDeploymentService

    before(async () => {
      service = new KyselyDeploymentService(
        { heartbeatInterval: 60000, heartbeatTtl: 120000 },
        getDb()
      )
      await service.init()
    })

    after(async () => {
      await service.stop()
    })

    test('start registers deployment', async () => {
      await service.start({
        deploymentId: 'deploy-1',
        endpoint: 'http://localhost:3000',
        functions: ['funcA', 'funcB'],
      })

      const infos = await service.findFunction('funcA')
      assert.ok(infos.length >= 1)
      assert.equal(infos[0]!.deploymentId, 'deploy-1')
      assert.equal(infos[0]!.endpoint, 'http://localhost:3000')
    })

    test('findFunction returns empty for unknown function', async () => {
      const infos = await service.findFunction('unknown-func')
      assert.deepEqual(infos, [])
    })
  })

  describe(`KyselyAgentRunService [${dialectName}]`, () => {
    let agentService: KyselyAgentRunService

    before(async () => {
      agentService = new KyselyAgentRunService(getDb())
    })

    test('listThreads', async () => {
      const threads = await agentService.listThreads()
      assert.ok(Array.isArray(threads))
    })

    test('getThread returns null for missing', async () => {
      const thread = await agentService.getThread('missing-thread')
      assert.equal(thread, null)
    })

    test('getDistinctAgentNames', async () => {
      const names = await agentService.getDistinctAgentNames()
      assert.ok(Array.isArray(names))
    })

    test('deleteThread returns false for missing', async () => {
      const result = await agentService.deleteThread('missing-thread')
      assert.equal(result, false)
    })
  })
}

describe('Kysely Services - SQLite', () => {
  let db: Kysely<KyselyPikkuDB>

  before(async () => {
    db = createSqliteDb()
  })

  after(async () => {
    await db.destroy()
  })

  defineTestSuite('SQLite', () => db)
})

describe(
  'Kysely Services - PostgreSQL',
  {
    skip: !process.env.DATABASE_URL ? 'DATABASE_URL not set' : undefined,
  },
  () => {
    let db: Kysely<KyselyPikkuDB>

    before(async () => {
      db = (await createPostgresDb())!
      await dropAllTables(db)
    })

    after(async () => {
      if (db) {
        await dropAllTables(db)
        await db.destroy()
      }
    })

    defineTestSuite('PostgreSQL', () => db)
  }
)
