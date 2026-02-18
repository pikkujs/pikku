import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { approveAIAgent } from './ai-agent-registry.js'

describe('approveAIAgent', () => {
  test('rejects approval when run agent does not match expected agent', async () => {
    const aiRunState = {
      getRun: async () => ({
        runId: 'run-1',
        agentName: 'internal-agent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        status: 'suspended',
        pendingApprovals: [],
        usage: { inputTokens: 0, outputTokens: 0, model: 'test-model' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      updateRun: async () => {},
    } as any

    await assert.rejects(
      () =>
        approveAIAgent(
          aiRunState,
          'run-1',
          [{ toolCallId: 'call-1', approved: true }],
          'public-agent'
        ),
      {
        message:
          "Run run-1 belongs to agent 'internal-agent', not 'public-agent'",
      }
    )
  })
})
