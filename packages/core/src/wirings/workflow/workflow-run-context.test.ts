import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

function service() {
  pikkuState(null, 'package', 'singletonServices', {
    queueService: { add: async () => {} },
    logger: silentLogger,
  } as any)
  return new InMemoryWorkflowService() as any
}

const newRun = (ws: any, inline = false) =>
  ws.createRun('flow', {}, inline, 'hash', { type: 'test' })

const trackDetaches = (ws: any): string[] => {
  const detached: string[] = []
  ws.setRunExtension(() => ({
    attachRunContext: async () => {},
    detachRunContext: (runId: string) => detached.push(runId),
    decorateRunWire: () => {},
    decorateWorkflowWire: () => {},
    onBeforeRunFunc: async () => {},
    onAfterRunFunc: async () => {},
  }))
  return detached
}

describe('per-run state is released when the run stops executing here', () => {
  test('a finished replay leaves nothing behind', async () => {
    const ws = service()
    const runId = await newRun(ws)

    await ws.beginReplay(runId)
    await ws.inlineStep(runId, 'a', async () => 1)
    ws.endReplay(runId)

    assert.equal(
      ws.runContexts.size,
      0,
      'the replay held on to its ordinals, lineage or step snapshot'
    )
  })

  test('the step the walk last reached does not survive its replay', async () => {
    const ws = service()
    const runId = await newRun(ws)

    await ws.beginReplay(runId)
    await ws.inlineStep(runId, 'a', async () => 1)
    ws.endReplay(runId)

    assert.equal(ws.lastStepName(runId), undefined)
  })

  test('unregistering an inline run releases it', async () => {
    const ws = service()
    const runId = await newRun(ws)

    ws.registerInlineRun(runId)
    assert.equal(ws.isInline(runId), true)

    ws.unregisterInlineRun(runId)
    assert.equal(ws.isInline(runId), false)
    assert.equal(ws.runContexts.size, 0)
  })

  test('a replay inside an inline run does not release the inline flag', async () => {
    const ws = service()
    const runId = await newRun(ws)

    ws.registerInlineRun(runId)
    await ws.beginReplay(runId)
    ws.endReplay(runId)

    assert.equal(
      ws.isInline(runId),
      true,
      'ending a replay dropped state the run still needs'
    )
  })

  test("a queued run's extension context is released when the run reaches a terminal state", async () => {
    const ws = service()
    const runId = await newRun(ws)
    const detached = trackDetaches(ws)

    await ws.updateRunStatus(runId, 'completed', null)

    assert.deepEqual(
      detached,
      [runId],
      'an extension holds live per-run state; a completed run must not keep it'
    )
    assert.equal(ws.runContexts.size, 0)
  })

  test('a suspended run keeps its extension context, because it can still be resumed', async () => {
    const ws = service()
    const runId = await newRun(ws)
    const detached = trackDetaches(ws)

    await ws.updateRunStatus(runId, 'suspended')

    assert.deepEqual(detached, [])
  })
})

describe('a replay reads the run once', () => {
  test('the steps of a replay share one read of the run', async () => {
    const ws = service()
    const runId = await newRun(ws)

    let reads = 0
    const getRun = ws.getRun.bind(ws)
    ws.getRun = async (id: string) => {
      reads++
      return getRun(id)
    }

    await ws.beginReplay(runId)
    await ws.getRunIdentity(runId)
    await ws.getRunIdentity(runId)
    await ws.getRunIdentity(runId)
    ws.endReplay(runId)

    assert.equal(reads, 1, `the run was read ${reads} times in one replay`)
  })

  test('the next replay re-reads the run rather than trusting the last one', async () => {
    const ws = service()
    const runId = await newRun(ws)

    let reads = 0
    const getRun = ws.getRun.bind(ws)
    ws.getRun = async (id: string) => {
      reads++
      return getRun(id)
    }

    await ws.beginReplay(runId)
    await ws.getRunIdentity(runId)
    ws.endReplay(runId)
    await ws.beginReplay(runId)
    await ws.getRunIdentity(runId)
    ws.endReplay(runId)

    assert.equal(reads, 2)
  })

  test('outside a replay the run is read every time', async () => {
    const ws = service()
    const runId = await newRun(ws)

    let reads = 0
    const getRun = ws.getRun.bind(ws)
    ws.getRun = async (id: string) => {
      reads++
      return getRun(id)
    }

    await ws.getRunIdentity(runId)
    await ws.getRunIdentity(runId)

    assert.equal(reads, 2, 'a cached run outside a replay would go stale')
    assert.equal(ws.runContexts.size, 0, 'reading a run must not create state')
  })
})
