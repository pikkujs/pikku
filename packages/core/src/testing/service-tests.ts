import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import type { ChannelStore } from '../wirings/channel/channel-store.js'
import type { EventHubStore } from '../wirings/channel/eventhub-store.js'
import type { PikkuWorkflowService } from '../wirings/workflow/pikku-workflow-service.js'
import type { WorkflowRunService } from '../wirings/workflow/workflow.types.js'
import type { DeploymentService } from '../services/deployment-service.js'
import type { AIStorageService } from '../services/ai-storage-service.js'
import type { AIRunStateService } from '../services/ai-run-state-service.js'
import type { SecretService } from '../services/secret-service.js'
import type { CredentialService } from '../services/credential-service.js'
import type { AgentRunService } from '../wirings/ai-agent/ai-agent.types.js'
import type { SessionStore } from '../services/session-store.js'

export interface ServiceTestConfig {
  name: string
  services: {
    channelStore?: () => Promise<ChannelStore>
    eventHubStore?: () => Promise<EventHubStore<Record<string, any>>>
    workflowService?: () => Promise<PikkuWorkflowService>
    workflowRunService?: () => Promise<WorkflowRunService>
    deploymentService?: () => Promise<
      DeploymentService & { stop(): Promise<void> }
    >
    aiStorageService?: () => Promise<AIStorageService & AIRunStateService>
    agentRunService?: () => Promise<AgentRunService>
    secretService?: (config: {
      key: string
      keyVersion?: number
      previousKey?: string
    }) => Promise<SecretService & { rotateKEK?(): Promise<number> }>
    credentialService?: (config: {
      key: string
      keyVersion?: number
      previousKey?: string
    }) => Promise<CredentialService & { rotateKEK?(): Promise<number> }>
    sessionStore?: () => Promise<SessionStore>
  }
}

export function defineServiceTests(config: ServiceTestConfig): void {
  const { name, services } = config

  if (services.channelStore) {
    const factory = services.channelStore
    describe(`ChannelStore [${name}]`, () => {
      let store: ChannelStore

      before(async () => {
        store = await factory()
      })

      test('addChannel and getChannel', async () => {
        await store.addChannel({
          channelId: 'ch-1',
          channelName: 'test-channel',
          openingData: { foo: 'bar' },
        })

        const result = await store.getChannel('ch-1')
        assert.equal(result.channelId, 'ch-1')
        assert.equal(result.channelName, 'test-channel')
        assert.deepEqual(result.openingData, { foo: 'bar' })
        assert.equal(result.pikkuUserId, undefined)
      })

      test('setPikkuUserId', async () => {
        await store.setPikkuUserId('ch-1', 'user-1')

        const result = await store.getChannel('ch-1')
        assert.equal(result.pikkuUserId, 'user-1')
      })

      test('setPikkuUserId to null', async () => {
        await store.setPikkuUserId('ch-1', null)

        const result = await store.getChannel('ch-1')
        assert.equal(result.pikkuUserId, undefined)
      })

      test('getChannel throws for missing channel', async () => {
        await assert.rejects(
          async () => {
            await store.getChannel('missing')
          },
          { message: 'Channel not found: missing' }
        )
      })

      test('removeChannels', async () => {
        await store.addChannel({
          channelId: 'ch-2',
          channelName: 'temp-channel',
        })
        await store.removeChannels(['ch-2'])
        await assert.rejects(async () => {
          await store.getChannel('ch-2')
        })
      })

      test('removeChannels with empty array is no-op', async () => {
        await store.removeChannels([])
      })
    })
  }

  if (services.eventHubStore) {
    const factory = services.eventHubStore
    describe(`EventHubStore [${name}]`, () => {
      let store: EventHubStore<Record<string, any>>

      before(async () => {
        store = await factory()
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
  }

  if (services.workflowService) {
    const factory = services.workflowService
    const wire = { type: 'test' }

    describe(`WorkflowService [${name}]`, () => {
      let service: PikkuWorkflowService

      before(async () => {
        service = await factory()
      })

      test('createRun and getRun', async () => {
        const runId = await service.createRun(
          'test-workflow',
          { key: 'value' },
          false,
          'hash-1',
          wire
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
          'hash-2',
          wire
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
          'hash-3',
          wire
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
          'hash-4',
          wire
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
          'hash-5',
          wire
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
          'hash-6',
          wire
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
          'hash-7',
          wire
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
          'hash-8',
          wire
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
          'hash-9',
          wire
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
          'hash-10',
          wire
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

        const version = await service.getWorkflowVersion(
          'my-workflow',
          'v1-hash'
        )
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

        const version = await service.getWorkflowVersion(
          'my-workflow',
          'v1-hash'
        )
        assert.ok(version)
        assert.deepEqual(version.graph, { nodes: ['a', 'b'] })
      })

      test('getWorkflowVersion returns null for missing', async () => {
        const version = await service.getWorkflowVersion('missing', 'missing')
        assert.equal(version, null)
      })
    })
  }

  if (services.workflowRunService) {
    const factory = services.workflowRunService
    describe(`WorkflowRunService [${name}]`, () => {
      let runService: WorkflowRunService

      before(async () => {
        runService = await factory()
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
  }

  if (services.aiStorageService) {
    const factory = services.aiStorageService
    describe(`AIStorageService [${name}]`, () => {
      let storage: AIStorageService & AIRunStateService

      before(async () => {
        storage = await factory()
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
            toolCalls: [
              { id: 'tc-1', name: 'search', args: { query: 'test' } },
            ],
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
            toolCalls: [
              { id: 'approval-tc', name: 'dangerous-tool', args: {} },
            ],
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
            {
              type: 'tool-call',
              toolCallId: 'approval-tc',
              toolName: 'dangerous-tool',
              args: {},
            },
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
  }

  if (services.deploymentService) {
    const factory = services.deploymentService
    describe(`DeploymentService [${name}]`, () => {
      let service: DeploymentService & { stop(): Promise<void> }

      before(async () => {
        service = await factory()
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
      })
    })
  }

  if (services.secretService) {
    const factory = services.secretService
    const kek = 'test-key-encryption-key-32chars!'

    describe(`SecretService [${name}]`, () => {
      test('setSecretJSON and getSecretJSON', async () => {
        const service = await factory({ key: kek })
        await service.setSecretJSON('api-key', {
          token: 'sk-123',
          endpoint: 'https://api.example.com',
        })
        const result = await service.getSecretJSON<{
          token: string
          endpoint: string
        }>('api-key')
        assert.deepEqual(result, {
          token: 'sk-123',
          endpoint: 'https://api.example.com',
        })
      })

      test('getSecret returns raw string', async () => {
        const service = await factory({ key: kek })
        await service.setSecretJSON('string-secret', 'plain-value')
        const result = await service.getSecret('string-secret')
        assert.strictEqual(result, '"plain-value"')
      })

      test('hasSecret returns true/false', async () => {
        const service = await factory({ key: kek })
        assert.strictEqual(await service.hasSecret('api-key'), true)
        assert.strictEqual(await service.hasSecret('nonexistent'), false)
      })

      test('getSecret throws for missing key', async () => {
        const service = await factory({ key: kek })
        await assert.rejects(() => service.getSecret('nonexistent'), {
          message: 'Requested secret not found',
        })
      })

      test('setSecretJSON upserts existing key', async () => {
        const service = await factory({ key: kek })
        await service.setSecretJSON('upsert-key', { v: 1 })
        await service.setSecretJSON('upsert-key', { v: 2 })
        const result = await service.getSecretJSON<{ v: number }>('upsert-key')
        assert.deepEqual(result, { v: 2 })
      })

      test('deleteSecret removes the key', async () => {
        const service = await factory({ key: kek })
        await service.setSecretJSON('to-delete', 'bye')
        assert.strictEqual(await service.hasSecret('to-delete'), true)
        await service.deleteSecret('to-delete')
        assert.strictEqual(await service.hasSecret('to-delete'), false)
      })

      test('rotateKEK re-wraps all secrets', async () => {
        const newKEK = 'new-key-encryption-key-rotated!'
        const oldService = await factory({ key: kek })
        await oldService.setSecretJSON('rotate-test', { important: 'data' })

        const rotatedService = await factory({
          key: newKEK,
          keyVersion: 2,
          previousKey: kek,
        })

        const before = await rotatedService.getSecretJSON<{
          important: string
        }>('rotate-test')
        assert.deepEqual(before, { important: 'data' })

        assert.ok(rotatedService.rotateKEK)
        const count = await rotatedService.rotateKEK!()
        assert.ok(count > 0)

        const newOnlyService = await factory({
          key: newKEK,
          keyVersion: 2,
        })
        const after = await newOnlyService.getSecretJSON<{
          important: string
        }>('rotate-test')
        assert.deepEqual(after, { important: 'data' })
      })

      test('rotateKEK throws without previousKey', async () => {
        const service = await factory({ key: kek })
        assert.ok(service.rotateKEK)
        await assert.rejects(() => service.rotateKEK!(), {
          message: 'No previousKey configured — nothing to rotate from',
        })
      })
    })
  }

  if (services.credentialService) {
    const factory = services.credentialService
    const kek = 'test-key-encryption-key-32chars!'

    describe(`CredentialService [${name}]`, () => {
      test('set and get (global)', async () => {
        const service = await factory({ key: kek })
        await service.set('stripe', { apiKey: 'sk-123' })
        const result = await service.get<{ apiKey: string }>('stripe')
        assert.deepEqual(result, { apiKey: 'sk-123' })
      })

      test('get returns null for missing', async () => {
        const service = await factory({ key: kek })
        const result = await service.get('nonexistent')
        assert.equal(result, null)
      })

      test('has returns true/false', async () => {
        const service = await factory({ key: kek })
        await service.set('exists', { key: 'val' })
        assert.strictEqual(await service.has('exists'), true)
        assert.strictEqual(await service.has('nope'), false)
      })

      test('set upserts existing credential', async () => {
        const service = await factory({ key: kek })
        await service.set('upsert', { v: 1 })
        await service.set('upsert', { v: 2 })
        const result = await service.get<{ v: number }>('upsert')
        assert.deepEqual(result, { v: 2 })
      })

      test('delete removes credential', async () => {
        const service = await factory({ key: kek })
        await service.set('to-delete', { bye: true })
        assert.strictEqual(await service.has('to-delete'), true)
        await service.delete('to-delete')
        assert.strictEqual(await service.has('to-delete'), false)
      })

      test('per-user isolation', async () => {
        const service = await factory({ key: kek })
        await service.set('token', { access: 'user1' }, 'user-1')
        await service.set('token', { access: 'user2' }, 'user-2')

        const u1 = await service.get<{ access: string }>('token', 'user-1')
        const u2 = await service.get<{ access: string }>('token', 'user-2')
        assert.deepEqual(u1, { access: 'user1' })
        assert.deepEqual(u2, { access: 'user2' })
      })

      test('per-user delete does not affect other users', async () => {
        const service = await factory({ key: kek })
        await service.set('cred', { val: 'a' }, 'user-a')
        await service.set('cred', { val: 'b' }, 'user-b')

        await service.delete('cred', 'user-a')
        assert.strictEqual(await service.has('cred', 'user-a'), false)
        assert.strictEqual(await service.has('cred', 'user-b'), true)
      })

      test('global and per-user are separate', async () => {
        const service = await factory({ key: kek })
        await service.set('shared', { scope: 'global' })
        await service.set('shared', { scope: 'user' }, 'user-1')

        const global = await service.get<{ scope: string }>('shared')
        const perUser = await service.get<{ scope: string }>('shared', 'user-1')
        assert.deepEqual(global, { scope: 'global' })
        assert.deepEqual(perUser, { scope: 'user' })
      })

      test('getAll returns all credentials for a user', async () => {
        const service = await factory({ key: kek })
        await service.set('cred-a', { a: 1 }, 'user-x')
        await service.set('cred-b', { b: 2 }, 'user-x')
        await service.set('cred-c', { c: 3 }, 'user-y')

        const all = await service.getAll('user-x')
        assert.deepEqual(all['cred-a'], { a: 1 })
        assert.deepEqual(all['cred-b'], { b: 2 })
        assert.strictEqual(all['cred-c'], undefined)
      })

      test('getAll returns empty for unknown user', async () => {
        const service = await factory({ key: kek })
        const all = await service.getAll('nobody')
        assert.deepEqual(all, {})
      })

      test('rotateKEK re-wraps all credentials', async () => {
        const newKEK = 'new-key-encryption-key-rotated!'
        const oldService = await factory({ key: kek })
        await oldService.set('rotate-cred', { important: 'data' }, 'user-r')

        const rotatedService = await factory({
          key: newKEK,
          keyVersion: 2,
          previousKey: kek,
        })

        const before = await rotatedService.get<{ important: string }>(
          'rotate-cred',
          'user-r'
        )
        assert.deepEqual(before, { important: 'data' })

        assert.ok(rotatedService.rotateKEK)
        const count = await rotatedService.rotateKEK!()
        assert.ok(count > 0)

        const newOnlyService = await factory({
          key: newKEK,
          keyVersion: 2,
        })
        const after = await newOnlyService.get<{ important: string }>(
          'rotate-cred',
          'user-r'
        )
        assert.deepEqual(after, { important: 'data' })
      })

      test('rotateKEK throws without previousKey', async () => {
        const service = await factory({ key: kek })
        assert.ok(service.rotateKEK)
        await assert.rejects(() => service.rotateKEK!(), {
          message: 'No previousKey configured — nothing to rotate from',
        })
      })
    })
  }

  if (services.agentRunService) {
    const factory = services.agentRunService
    describe(`AgentRunService [${name}]`, () => {
      let agentService: AgentRunService

      before(async () => {
        agentService = await factory()
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

  if (services.sessionStore) {
    const factory = services.sessionStore
    describe(`SessionStore [${name}]`, () => {
      let store: SessionStore

      before(async () => {
        store = await factory()
      })

      test('get returns undefined for unknown user', async () => {
        const result = await store.get('unknown-user')
        assert.equal(result, undefined)
      })

      test('set and get round-trip', async () => {
        const session = { userId: 'user-1', organizationId: 'org-1' } as any
        await store.set('user-1', session)

        const result = await store.get('user-1')
        assert.deepEqual(result, session)
      })

      test('set overwrites previous session', async () => {
        await store.set('user-2', { userId: 'user-2', role: 'admin' } as any)
        await store.set('user-2', { userId: 'user-2', role: 'member' } as any)

        const result = await store.get('user-2')
        assert.deepEqual(result, { userId: 'user-2', role: 'member' })
      })

      test('clear removes session', async () => {
        await store.set('user-3', { userId: 'user-3' } as any)
        assert.ok(await store.get('user-3'))

        await store.clear('user-3')
        const result = await store.get('user-3')
        assert.equal(result, undefined)
      })

      test('clear is no-op for unknown user', async () => {
        await store.clear('nonexistent')
      })
    })
  }
}
