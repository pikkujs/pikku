import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import type { ScenarioActor } from '../../services/scenario-actors-service.js'

const noopLogger = { error() {}, info() {}, warn() {}, debug() {} }

const fakeActor = (
  name: string,
  handler: (rpcName: string, data: unknown) => Promise<unknown>
): ScenarioActor & { calls: Array<{ rpcName: string; data: unknown }> } => {
  const calls: Array<{ rpcName: string; data: unknown }> = []
  return {
    name,
    email: `${name}@actors.local`,
    calls,
    invoke: async (rpcName: string, data: unknown) => {
      calls.push({ rpcName, data })
      return handler(rpcName, data)
    },
  }
}

const setup = async (
  ws: InMemoryWorkflowService,
  services: Record<string, unknown> = {}
) => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: noopLogger,
    ...services,
  } as any)
  const runId = await ws.createRun('scenarioTest', {}, true, 'hash', {
    type: 'test',
  } as any)
  ws.registerInlineRun(runId)
  return runId
}

describe('scenario actor steps (workflow.do with `actor`)', () => {
  beforeEach(() => resetPikkuState())

  test('routes through the actor over the real transport, never internal rpc', async () => {
    const ws = new InMemoryWorkflowService()
    const customer = fakeActor('customer', async () => ({ todoId: 't1' }))
    let internalCalls = 0

    const runId = await setup(ws)
    const rpc = {
      rpcWithWire: async () => {
        internalCalls++
        return {}
      },
    }

    const wire = ws.createWorkflowWire('scenarioTest', runId, rpc)
    const result = await wire.do(
      'customer creates todo',
      'createTodo',
      { title: 'x' },
      { actor: customer }
    )

    assert.deepEqual(result, { todoId: 't1' })
    assert.deepEqual(customer.calls, [
      { rpcName: 'createTodo', data: { title: 'x' } },
    ])
    assert.equal(internalCalls, 0, 'actor steps must NOT dispatch internally')
  })

  test('step is recorded durably and replay returns the cached result without re-invoking', async () => {
    const ws = new InMemoryWorkflowService()
    let invocations = 0
    const yasser = fakeActor('yasser', async () => ({ n: ++invocations }))
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    const first = await wire.do('step', 'someRpc', {}, { actor: yasser })
    assert.deepEqual(first, { n: 1 })

    // Simulate replay: reset per-run ordinals so the same logical step name
    // resolves to the same durable step key.
    ;(ws as any).resetStepOrdinals(runId)
    const replayWire = ws.createWorkflowWire('scenarioTest', runId, {})
    const replayed = await replayWire.do(
      'step',
      'someRpc',
      {},
      { actor: yasser }
    )

    assert.deepEqual(replayed, { n: 1 }, 'replay must return the cached result')
    assert.equal(invocations, 1, 'the actor must not be re-invoked on replay')
  })

  test('actor steps never queue, even when the function is queue-eligible', async () => {
    const ws = new InMemoryWorkflowService()
    let queued = 0
    const customer = fakeActor('customer', async () => ({}))
    const runId = await setup(ws, {
      queueService: {
        add: async () => {
          queued++
        },
      },
    })
    // Function meta says this RPC would normally dispatch via the queue.
    pikkuState(null, 'function', 'meta').queuedRpc = {
      pikkuFuncId: 'queuedRpc',
      workflowQueued: true,
    } as any

    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.do('step', 'queuedRpc', {}, { actor: customer })

    assert.equal(queued, 0, 'actor steps are outbound HTTP — never queued')
    assert.equal(customer.calls.length, 1)
  })

  test('actor step failure surfaces the actor error and fails after retries', async () => {
    const ws = new InMemoryWorkflowService()
    const broken = fakeActor('broken', async () => {
      throw new Error("[scenario] 'createTodo' as 'broken' returned 403: nope")
    })
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.do('step', 'createTodo', {}, { actor: broken, retries: 2 }),
      /returned 403/
    )
    assert.equal(broken.calls.length, 2, 'retries bounds total attempts')
  })
})

describe('workflow.expectEventually', () => {
  beforeEach(() => resetPikkuState())

  test('polls as the actor until the predicate passes', async () => {
    const ws = new InMemoryWorkflowService()
    let polls = 0
    const sarah = fakeActor('sarah', async () => ({
      notifications: ++polls >= 3 ? ['ping'] : [],
    }))
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    const result = await wire.expectEventually(
      'sarah sees the notification',
      'getNotifications',
      {},
      (out: any) => out.notifications.length > 0,
      { actor: sarah, within: 2_000, interval: 5 }
    )

    assert.deepEqual(result, { notifications: ['ping'] })
    assert.equal(polls, 3)
  })

  test('fails with the last result when the deadline passes', async () => {
    const ws = new InMemoryWorkflowService()
    const sarah = fakeActor('sarah', async () => ({ notifications: [] }))
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.expectEventually(
        'never arrives',
        'getNotifications',
        {},
        (out: any) => out.notifications.length > 0,
        { actor: sarah, within: 30, interval: 5, retries: 0 }
      ),
      /did not pass within 30ms.*notifications/
    )
  })

  test('polls internally (rpcWithWire) when no actor is given', async () => {
    const ws = new InMemoryWorkflowService()
    let polls = 0
    const runId = await setup(ws)
    const rpc = {
      rpcWithWire: async () => ({ ready: ++polls >= 2 }),
    }
    const wire = ws.createWorkflowWire('scenarioTest', runId, rpc)

    const result = await wire.expectEventually(
      'job finishes',
      'getJob',
      {},
      (out: any) => out.ready,
      { within: 2_000, interval: 5 }
    )
    assert.deepEqual(result, { ready: true })
    assert.equal(polls, 2)
  })
})
