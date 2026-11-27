import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  runInlineRetryLoop,
  startStepAttempt,
  type StepRetryStore,
} from './workflow-step-retry.js'
import type { StepState } from './workflow.types.js'

const step = (attemptCount: number): StepState =>
  ({ stepId: `step-${attemptCount}`, status: 'running', attemptCount }) as any

const store = (overrides: Partial<StepRetryStore> = {}): StepRetryStore => ({
  setStepRunning: async () => {},
  setStepResult: async () => {},
  setStepError: async () => {},
  createRetryAttempt: async (stepId) => step(Number(stepId.split('-')[1]) + 1),
  ...overrides,
})

describe('startStepAttempt', () => {
  test('a pass that lost its run while marking the step reads no further', async () => {
    const lost = new AbortController()
    let checks = 0

    await assert.rejects(
      startStepAttempt(
        store({
          setStepRunning: async () => lost.abort(new Error('run lease lost')),
        }),
        step(1),
        async () => {
          checks++
        },
        { leaseLost: lost.signal }
      ),
      /run lease lost/
    )

    assert.equal(checks, 0)
  })
})

describe('runInlineRetryLoop', () => {
  test('retries work that fails until it succeeds', async () => {
    let calls = 0
    const result = await runInlineRetryLoop(
      store(),
      step(1),
      3,
      undefined,
      async () => {
        calls++
        if (calls < 3) throw new Error('flaky')
        return 'done'
      }
    )

    assert.equal(result, 'done')
    assert.equal(calls, 3)
  })

  test('does not run completed work again when its result cannot be written', async () => {
    let calls = 0
    await assert.rejects(
      runInlineRetryLoop(
        store({
          setStepResult: async () => {
            throw new Error('store down')
          },
        }),
        step(1),
        3,
        undefined,
        async () => {
          calls++
          return 'done'
        }
      ),
      /store down/
    )

    assert.equal(calls, 1, 'the work ran again after it had succeeded')
  })
})
