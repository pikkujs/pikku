import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

/**
 * Captures what the workflow service hands the queue, so a test can tell
 * whether core serialised the payload on the way past.
 */
function serviceWithCapturingQueue() {
  const added: Array<{ queueName: string; data: any }> = []
  pikkuState(null, 'package', 'singletonServices', {
    queueService: {
      add: async (queueName: string, data: any) => {
        added.push({ queueName, data })
        return 'job-1'
      },
    },
    logger: silentLogger,
  } as any)
  return { ws: new InMemoryWorkflowService() as any, added }
}

describe('dispatching a step does not serialise the payload twice', () => {
  test('the queue receives the payload core was given', async () => {
    const { ws, added } = serviceWithCapturingQueue()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    const payload = { when: new Date('2020-01-01T00:00:00.000Z'), n: 1 }

    await ws.queueStepWorker(runId, 'step-1', 'rpc.fn', payload)

    assert.equal(added.length, 1)
    assert.ok(
      added[0]!.data.data.when instanceof Date,
      'core round-tripped the payload through JSON before handing it to a queue that serialises it anyway'
    )
    assert.equal(added[0]!.data.data.n, 1)
    assert.equal(added[0]!.data.runId, runId)
    assert.equal(added[0]!.data.stepName, 'step-1')
  })

  test('a payload the queue cannot serialise is still the queue’s problem, not a silent drop', async () => {
    const { ws, added } = serviceWithCapturingQueue()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    const circular: any = { name: 'loop' }
    circular.self = circular

    await ws.queueStepWorker(runId, 'step-1', 'rpc.fn', circular)

    assert.equal(added[0]!.data.data.self, added[0]!.data.data)
  })
})

describe('resolving a dynamic workflow', () => {
  test('asks for the one workflow rather than listing them all', async () => {
    const { ws } = serviceWithCapturingQueue()
    for (let i = 0; i < 5; i++) {
      await ws.upsertWorkflowVersion(
        `ai:agent:wf-${i}`,
        `hash-${i}`,
        { nodes: {}, source: 'ai-agent' },
        'ai-agent'
      )
    }

    let listed = 0
    const listAll = ws.getAIGeneratedWorkflows.bind(ws)
    ws.getAIGeneratedWorkflows = async (...args: any[]) => {
      listed++
      return listAll(...args)
    }

    const match = await ws.getDynamicWorkflow('ai:agent:wf-3')
    assert.equal(match?.graphHash, 'hash-3')
    assert.equal(
      listed,
      0,
      'resolving one name still walked and parsed every dynamic workflow in the deployment'
    )
  })

  test('a name that is not a dynamic workflow resolves to null', async () => {
    const { ws } = serviceWithCapturingQueue()
    assert.equal(await ws.getDynamicWorkflow('ai:agent:missing'), null)
  })

  test('an inactive version is not resolved', async () => {
    const { ws } = serviceWithCapturingQueue()
    await ws.upsertWorkflowVersion(
      'ai:agent:retired',
      'hash-r',
      { nodes: {} },
      'ai-agent',
      'archived'
    )
    assert.equal(await ws.getDynamicWorkflow('ai:agent:retired'), null)
  })
})
