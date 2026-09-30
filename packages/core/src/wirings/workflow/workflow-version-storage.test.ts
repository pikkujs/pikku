import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

const v1 = {
  name: 'flow',
  pikkuFuncId: 'flow',
  source: 'graph',
  graphHash: 'hash-1',
  entryNodeIds: ['a'],
  nodes: { a: { nodeId: 'a', rpcName: 'doA' } },
} as any

const v2 = {
  ...v1,
  graphHash: 'hash-2',
  nodes: {
    a: { nodeId: 'a', rpcName: 'doA', next: 'c' },
    c: { nodeId: 'c', rpcName: 'doC' },
  },
} as any

const rpc = { rpcWithWire: async () => ({}) } as any

const finishStepA = async (service: InMemoryWorkflowService, runId: string) => {
  const step = await service.insertStepState(runId, 'a', 'doA', {})
  await service.setStepRunning(step.stepId)
  await service.setStepResult(step.stepId, { ok: true })
}

const setup = () => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: silentLogger,
  } as any)
  const meta = pikkuState(null, 'workflows', 'meta')
  meta.flow = v1
  return { service: new InMemoryWorkflowService(), meta }
}

const createRun = (service: InMemoryWorkflowService, graphHash: string) =>
  service.createRun('flow', {}, false, graphHash, { type: 'test' })

describe('workflow version storage', () => {
  test('creating a run stores the graph it started on', async () => {
    const { service } = setup()
    await createRun(service, 'hash-1')

    const version = await service.getWorkflowVersion('flow', 'hash-1')
    assert.equal(version?.graph.graphHash, 'hash-1')
    assert.equal(version?.source, 'graph')
  })

  test('the stored graph survives the definition changing', async () => {
    const { service, meta } = setup()
    await createRun(service, 'hash-1')

    meta.flow = v2
    await createRun(service, 'hash-2')

    assert.ok(await service.getWorkflowVersion('flow', 'hash-1'))
    assert.ok(await service.getWorkflowVersion('flow', 'hash-2'))
  })

  test('a hash that does not match the loaded definition is not stored', async () => {
    const { service } = setup()
    await createRun(service, 'hash-other')

    assert.equal(await service.getWorkflowVersion('flow', 'hash-other'), null)
  })

  test('a run resumed after the definition changed finishes on its own graph', async () => {
    const { service, meta } = setup()
    const runId = await createRun(service, 'hash-1')
    await finishStepA(service, runId)

    meta.flow = v2
    await service.runWorkflowJob(runId, rpc)

    const run = await service.getRun(runId)
    assert.equal(run?.error?.code, undefined)
    assert.equal(run?.status, 'completed')
  })

  test('a graph run resumes on its own graph after the workflow became complex', async () => {
    const { service, meta } = setup()
    const runId = await createRun(service, 'hash-1')
    await finishStepA(service, runId)

    meta.flow = { ...v2, source: 'complex' }
    await service.runWorkflowJob(runId, rpc)

    const run = await service.getRun(runId)
    assert.equal(run?.error?.code, undefined)
    assert.equal(run?.status, 'completed')
  })

  test('a run whose graph was never stored cannot resume after a change', async () => {
    const { service, meta } = setup()
    meta.flow = { ...v1, graphHash: 'hash-0' }
    const runId = await createRun(service, 'hash-1')
    await finishStepA(service, runId)

    meta.flow = v2
    await service.runWorkflowJob(runId, rpc)

    const run = await service.getRun(runId)
    assert.equal(run?.status, 'failed')
    assert.equal(run?.error?.code, 'VERSION_NOT_FOUND')
  })
})
