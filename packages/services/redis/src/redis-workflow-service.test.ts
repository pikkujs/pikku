import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import Redis from 'ioredis-mock'

import { RedisWorkflowService } from './redis-workflow-service.js'

let ws: RedisWorkflowService
let redis: any

const newRun = () =>
  ws.createRun('flow', {}, false, 'hash', { type: 'test' } as any)

beforeEach(() => {
  redis = new Redis()
  ws = new RedisWorkflowService(redis)
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
