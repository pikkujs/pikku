import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { mapConcurrent } from './map-concurrent.js'

const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

describe('mapConcurrent', () => {
  it('returns results in input order whatever order the calls finish in', async () => {
    const out = await mapConcurrent(
      [30, 1, 15],
      async (ms, i) => {
        await new Promise((r) => setTimeout(r, ms))
        return `${i}:${ms}`
      },
      { concurrency: 3 }
    )
    assert.deepEqual(out, ['0:30', '1:1', '2:15'])
  })

  it('never has more than `concurrency` calls in flight', async () => {
    let running = 0
    let peak = 0
    await mapConcurrent(
      Array.from({ length: 12 }, (_, i) => i),
      async () => {
        peak = Math.max(peak, ++running)
        await tick()
        running--
      },
      { concurrency: 3 }
    )
    assert.equal(peak, 3)
  })

  it('concurrency 1 is sequential', async () => {
    const log: string[] = []
    await mapConcurrent(
      ['a', 'b', 'c'],
      async (x) => {
        log.push(`start ${x}`)
        await tick()
        log.push(`end ${x}`)
      },
      { concurrency: 1 }
    )
    assert.deepEqual(log, [
      'start a',
      'end a',
      'start b',
      'end b',
      'start c',
      'end c',
    ])
  })

  it('handles an empty list and a concurrency above the length', async () => {
    assert.deepEqual(
      await mapConcurrent([], async () => 1, { concurrency: 4 }),
      []
    )
    assert.deepEqual(
      await mapConcurrent([1, 2], async (x) => x * 2, { concurrency: 50 }),
      [2, 4]
    )
  })

  it('fails fast: the first rejection rejects and nothing new starts', async () => {
    const started: number[] = []
    await assert.rejects(
      mapConcurrent(
        [0, 1, 2, 3, 4, 5],
        async (x) => {
          started.push(x)
          await tick()
          if (x === 1) throw new Error('boom')
        },
        { concurrency: 2 }
      ),
      /boom/
    )
    await new Promise((r) => setTimeout(r, 20))
    assert.ok(!started.includes(5), `started ${started}`)
    assert.ok(started.length < 6)
  })

  it('rejects with signal.reason when aborted, starting no further item', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const started: number[] = []
    await assert.rejects(
      mapConcurrent(
        [0, 1, 2, 3],
        async (x) => {
          started.push(x)
          if (x === 1) controller.abort(reason)
          await tick()
        },
        { concurrency: 1, signal: controller.signal }
      ),
      (e) => e === reason
    )
    assert.deepEqual(started, [0, 1])
  })

  it('rejects at once for an already aborted signal and passes the signal to fn', async () => {
    const aborted = AbortSignal.abort(new Error('early'))
    let called = false
    await assert.rejects(
      mapConcurrent([1], async () => (called = true), {
        concurrency: 1,
        signal: aborted,
      }),
      /early/
    )
    assert.equal(called, false)

    const controller = new AbortController()
    const seen: Array<AbortSignal | undefined> = []
    await mapConcurrent([1], async (_x, _i, signal) => void seen.push(signal), {
      concurrency: 1,
      signal: controller.signal,
    })
    assert.equal(seen[0], controller.signal)
  })

  it('refuses a concurrency that is not an integer of at least 1', async () => {
    for (const concurrency of [0, -1, 1.5, NaN]) {
      await assert.rejects(
        mapConcurrent([1], async (x) => x, { concurrency }),
        RangeError
      )
    }
  })
})
