import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import { DEFAULT_STEP_RETRIES } from './pikku-workflow-service.js'
import type { PikkuWorkflowService } from './pikku-workflow-service.js'
import { deriveInvocationId } from './workflow-invocation-id.js'
import type { WorkflowStepOptions } from './workflow.types.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// Expose the protected retry-policy resolver for direct assertion.
class TestWorkflowService extends InMemoryWorkflowService {
  public resolve(options?: WorkflowStepOptions) {
    return (this as PikkuWorkflowService as any).resolveStepJobOptions(options)
  }
}

describe('resolveStepJobOptions — workflow owns retry policy', () => {
  const ws = new TestWorkflowService()

  test('unset retries → default + exponential backoff (rides out outages)', () => {
    assert.deepEqual(ws.resolve(undefined), {
      attempts: DEFAULT_STEP_RETRIES + 1,
      backoff: 'exponential',
    })
  })

  test('retries: 0 → attempts: 1 and NO backoff (the non-idempotent opt-out)', () => {
    // The whole point: an explicit 0 must never inherit the queue default and
    // re-run a step the workflow said to run exactly once.
    assert.deepEqual(ws.resolve({ retries: 0 }), { attempts: 1 })
  })

  test('explicit retries always honored', () => {
    assert.deepEqual(ws.resolve({ retries: 3 }), {
      attempts: 4,
      backoff: 'exponential',
    })
  })

  test('numeric retryDelay → fixed backoff', () => {
    assert.deepEqual(ws.resolve({ retries: 3, retryDelay: 250 }), {
      attempts: 4,
      backoff: { type: 'fixed', delay: 250 },
    })
  })

  test("duration-string retryDelay ('15s') → fixed backoff in ms", () => {
    assert.deepEqual(ws.resolve({ retries: 3, retryDelay: '15s' }), {
      attempts: 4,
      backoff: { type: 'fixed', delay: 15000 },
    })
  })

  test("retryDelay: 'exponential' → exponential backoff", () => {
    assert.deepEqual(ws.resolve({ retries: 2, retryDelay: 'exponential' }), {
      attempts: 3,
      backoff: 'exponential',
    })
  })
})

describe('executeWorkflowStep surfaces a stable invocationId', () => {
  test('invocationId is stable across a retry; stepId is per-attempt', async () => {
    const ws = new InMemoryWorkflowService()
    pikkuState(null, 'package', 'singletonServices', {
      queueService: { add: async () => {} },
      logger: { error() {}, info() {}, warn() {}, debug() {} },
    } as any)

    const captured: Array<{
      invocationId: string
      stepId: string
      attemptCount: number
    }> = []
    const rpc = {
      rpcWithWire: async (_n: string, _d: any, opts: any) => {
        captured.push(opts.workflowStep)
        if (captured.length === 1) throw new Error('transient boom')
        return { ok: true }
      },
    }

    const runId = await ws.createRun('invflow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.insertStepState(runId, 'updateUser', 'doUpdateUser', {})

    // First attempt fails (default retries not exhausted → throws, not failed-run).
    await assert.rejects(
      ws.executeWorkflowStep(runId, 'updateUser', 'doUpdateUser', {}, rpc)
    )
    // Retry attempt succeeds.
    await ws.executeWorkflowStep(runId, 'updateUser', 'doUpdateUser', {}, rpc)

    assert.equal(captured.length, 2, 'step ran twice')
    assert.equal(
      captured[0]!.invocationId,
      captured[1]!.invocationId,
      'invocationId is identical across retries — the dedupe key'
    )
    assert.equal(
      captured[0]!.invocationId,
      deriveInvocationId(runId, 'updateUser')
    )
    assert.match(captured[0]!.invocationId, UUID_RE)
    assert.equal(captured[0]!.attemptCount, 1)
    assert.equal(captured[1]!.attemptCount, 2)
    assert.notEqual(
      captured[0]!.stepId,
      captured[1]!.stepId,
      'stepId is minted per attempt — must NOT be used as the dedupe key'
    )
  })
})
