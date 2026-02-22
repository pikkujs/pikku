import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { runAIAgent } from './ai-agent-runner.js'
import type { CoreAIAgent } from './ai-agent.types.js'

beforeEach(() => {
  resetPikkuState()
})

const addTestAgent = (agentName: string) => {
  const agent: CoreAIAgent = {
    name: agentName,
    description: 'test agent',
    instructions: 'be helpful',
    model: 'test-model',
  }

  pikkuState(null, 'agent', 'agentsMeta')[agentName] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  }
  pikkuState(null, 'agent', 'agents').set(agentName, agent)
  pikkuState(null, 'models', 'config', {
    models: { 'test-model': 'test/test-model' },
  })
}

describe('runAIAgent', () => {
  test('marks run as failed when runner throws', async () => {
    addTestAgent('failing-agent')

    const updates: unknown[] = []
    const expectedError = new Error('runner failed')

    const singletonServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async () => {
          throw expectedError
        },
      },
      aiRunState: {
        createRun: async () => 'run-1',
        updateRun: async (_runId: string, patch: unknown) => {
          updates.push(patch)
        },
      },
    } as any

    await assert.rejects(
      () =>
        runAIAgent(
          'failing-agent',
          {
            message: 'hello',
            threadId: 'thread-1',
            resourceId: 'resource-1',
          },
          { singletonServices }
        ),
      expectedError
    )

    assert.deepEqual(updates, [{ status: 'failed' }])
  })
})
