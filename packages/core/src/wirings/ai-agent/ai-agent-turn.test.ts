import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { toAccumulatedStep } from './ai-agent-turn.js'
import type { AIAgentStepResult } from '../../services/ai-agent-runner-service.js'

const stepResult = (
  overrides?: Partial<AIAgentStepResult>
): AIAgentStepResult => ({
  text: '',
  toolCalls: [],
  toolResults: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  finishReason: 'stop',
  ...overrides,
})

describe('toAccumulatedStep', () => {
  test('carries a tool failure as its own field, not only as rendered text', () => {
    const step = toAccumulatedStep(
      stepResult({
        toolCalls: [
          { toolCallId: 'call-1', toolName: 'lookupOrder', args: { id: 7 } },
        ],
        toolResults: [
          {
            toolCallId: 'call-1',
            toolName: 'lookupOrder',
            result: 'Error: order service unreachable',
            error: 'order service unreachable',
          },
        ],
      })
    )

    assert.deepEqual(step.toolCalls, [
      {
        name: 'lookupOrder',
        args: { id: 7 },
        result: 'Error: order service unreachable',
        error: 'order service unreachable',
      },
    ])
  })

  test('leaves error unset on a tool that returned normally, even if it says Error', () => {
    // A tool is allowed to return the word "Error" — which is exactly why
    // "did this fail" cannot be answered by matching on the result text.
    const step = toAccumulatedStep(
      stepResult({
        toolCalls: [
          { toolCallId: 'call-1', toolName: 'searchLogs', args: { q: 'x' } },
        ],
        toolResults: [
          {
            toolCallId: 'call-1',
            toolName: 'searchLogs',
            result: 'Error: connection refused (1 match)',
          },
        ],
      })
    )

    assert.equal(step.toolCalls[0].error, undefined)
    assert.ok(!('error' in step.toolCalls[0]))
  })
})
