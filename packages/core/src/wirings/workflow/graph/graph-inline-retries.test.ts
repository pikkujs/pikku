import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  QueuedWorkflowHarness,
  type Handler,
} from '../../../testing/service-tests/queued-workflow-harness.js'
import { RPCNotFoundError } from '../../rpc/rpc-runner.js'
import { InMemoryWorkflowService } from '../in-memory-workflow-service.js'

let h: QueuedWorkflowHarness

const register = (name: string, handler: Handler) =>
  h.register(name, { ...handler, queued: false })

const failing = (times: number) => {
  let calls = 0
  return {
    forward: async () => {
      if (++calls <= times) throw new Error(`failure ${calls}`)
      return { calls }
    },
  }
}

const start = async (name: string) => {
  const { runId } = await h.ws.startWorkflow(
    name,
    {},
    { type: 'test' },
    h.rpc as never,
    { inline: true }
  )
  return h.run(runId)
}

const calls = (rpc: string) =>
  h.log.filter((entry) => entry === `do:${rpc}`).length

beforeEach(() => {
  h = new QueuedWorkflowHarness(new InMemoryWorkflowService())
})

describe('retries on an inline graph node', () => {
  test('a node runs again until it succeeds, and the graph carries on', async () => {
    register('flaky', failing(2))
    register('next', h.ok())
    h.defineGraph('flow', 'flaky', {
      flaky: { retries: 2, next: 'next' },
      next: {},
    })

    const run = await start('flow')

    assert.equal(run.status, 'completed')
    assert.equal(calls('flaky'), 3)
    assert.equal(calls('next'), 1)
  })

  test('`retries` counts retries, so a node gets one more attempt', async () => {
    register('broken', failing(Infinity))
    h.defineGraph('flow', 'broken', { broken: { retries: 1 } })

    const run = await start('flow')

    assert.equal(run.status, 'failed')
    assert.equal(calls('broken'), 2)
  })

  test('a node that declares no retries runs once', async () => {
    register('broken', failing(Infinity))
    h.defineGraph('flow', 'broken', { broken: { retries: undefined } })

    assert.equal((await start('flow')).status, 'failed')
    assert.equal(calls('broken'), 1)
  })

  test('the delay is waited out between attempts', async () => {
    register('flaky', failing(1))
    h.defineGraph('flow', 'flaky', { flaky: { retries: 1, retryDelay: 30 } })

    const started = Date.now()
    assert.equal((await start('flow')).status, 'completed')
    assert.ok(Date.now() - started >= 25)
  })

  test('each fan-out item keeps its own budget', async () => {
    let calls = 0
    register('source', { forward: async () => ({ items: [1, 2] }) })
    register('item', {
      forward: async () => {
        if (++calls % 2 === 1) throw new Error('flaky')
        return {}
      },
    })
    h.defineGraph('flow', 'source', {
      source: { next: 'item' },
      item: {
        retries: 1,
        forEach: { $ref: 'source', path: 'items' },
        mode: 'sequential',
      },
    })

    assert.equal((await start('flow')).status, 'completed')
    assert.equal(calls, 4)
  })

  test('recovery takes over only once the retries are spent', async () => {
    register('flaky', failing(Infinity))
    register('rescue', h.ok())
    h.defineGraph('flow', 'flaky', {
      flaky: { retries: 1, recover: 'rescue' },
      rescue: {},
    })

    assert.equal((await start('flow')).status, 'completed')
    assert.equal(calls('flaky'), 2)
    assert.equal(calls('rescue'), 1)
  })

  test('a missing RPC suspends the run rather than retrying it', async () => {
    register('gone', {
      forward: async () => {
        throw new RPCNotFoundError('gone')
      },
    })
    h.defineGraph('flow', 'gone', { gone: { retries: 3 } })

    const run = await start('flow')

    assert.equal(run.status, 'suspended')
    assert.equal(run.error?.code, 'RPC_NOT_FOUND')
    assert.equal(calls('gone'), 1)
  })

  test('a cancelled run is not tried again', async () => {
    register('flaky', {
      forward: async (_data, wire) => {
        await h.ws.cancelRun(wire.workflow.runId, h.rpc as never)
        throw new Error('flaky')
      },
    })
    h.defineGraph('flow', 'flaky', { flaky: { retries: 3 } })

    assert.equal((await start('flow')).status, 'cancelled')
    assert.equal(calls('flaky'), 1)
  })
})
