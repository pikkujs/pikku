import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryAgentRunStateService } from './in-memory-agent-run-state-service.js'
import type { CreateRunInput } from './agent-run-state-service.js'

/** An approval expiry far enough ahead that no test outlives it. */
const LIVE = new Date(Date.now() + 60 * 60 * 1000)

const suspendedOn = (
  toolCallId: string,
  expiresAt: Date | null = LIVE
): CreateRunInput => ({
  agentName: 'agent',
  threadId: 'thread',
  resourceId: 'resource',
  status: 'suspended',
  suspendReason: 'approval',
  pendingApprovals: [
    {
      type: 'tool-call',
      toolCallId,
      toolName: 'refund',
      args: {},
      expiresAt: expiresAt ?? undefined,
    },
  ],
  usage: { inputTokens: 0, outputTokens: 0, model: 'test' },
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('InMemoryAgentRunStateService.resolveApproval', () => {
  test('claims only an approval pending on the named run', async () => {
    const store = new InMemoryAgentRunStateService()
    const runA = await store.createRun(suspendedOn('tc-a'))
    const runB = await store.createRun(suspendedOn('tc-b'))

    assert.equal(
      await store.resolveApproval({
        runId: runA,
        toolCallId: 'tc-b',
        status: 'approved',
      }),
      false,
      "run A cannot claim run B's approval"
    )
    assert.equal((await store.getRun(runB))?.pendingApprovals?.length, 1)

    assert.equal(
      await store.resolveApproval({
        runId: runB,
        toolCallId: 'tc-b',
        status: 'approved',
      }),
      true
    )
    assert.equal(
      await store.resolveApproval({
        runId: runB,
        toolCallId: 'tc-b',
        status: 'approved',
      }),
      false,
      'a second claim of the same approval loses'
    )
  })

  test('refuses an approval past its expiry, and one with none recorded', async () => {
    const store = new InMemoryAgentRunStateService()
    const expired = await store.createRun(
      suspendedOn('tc-expired', new Date(Date.now() - 1))
    )
    const unstamped = await store.createRun(suspendedOn('tc-unstamped', null))

    assert.equal(
      await store.resolveApproval({
        runId: expired,
        toolCallId: 'tc-expired',
        status: 'approved',
      }),
      false
    )
    assert.equal(
      await store.resolveApproval({
        runId: unstamped,
        toolCallId: 'tc-unstamped',
        status: 'approved',
      }),
      false,
      'an approval saved before approvals expired is refused'
    )
  })
})
