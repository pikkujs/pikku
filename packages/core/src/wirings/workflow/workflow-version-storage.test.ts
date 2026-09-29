import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

const setup = () => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: silentLogger,
  } as any)
  const meta = pikkuState(null, 'workflows', 'meta')
  meta.flow = {
    name: 'flow',
    pikkuFuncId: 'flow',
    source: 'graph',
    graphHash: 'hash-1',
  } as any
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

    meta.flow = { ...meta.flow, graphHash: 'hash-2' } as any
    await createRun(service, 'hash-2')

    assert.ok(await service.getWorkflowVersion('flow', 'hash-1'))
    assert.ok(await service.getWorkflowVersion('flow', 'hash-2'))
  })

  test('a hash that does not match the loaded definition is not stored', async () => {
    const { service } = setup()
    await createRun(service, 'hash-other')

    assert.equal(await service.getWorkflowVersion('flow', 'hash-other'), null)
  })
})
