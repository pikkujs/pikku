import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { pikkuState } from '../../pikku-state.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { takeBackLostInlineStep } from './workflow-step-claim.js'
import { deriveInvocationId } from './workflow-invocation-id.js'
import type { StepState } from './workflow.types.js'

const STEP = 'Charge card'
const TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
const traceparent = `00-${TRACE_ID}-b7ad6b7169203331-01`

type Warning = { traceId?: string; entry: any }

const recordingLogger = (warnings: Warning[], traceId?: string): any => ({
  debug() {},
  info() {},
  error() {},
  warn: (entry: any) => warnings.push({ traceId, entry }),
  scope: (id: string) => recordingLogger(warnings, id),
})

let h: QueuedWorkflowHarness
let warnings: Warning[]

const claim = (runId: string): Promise<StepState | null> =>
  (h.ws as any).claimStepForExecution(runId, STEP, STEP, 60_000)

const startRun = async (stepOptions?: { retries?: number }) => {
  const runId = await h.ws.createRun('flow', {}, false, 'hash', {
    type: 'test',
    traceparent,
  } as never)
  await h.ws.insertStepState(runId, STEP, STEP, {}, stepOptions)
  return runId
}

/** A step a worker claimed and then died on, its lease run out. */
const loseTheWorker = async (runId: string) => {
  const held = await claim(runId)
  ;(await h.ws.getStepState(runId, STEP)).leaseExpiresAt = new Date(
    Date.now() - 1
  )
  return held!
}

const assertWarned = (runId: string, attempt: number) => {
  assert.equal(warnings.length, 1)
  const [{ traceId, entry }] = warnings as [Warning]
  assert.equal(traceId, TRACE_ID)
  assert.equal(entry.runId, runId)
  assert.equal(entry.stepName, STEP)
  assert.equal(entry.attempt, attempt)
  assert.equal(entry.invocationId, deriveInvocationId(runId, STEP))
}

beforeEach(() => {
  h = new QueuedWorkflowHarness(new InMemoryWorkflowService())
  warnings = []
  pikkuState(null, 'package', 'singletonServices').logger =
    recordingLogger(warnings)
})

describe('crash recovery logging, queued', () => {
  test('a step taken back from a dead worker warns once, on the run trace', async () => {
    const runId = await startRun({ retries: 2 })
    await loseTheWorker(runId)

    const second = await claim(runId)

    assert.equal(second?.attemptCount, 2)
    assert.equal(await claim(runId), null, 'the new attempt holds the step')
    assertWarned(runId, 2)
    assert.match(warnings[0]!.entry.message, /running again as attempt 2/)
  })

  test('a `retries: 0` step that loses its worker warns that it failed', async () => {
    const runId = await startRun({ retries: 0 })
    await loseTheWorker(runId)

    assert.equal(await claim(runId), null)

    assertWarned(runId, 1)
    assert.match(warnings[0]!.entry.message, /no attempts left/)
  })

  test('a failure to read the trace does not cost the claim', async () => {
    const runId = await startRun({ retries: 2 })
    await loseTheWorker(runId)
    ;(h.ws as any).getRunIdentity = async () => {
      throw new Error('store down')
    }

    assert.equal((await claim(runId))?.attemptCount, 2)

    assert.equal(warnings.length, 1)
    assert.equal(warnings[0]!.traceId, undefined)
  })
})

describe('crash recovery logging, inline', () => {
  const running = async (stepOptions: { retries: number }) => {
    const runId = await startRun(stepOptions)
    const step = await h.ws.getStepState(runId, STEP)
    await h.ws.setStepRunning(step.stepId)
    return { runId, step: await h.ws.getStepState(runId, STEP) }
  }

  test('a step taken back warns once, on the run trace', async () => {
    const { runId, step } = await running({ retries: 2 })

    const next = await takeBackLostInlineStep(h.ws, runId, STEP, step)

    assert.equal(next.attemptCount, 2)
    assertWarned(runId, 2)
  })

  test('a `retries: 0` step warns that it failed', async () => {
    const { runId, step } = await running({ retries: 0 })

    await assert.rejects(takeBackLostInlineStep(h.ws, runId, STEP, step))

    assertWarned(runId, 1)
    assert.match(warnings[0]!.entry.message, /no attempts left/)
  })
})

describe('an ordinary retry is not a crash', () => {
  const flaky = () => {
    let calls = 0
    return async () => {
      if (++calls === 1) throw new Error('flaky')
      return {}
    }
  }

  test('a redelivered job for a step that threw claims quietly', async () => {
    const runId = await startRun({ retries: 2 })
    const held = await claim(runId)
    await h.ws.setStepError(held!.stepId, new Error('boom'), held!.attemptCount)

    assert.equal((await claim(runId))?.attemptCount, 2)
    assert.deepEqual(warnings, [])
  })

  for (const [mode, options] of [
    ['queued', undefined],
    ['inline', { inline: true }],
  ] as const) {
    test(`a ${mode} step that throws and retries logs neither`, async () => {
      h.register('flaky', { forward: flaky(), queued: mode === 'queued' })
      h.defineDsl('flow', async (w) => {
        await w.do('Flaky', 'flaky', {}, { retries: 1 })
      })

      const runId = await h.start('flow', {}, { type: 'test' }, options)

      assert.equal((await h.run(runId)).status, 'completed')
      assert.deepEqual(
        warnings.filter(({ entry }) => entry.runId),
        []
      )
    })
  }
})
