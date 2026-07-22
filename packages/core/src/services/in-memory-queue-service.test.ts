import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryQueueService } from './in-memory-queue-service.js'
import { wireQueueWorker } from '../wirings/queue/queue-runner.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
  } as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  } as any)
})

// Register a queue worker whose handler runs `behavior` (which may throw) and
// counts invocations. Returns the live call counter.
const registerWorker = (
  queueName: string,
  behavior: (count: number) => void
) => {
  const calls = { count: 0 }
  const funcId = `queue_${queueName}`
  pikkuState(null, 'queue', 'meta')[queueName] = {
    pikkuFuncId: funcId,
    name: queueName,
  }
  pikkuState(null, 'function', 'meta')[funcId] = {
    pikkuFuncId: funcId,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  } as any
  wireQueueWorker({
    name: queueName,
    func: {
      auth: false,
      func: async () => {
        calls.count++
        behavior(calls.count)
      },
    },
  } as any)
  return calls
}

const waitUntil = async (
  predicate: () => boolean,
  timeoutMs = 2000
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((r) => setTimeout(r, 10))
  }
  return predicate()
}

describe('InMemoryQueueService retry', () => {
  test('redelivers a transiently-failing job until it succeeds', async () => {
    const calls = registerWorker('flaky', (count) => {
      if (count <= 2) throw new Error(`transient ${count}`)
    })
    const queue = new InMemoryQueueService()

    await queue.add('flaky', {}, { attempts: 5, delay: 0 })

    // Succeeds on the 3rd attempt; must not exceed the configured attempts.
    assert.equal(await waitUntil(() => calls.count >= 3), true)
    await new Promise((r) => setTimeout(r, 150))
    assert.equal(calls.count, 3, 'should stop retrying once the job succeeds')
  })

  test('stops after `attempts` when a job always fails', async () => {
    const calls = registerWorker('always-fails', () => {
      throw new Error('boom')
    })
    const queue = new InMemoryQueueService()

    await queue.add('always-fails', {}, { attempts: 3, delay: 0 })

    assert.equal(await waitUntil(() => calls.count >= 3), true)
    await new Promise((r) => setTimeout(r, 150))
    assert.equal(calls.count, 3, 'must not redeliver beyond `attempts`')
  })

  test('runs once and does not retry when no attempts are configured', async () => {
    const calls = registerWorker('no-retry', () => {
      throw new Error('boom')
    })
    const queue = new InMemoryQueueService()

    await queue.add('no-retry', {}, { delay: 0 })

    await new Promise((r) => setTimeout(r, 150))
    assert.equal(calls.count, 1, 'a job without attempts runs exactly once')
  })
})
