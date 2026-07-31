import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

function inlineService() {
  pikkuState(null, 'package', 'singletonServices', {
    queueService: { add: async () => {} },
    logger: silentLogger,
  } as any)
  return new InMemoryWorkflowService()
}

function countStepReads(ws: any) {
  const counter = { reads: 0 }
  const original = ws.getStepState.bind(ws)
  ws.getStepState = async (...args: any[]) => {
    counter.reads++
    return original(...args)
  }
  return counter
}

async function seedRun(ws: any, steps: number) {
  const runId = await ws.createRun('flow', {}, true, 'hash', { type: 'test' })
  ws.registerInlineRun(runId)
  await ws.beginReplay(runId)
  for (let i = 0; i < steps; i++) {
    await ws.inlineStep(runId, `step-${i}`, async () => i)
  }
  ws.endReplay(runId)
  return runId
}

describe('replay reads the run steps once, not once per step', () => {
  test('a replay over completed steps issues no per-step reads', async () => {
    const ws: any = inlineService()
    const runId = await seedRun(ws, 8)

    const counter = countStepReads(ws)
    await ws.beginReplay(runId)
    for (let i = 0; i < 8; i++) {
      await ws.inlineStep(runId, `step-${i}`, async () => {
        throw new Error(
          `step-${i} re-ran instead of replaying its cached result`
        )
      })
    }
    ws.endReplay(runId)

    assert.equal(
      counter.reads,
      0,
      `the replay still read each step individually (${counter.reads} reads for 8 steps)`
    )
  })

  test('the snapshot still returns each step its own cached result', async () => {
    const ws: any = inlineService()
    const runId = await seedRun(ws, 4)

    await ws.beginReplay(runId)
    const replayed: unknown[] = []
    for (let i = 0; i < 4; i++) {
      replayed.push(
        await ws.inlineStep(runId, `step-${i}`, async () => 'must not run')
      )
    }
    ws.endReplay(runId)

    assert.deepEqual(replayed, [0, 1, 2, 3])
  })

  test('a step reached for the first time mid-replay is created, not mistaken for a miss', async () => {
    const ws: any = inlineService()
    const runId = await seedRun(ws, 2)

    await ws.beginReplay(runId)
    await ws.inlineStep(runId, 'step-0', async () => 'cached')
    await ws.inlineStep(runId, 'step-1', async () => 'cached')
    const fresh = await ws.inlineStep(runId, 'step-new', async () => 'ran')
    ws.endReplay(runId)

    assert.equal(fresh, 'ran')
    assert.equal((await ws.getStepState(runId, 'step-new')).result, 'ran')
  })

  test('a second replay sees what the previous one wrote', async () => {
    const ws: any = inlineService()
    const runId = await seedRun(ws, 1)

    await ws.beginReplay(runId)
    await ws.inlineStep(runId, 'step-0', async () => 'must not run')
    await ws.inlineStep(runId, 'late', async () => 'first')
    ws.endReplay(runId)

    await ws.beginReplay(runId)
    await ws.inlineStep(runId, 'step-0', async () => 'must not run')
    const late = await ws.inlineStep(runId, 'late', async () => 'must not run')
    ws.endReplay(runId)

    assert.equal(
      late,
      'first',
      'the second replay re-ran a step the first one completed'
    )
  })

  test('outside a replay, steps are still read one at a time', async () => {
    const ws: any = inlineService()
    const runId = await seedRun(ws, 3)

    const counter = countStepReads(ws)
    await ws.inlineStep(runId, 'step-0', async () => 'must not run')

    assert.equal(
      counter.reads,
      1,
      'a call outside a replay must read the step directly rather than trust a stale snapshot'
    )
  })

  test('a backend with no bulk read falls back to per-step reads', async () => {
    const ws: any = inlineService()
    const runId = await seedRun(ws, 3)
    ws.listStepStates = async () => null

    const counter = countStepReads(ws)
    await ws.beginReplay(runId)
    for (let i = 0; i < 3; i++) {
      await ws.inlineStep(runId, `step-${i}`, async () => 'must not run')
    }
    ws.endReplay(runId)

    assert.equal(counter.reads, 3)
  })
})
