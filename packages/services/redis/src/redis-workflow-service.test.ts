import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import Redis from 'ioredis-mock'

import { InMemoryLeaseService, LeaseTakenError } from '@pikku/core/services'
import { RedisWorkflowService } from './redis-workflow-service.js'

const KEY_PREFIX = 'workflows'

let ws: RedisWorkflowService
let redis: any
let leases: InMemoryLeaseService

const newRun = () =>
  ws.createRun('flow', {}, false, 'hash', { type: 'test' } as any)

beforeEach(() => {
  redis = new Redis()
  leases = new InMemoryLeaseService()
  ws = new RedisWorkflowService(redis, {
    keyPrefix: KEY_PREFIX,
    leaseService: leases,
  })
})

afterEach(() => {
  redis.disconnect()
})

describe('workflow run state in redis', () => {
  test('two branches setting different keys both survive', async () => {
    const runId = await newRun()

    await Promise.all([
      ws.updateRunState(runId, 'left', 'a'),
      ws.updateRunState(runId, 'right', 'b'),
    ])

    assert.deepEqual(
      await ws.getRunState(runId),
      { left: 'a', right: 'b' },
      'a parallel branch overwrote the other branch’s state'
    )
  })

  test('many concurrent writers all land', async () => {
    const runId = await newRun()
    const keys = Array.from({ length: 20 }, (_, i) => `k${i}`)

    await Promise.all(keys.map((k, i) => ws.updateRunState(runId, k, i)))

    const state = await ws.getRunState(runId)
    assert.equal(Object.keys(state).length, keys.length)
    keys.forEach((k, i) => assert.equal(state[k], i))
  })

  test('an empty array stays an array when another key is written', async () => {
    const runId = await newRun()

    await ws.updateRunState(runId, 'items', [])
    await ws.updateRunState(runId, 'count', 0)

    const state = await ws.getRunState(runId)
    assert.ok(
      Array.isArray(state.items),
      `an empty array came back as ${JSON.stringify(state.items)}`
    )
    assert.equal(state.count, 0)
  })

  test('values keep their types, including null and nested objects', async () => {
    const runId = await newRun()

    await ws.updateRunState(runId, 'nothing', null)
    await ws.updateRunState(runId, 'nested', { a: [1, { b: true }] })
    await ws.updateRunState(runId, 'flag', false)

    assert.deepEqual(await ws.getRunState(runId), {
      nothing: null,
      nested: { a: [1, { b: true }] },
      flag: false,
    })
  })

  test('a later write to the same key replaces it', async () => {
    const runId = await newRun()

    await ws.updateRunState(runId, 'attempt', 1)
    await ws.updateRunState(runId, 'attempt', 2)

    assert.deepEqual(await ws.getRunState(runId), { attempt: 2 })
  })

  test('the state of a run that has none is empty', async () => {
    assert.deepEqual(await ws.getRunState(await newRun()), {})
  })

  test('state written before the per-key layout is still readable', async () => {
    const runId = await newRun()
    const redis = (ws as any).redis
    await redis.hset(
      (ws as any).runKey(runId),
      'state',
      JSON.stringify({ legacy: 'kept', shared: 'old' })
    )

    assert.deepEqual(await ws.getRunState(runId), {
      legacy: 'kept',
      shared: 'old',
    })

    await ws.updateRunState(runId, 'shared', 'new')
    await ws.updateRunState(runId, 'fresh', 1)

    assert.deepEqual(
      await ws.getRunState(runId),
      { legacy: 'kept', shared: 'new', fresh: 1 },
      'a run in flight across the deploy lost the state it already had'
    )
  })
})

describe('RedisWorkflowService locks on the lease service it is given', () => {
  test('a run held on the lease service is not orchestrated here', async () => {
    const runId = await newRun()
    await leases.acquire(`workflow-run:${runId}`, 'another-worker', 60_000)

    let entered = false
    await assert.rejects(
      ws.withRunLease(runId, async () => {
        entered = true
      }),
      LeaseTakenError
    )
    assert.equal(entered, false)
  })

  test('a step held on the lease service is not claimed here', async () => {
    const runId = await newRun()
    await ws.insertStepState(runId, 'charge', 'flow', {})
    await leases.acquire(
      `workflow-step:${runId}:charge`,
      'another-worker',
      60_000
    )

    const claimed = await (ws as any).claimStepForExecution(
      runId,
      'charge',
      'flow',
      60_000
    )

    assert.equal(claimed, null)
    assert.equal((await ws.getStepState(runId, 'charge')).status, 'pending')
  })
})

describe('a step parked on a child run', () => {
  const park = async (retries: number) => {
    const runId = await newRun()
    const step = await ws.insertStepState(
      runId,
      'child',
      'flow',
      {},
      { retries }
    )
    // ioredis-mock cannot run `setStepRunning`'s history read, so the status
    // is written as that method leaves it.
    await redis.hset((ws as any).stepKey(runId, 'child'), 'status', 'running')
    await ws.setStepChildRunId(step.stepId, 'child-1')
    await redis.hset((ws as any).stepKey(runId, 'child'), 'leaseExpiresAt', '1')
    return { runId, stepId: step.stepId }
  }

  test('reading the step reports its child', async () => {
    const { runId } = await park(2)

    assert.equal((await ws.getStepState(runId, 'child')).childRunId, 'child-1')
  })

  for (const retries of [2, 0]) {
    test(`is not taken back when its lease lapses (retries ${retries})`, async () => {
      const { runId } = await park(retries)

      const claimed = await (ws as any).claimStepForExecution(
        runId,
        'child',
        'flow',
        60_000
      )

      assert.equal(claimed, null)
      const after = await ws.getStepState(runId, 'child')
      assert.equal(after.status, 'running')
      assert.equal(after.attemptCount, 1)
    })
  }

  test('a retry drops the failed attempt’s child', async () => {
    const { runId, stepId } = await park(2)
    await redis.hset((ws as any).stepKey(runId, 'child'), 'status', 'failed')

    await ws.createRetryAttempt(stepId, 'pending')

    assert.equal((await ws.getStepState(runId, 'child')).childRunId, undefined)
  })
})

describe('a lost step taken back in redis', () => {
  test('each claim returns the attempt it acquired', async () => {
    const runId = await newRun()
    await ws.insertStepState(
      runId,
      'charge',
      'flow',
      {},
      {
        retries: 3,
      }
    )
    const key = `${KEY_PREFIX}:step:${runId}:charge`
    const lapse = () =>
      redis.hset(key, 'status', 'running', 'leaseExpiresAt', '1')
    const claim = () =>
      (ws as any).claimStepForExecution(runId, 'charge', 'flow', 60_000)
    await lapse()

    // The first claim's lease lapses while it is still writing its history.
    let later: any
    const save = (ws as any).saveStepHistory.bind(ws)
    ;(ws as any).saveStepHistory = async (...args: unknown[]) => {
      ;(ws as any).saveStepHistory = save
      await save(...args)
      await lapse()
      later = await claim()
    }

    const first = await claim()

    assert.equal(later.attemptCount, 3)
    assert.equal(
      first.attemptCount,
      2,
      'the claim reported an attempt another worker took'
    )
    assert.equal(first.status, 'running')
    assert.ok(first.leaseExpiresAt.getTime() > Date.now())
  })
})

describe('a step’s timeout in redis', () => {
  test('is kept through insert, claim and retry', async () => {
    const runId = await newRun()
    const claim = () =>
      (ws as any).claimStepForExecution(runId, 'step-1', 'rpc.fn', 60_000)
    const inserted = await ws.insertStepState(
      runId,
      'step-1',
      'rpc.fn',
      {},
      { retries: 2, timeout: '30000ms' }
    )
    assert.equal(inserted.timeout, '30000ms')

    // `ioredis-mock` cannot run the history update behind the transition
    // methods, so the lost and failed states are written to the hash.
    const key = `${KEY_PREFIX}:step:${runId}:step-1`
    await redis.hset(key, 'status', 'running', 'leaseExpiresAt', '1')
    const first = await claim()
    assert.equal(first.timeout, '30000ms')
    await redis.hset(key, 'status', 'failed')
    const reclaimed = await claim()
    assert.equal(reclaimed.timeout, '30000ms')
    assert.equal((await ws.getStepState(runId, 'step-1')).timeout, '30000ms')
  })
})
