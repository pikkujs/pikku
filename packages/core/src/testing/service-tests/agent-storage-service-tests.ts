import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'

import type { AgentStorageService } from '../../services/agent-storage-service.js'
import type { AgentRunStateService } from '../../services/agent-run-state-service.js'
import type { ServiceTestConfig } from '../service-tests.js'

/** Conformance suite for `agentStorageService`. Runs only when a backend supplies one. */
export const defineAiStorageServiceTests = (
  name: string,
  agentStorageService: NonNullable<
    ServiceTestConfig['services']['agentStorageService']
  >
): void => {
  const factory = agentStorageService
  describe(`AgentStorageService [${name}]`, () => {
    let storage: AgentStorageService & AgentRunStateService

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

    test('saveScore and getScores', async () => {
      const thread = await storage.createThread('resource-score')
      const now = new Date()

      const runId = await storage.createRun({
        agentName: 'scored-agent',
        threadId: thread.id,
        resourceId: 'resource-score',
        status: 'completed',
        usage: { inputTokens: 10, outputTokens: 5, model: 'test' },
        createdAt: now,
        updatedAt: now,
      })

      await storage.saveScore({
        runId,
        scorerName: 'tool-error-rate',
        score: 1,
      })
      await storage.saveScore({
        runId,
        scorerName: 'helpfulness',
        score: 0.75,
        reason: 'answered the question but skipped the fee',
        metadata: { subScores: { accuracy: 0.9 }, judgeTokens: 412 },
      })

      const scores = await storage.getScores(runId)
      assert.equal(scores.length, 2)

      const byName = new Map(scores.map((s) => [s.scorerName, s]))

      const clean = byName.get('tool-error-rate')
      assert.ok(clean)
      assert.equal(clean.score, 1)
      assert.equal(clean.reason, undefined)
      assert.equal(clean.metadata, undefined)

      const helpful = byName.get('helpfulness')
      assert.ok(helpful)
      // A fractional score has to survive the round trip: an integer column
      // would quietly turn every grade into 0 or 1.
      assert.equal(helpful.score, 0.75)
      assert.equal(helpful.reason, 'answered the question but skipped the fee')
      assert.deepEqual(helpful.metadata, {
        subScores: { accuracy: 0.9 },
        judgeTokens: 412,
      })
      assert.ok(helpful.createdAt instanceof Date)
    })

    test('a re-grade appends rather than replacing the grade that was acted on', async () => {
      const thread = await storage.createThread('resource-regrade')
      const now = new Date()

      const runId = await storage.createRun({
        agentName: 'regraded-agent',
        threadId: thread.id,
        resourceId: 'resource-regrade',
        status: 'completed',
        usage: { inputTokens: 1, outputTokens: 1, model: 'test' },
        createdAt: now,
        updatedAt: now,
      })

      await storage.saveScore({ runId, scorerName: 'helpfulness', score: 0.2 })
      await storage.saveScore({ runId, scorerName: 'helpfulness', score: 0.8 })

      const scores = await storage.getScores(runId)
      assert.equal(scores.length, 2)
      assert.deepEqual(
        scores.map((s) => s.score),
        [0.2, 0.8]
      )
    })

    test('getScores is empty for a run nothing graded', async () => {
      const thread = await storage.createThread('resource-ungraded')
      const now = new Date()

      const runId = await storage.createRun({
        agentName: 'ungraded-agent',
        threadId: thread.id,
        resourceId: 'resource-ungraded',
        status: 'completed',
        usage: { inputTokens: 1, outputTokens: 1, model: 'test' },
        createdAt: now,
        updatedAt: now,
      })

      assert.deepEqual(await storage.getScores(runId), [])
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

      const claimed = await storage.resolveApproval('approval-tc', 'approved')
      assert.equal(claimed, true, 'the first approver claims the approval')

      run = await storage.getRun(runId)
      assert.ok(run)
      assert.equal(run.pendingApprovals, undefined)

      const second = await storage.resolveApproval('approval-tc', 'approved')
      assert.equal(
        second,
        false,
        'a second approver of the same tool call claims nothing'
      )
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
