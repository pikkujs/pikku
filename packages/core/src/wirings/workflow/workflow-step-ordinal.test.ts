import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import { deriveInvocationId } from './workflow-invocation-id.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

function inlineService() {
  pikkuState(null, 'package', 'singletonServices', {
    queueService: { add: async () => {} },
    logger: silentLogger,
  } as any)
  return new InMemoryWorkflowService()
}

describe('same step name invoked multiple times in one run', () => {
  test('each reach gets its own row + invocationId (no clobber)', async () => {
    const ws = inlineService()
    const runId = await ws.createRun('flow', {}, true, 'hash', { type: 'test' })
    ;(ws as any).inlineRuns.add(runId)

    // Two `do('process', fn)` reaches in the SAME replay (no reset between).
    const r1 = await (ws as any).inlineStep(
      runId,
      'process',
      async () => 'first'
    )
    const r2 = await (ws as any).inlineStep(
      runId,
      'process',
      async () => 'second'
    )

    assert.equal(r1, 'first')
    assert.equal(
      r2,
      'second',
      'second call must NOT return the first cached result'
    )

    // Distinct rows: 'process' (ordinal 0) and 'process#1'.
    const s0 = await ws.getStepState(runId, 'process')
    const s1 = await ws.getStepState(runId, 'process#1')
    assert.notEqual(s0.stepId, s1.stepId, 'distinct step rows')
    assert.equal(s0.result, 'first')
    assert.equal(s1.result, 'second')

    // Per-invocation dedupe keys differ (not per-name).
    assert.notEqual(
      deriveInvocationId(runId, 'process'),
      deriveInvocationId(runId, 'process#1')
    )
  })

  test('ordinal 0 is unchanged: a single call keeps the bare name + its old invocationId', async () => {
    const ws = inlineService()
    const runId = await ws.createRun('flow', {}, true, 'hash', { type: 'test' })
    ;(ws as any).inlineRuns.add(runId)

    await (ws as any).inlineStep(runId, 'solo', async () => 'x')
    // Stored under the bare name, and the dedupe key matches the pre-ordinal hash.
    const s = await ws.getStepState(runId, 'solo')
    assert.equal(s.result, 'x')
    await assert.rejects(
      ws.getStepState(runId, 'solo#1'),
      'no synthetic row for a single call'
    )
  })

  test('a fresh replay resets ordinals so the same call resolves to the same row', async () => {
    const ws = inlineService()
    const runId = await ws.createRun('flow', {}, true, 'hash', { type: 'test' })
    ;(ws as any).inlineRuns.add(runId)

    let runs = 0
    const r1 = await (ws as any).inlineStep(runId, 'once', async () => {
      runs++
      return 'v'
    })
    // Next replay resets the counter; the same `do('once')` must hit the cached
    // row, not mint 'once#1'.
    ;(ws as any).resetStepOrdinals(runId)
    const r2 = await (ws as any).inlineStep(runId, 'once', async () => {
      runs++
      return 'v2'
    })

    assert.equal(r1, 'v')
    assert.equal(r2, 'v', 'replay returns the cached result of the same step')
    assert.equal(runs, 1, 'step body ran exactly once across replays')
  })
})
