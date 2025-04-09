import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  getRelativeTimeOffset,
  getRelativeTimeOffsetFromNow,
  RelativeTimeInput,
} from './time-utils'

const approxEqual = (a: number, b: number, delta: number = 10): boolean =>
  Math.abs(a - b) <= delta

describe('Time Utils', () => {
  const offsetCases: Array<{ input: RelativeTimeInput; expected: number }> = [
    { input: { value: 1, unit: 'second' }, expected: 1000 },
    { input: { value: 2, unit: 'minute' }, expected: 120000 },
    { input: { value: 1.5, unit: 'hour' }, expected: 5400000 },
    { input: { value: -1, unit: 'day' }, expected: -86400000 },
    { input: { value: 1, unit: 'week' }, expected: 604800000 },
    {
      input: { value: 2, unit: 'year' },
      expected: Math.round(2 * 365.25 * 86400 * 1000),
    },
  ]

  describe('getRelativeTimeOffset', () => {
    for (const { input, expected } of offsetCases) {
      test(`returns ${expected} ms for ${input.value} ${input.unit}`, () => {
        const actual = getRelativeTimeOffset(input)
        assert.strictEqual(actual, expected)
      })
    }
  })

  describe('getRelativeTimeOffsetFromNow', () => {
    test('returns a Date ~1 minute in the future', () => {
      const now = Date.now()
      const result = getRelativeTimeOffsetFromNow({ value: 1, unit: 'minute' })
      const delta = result.getTime() - now
      assert.ok(
        approxEqual(delta, 60000),
        `Expected ~60000ms ahead, got ${delta}ms`
      )
    })

    test('returns a Date ~2 hours in the past', () => {
      const now = Date.now()
      const result = getRelativeTimeOffsetFromNow({ value: -2, unit: 'hour' })
      const delta = now - result.getTime()
      assert.ok(
        approxEqual(delta, 7200000),
        `Expected ~7200000ms ago, got ${delta}ms`
      )
    })
  })
})
