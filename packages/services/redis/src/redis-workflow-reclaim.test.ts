/**
 * The reclaim of a lost step. `ioredis-mock` runs the Lua script, so these
 * prove what the script checks: each test makes its change between the claim's
 * read and its write by hand. None of them is a race between two clients
 * against a real Redis. `ioredis-mock` cannot run the `ZRANGEBYSCORE` behind
 * `setStepRunning` and the step outcome writes, so step states are written to
 * the step's hash directly.
 */
import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import Redis from 'ioredis-mock'

import { InMemoryLeaseService } from '@pikku/core/services'
import { RedisWorkflowService } from './redis-workflow-service.js'

let ws: RedisWorkflowService
let redis: any
let runId: string
let stepId: string

beforeEach(async () => {
  redis = new Redis()
  await redis.flushall()
  ws = new RedisWorkflowService(redis, {
    keyPrefix: 'workflows',
    leaseService: new InMemoryLeaseService(),
  })
  runId = await ws.createRun('flow', {}, false, 'hash', {
    type: 'test',
  } as any)
  stepId = (
    await ws.insertStepState(runId, 'step-1', 'rpc.fn', {}, { retries: 3 })
  ).stepId
})

afterEach(() => {
  redis.disconnect()
})

const stepKey = () => `workflows:step:${runId}:step-1`

const loseWorker = () =>
  redis.hset(
    stepKey(),
    'status',
    'running',
    'leaseExpiresAt',
    String(Date.now() - 1000)
  )

const attemptsRecorded = () => redis.zcard(`workflows:step-history:${stepId}`)

const claim = () =>
  (ws as any).claimStepForExecution(runId, 'step-1', 'rpc.fn', 60_000)

/** Runs `change` right after the claim reads the step, before it writes. */
const afterClaimReads = (change: () => Promise<unknown>) => {
  const read = ws.getStepState.bind(ws)
  let changed = false
  ws.getStepState = async (...args) => {
    const state = await read(...args)
    if (!changed) {
      changed = true
      await change()
    }
    return state
  }
}

describe('reclaiming a step whose worker was lost', () => {
  test('takes it back as a new attempt under a fresh lease', async () => {
    await loseWorker()

    const claimed = await claim()

    assert.equal(claimed.attemptCount, 2)
    const stored = await ws.getStepState(runId, 'step-1')
    assert.equal(stored.status, 'running')
    assert.equal(stored.attemptCount, 2)
    assert.ok(stored.leaseExpiresAt!.getTime() > Date.now())
    assert.equal(await attemptsRecorded(), 2)
  })

  test('keeps a child saved after the claim read the step', async () => {
    await loseWorker()
    afterClaimReads(() => ws.setStepChildRunId(stepId, 'child-1'))

    assert.equal(await claim(), null)

    const stored = await ws.getStepState(runId, 'step-1')
    assert.equal(stored.childRunId, 'child-1')
    assert.equal(stored.attemptCount, 1)
  })

  for (const [what, change] of [
    [
      'renewed',
      () =>
        redis.hset(stepKey(), 'leaseExpiresAt', String(Date.now() + 60_000)),
    ],
    ['released', () => redis.hdel(stepKey(), 'leaseExpiresAt')],
  ] as const) {
    test(`leaves a step whose lease was ${what} after the claim read it`, async () => {
      await loseWorker()
      afterClaimReads(change)

      assert.equal(await claim(), null)

      assert.equal((await ws.getStepState(runId, 'step-1')).attemptCount, 1)
      assert.equal(await attemptsRecorded(), 1)
    })
  }

  test('resets nothing once the attempt has moved on', async () => {
    await loseWorker()
    afterClaimReads(() => redis.hset(stepKey(), 'attemptCount', '2'))

    assert.equal(await claim(), null)

    assert.equal((await ws.getStepState(runId, 'step-1')).attemptCount, 2)
    assert.equal(await attemptsRecorded(), 1)
  })

  test('resets nothing once the step has settled', async () => {
    await loseWorker()
    afterClaimReads(() =>
      redis.hset(stepKey(), 'status', 'succeeded', 'result', '{"ok":true}')
    )

    assert.equal(await claim(), null)

    const stored = await ws.getStepState(runId, 'step-1')
    assert.equal(stored.status, 'succeeded')
    assert.deepEqual(stored.result, { ok: true })
    assert.equal(stored.attemptCount, 1)
  })

  test('leaves the retry of a failed step to the claim still taking it', async () => {
    await redis.hset(
      stepKey(),
      'status',
      'failed',
      'leaseExpiresAt',
      String(Date.now() - 1000)
    )
    const refresh = ws.refreshStepLease.bind(ws)
    let redelivered: unknown = 'not delivered'
    // The redelivery lands before the claim has renewed the lease.
    ws.refreshStepLease = async (...args) => {
      ws.refreshStepLease = refresh
      redelivered = await claim()
      return refresh(...args)
    }

    const claimed = await claim()

    assert.equal(redelivered, null, 'the new attempt was claimed twice')
    assert.equal(claimed.attemptCount, 2)
    assert.equal((await ws.getStepState(runId, 'step-1')).attemptCount, 2)
    assert.equal(await attemptsRecorded(), 2)
  })

  test('takes back a retry whose claim died before renewing its lease', async () => {
    await redis.hset(stepKey(), 'status', 'failed')
    ws.refreshStepLease = async () => {
      throw new Error('worker died')
    }
    await assert.rejects(claim(), /worker died/)

    const stored = await ws.getStepState(runId, 'step-1')

    assert.ok(stored.leaseExpiresAt, 'a running step with no lease is stuck')
  })

  test('leaves the ordinary retry of a failed step clearing its child', async () => {
    await ws.setStepChildRunId(stepId, 'child-1')
    await redis.hset(stepKey(), 'status', 'failed')

    const claimed = await claim()

    assert.equal(claimed.attemptCount, 2)
    assert.equal((await ws.getStepState(runId, 'step-1')).childRunId, undefined)
  })
})
