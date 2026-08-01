import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { createRng } from './virtual-user-rng.js'

describe('virtual user rng', () => {
  test('the same seed replays the same run', () => {
    const a = createRng(42)
    const b = createRng(42)
    const drawsA = Array.from({ length: 50 }, () => a.next())
    const drawsB = Array.from({ length: 50 }, () => b.next())
    assert.deepEqual(drawsA, drawsB)
  })

  test('different seeds diverge', () => {
    const a = Array.from({ length: 20 }, createRng(1).next)
    const b = Array.from({ length: 20 }, createRng(2).next)
    assert.notDeepEqual(a, b)
  })

  test('draws stay in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const value = rng.next()
      assert.ok(value >= 0 && value < 1, `out of range: ${value}`)
    }
  })

  test('chance is roughly its probability', () => {
    const rng = createRng(9)
    let hits = 0
    for (let i = 0; i < 10_000; i++) if (rng.chance(0.25)) hits++
    assert.ok(hits > 2200 && hits < 2800, `got ${hits} of 10000`)
  })

  test('chance(0) never fires and chance(1) always does', () => {
    const rng = createRng(3)
    for (let i = 0; i < 200; i++) {
      assert.equal(rng.chance(0), false)
      assert.equal(rng.chance(1), true)
    }
  })

  test('pick returns undefined for an empty list and only members otherwise', () => {
    const rng = createRng(11)
    assert.equal(rng.pick([]), undefined)
    const items = ['a', 'b', 'c']
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(rng.pick(items)!)
    assert.deepEqual([...seen].sort(), items)
  })

  test('weighted respects the weights', () => {
    const rng = createRng(5)
    const counts = { continue: 0, suspend: 0 }
    for (let i = 0; i < 10_000; i++) {
      counts[rng.weighted({ continue: 90, suspend: 10 })!]++
    }
    assert.ok(counts.continue > counts.suspend * 5, JSON.stringify(counts))
  })

  test('a zero weight can never be drawn — that is how a disposition switches a move off', () => {
    const rng = createRng(13)
    for (let i = 0; i < 5000; i++) {
      assert.notEqual(rng.weighted({ continue: 92, abandon: 0 }), 'abandon')
    }
  })

  test('weighted with nothing to draw returns undefined', () => {
    assert.equal(createRng(1).weighted({ a: 0, b: 0 }), undefined)
  })
})
