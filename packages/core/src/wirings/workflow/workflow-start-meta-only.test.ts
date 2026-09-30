import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { WorkflowNotFoundError } from './workflow-errors.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

/**
 * A deployed unit that calls `rpc.startWorkflow('x')` carries x's meta but not
 * its registration: the workflow function lives in x's orchestrator unit, which
 * consumes the orchestrator queue. Starting a queued run must work from meta
 * alone; only an inline run, which executes the function here, needs it.
 */
describe('startWorkflow in a unit that holds only the workflow meta', () => {
  const workflowName = 'metaOnlyFlow'
  let queued: Array<{ queue: string; data: unknown }>

  beforeEach(() => {
    resetPikkuState()
    queued = []
    pikkuState(null, 'workflows', 'meta')[workflowName] = {
      name: workflowName,
      pikkuFuncId: workflowName,
      source: 'dsl',
      graphHash: 'meta-only-hash',
    } as any
  })

  const withQueue = () =>
    pikkuState(null, 'package', 'singletonServices', {
      logger: silentLogger,
      queueService: {
        add: async (queue: string, data: unknown) => {
          queued.push({ queue, data })
        },
      },
    } as any)

  test('a queued start creates the run and hands it to the orchestrator queue', async () => {
    withQueue()
    const ws = new InMemoryWorkflowService()

    const { runId } = await ws.startWorkflow(workflowName, {}, {} as any, {})

    const run = await ws.getRun(runId)
    assert.equal(run?.workflow, workflowName)
    assert.notEqual(run?.inline, true)
    assert.equal(queued.length, 1)
    assert.deepEqual(queued[0]!.data, { runId })
  })

  test('an inline start still needs the registration', async () => {
    withQueue()
    const ws = new InMemoryWorkflowService()

    await assert.rejects(
      ws.startWorkflow(workflowName, {}, {} as any, {}, { inline: true }),
      WorkflowNotFoundError
    )
    assert.equal(queued.length, 0)
  })

  test('with no queue service the run is inline, so the registration is needed', async () => {
    pikkuState(null, 'package', 'singletonServices', {
      logger: silentLogger,
    } as any)
    const ws = new InMemoryWorkflowService()

    await assert.rejects(
      ws.startWorkflow(workflowName, {}, {} as any, {}),
      WorkflowNotFoundError
    )
  })

  test('a workflow with no meta is still not found', async () => {
    withQueue()
    const ws = new InMemoryWorkflowService()

    await assert.rejects(
      ws.startWorkflow('unknownFlow', {}, {} as any, {}),
      WorkflowNotFoundError
    )
    assert.equal(queued.length, 0)
  })
})
