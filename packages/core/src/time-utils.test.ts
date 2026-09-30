import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { RelativeTimeInput } from './time-utils'
import {
  getRelativeTimeOffset,
  getRelativeTimeOffsetFromNow,
} from './time-utils'

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
    // Bracket the call rather than compare to one Date.now() with a tolerance:
    // on a loaded runner the clock can move past any fixed tolerance between
    // the test's read and the function's own.
    test('returns a Date 1 minute in the future', () => {
      const before = Date.now()
      const result = getRelativeTimeOffsetFromNow({ value: 1, unit: 'minute' })
      const after = Date.now()
      assert.ok(result.getTime() >= before + 60000)
      assert.ok(result.getTime() <= after + 60000)
    })

    test('returns a Date 2 hours in the past', () => {
      const before = Date.now()
      const result = getRelativeTimeOffsetFromNow({ value: -2, unit: 'hour' })
      const after = Date.now()
      assert.ok(result.getTime() >= before - 7200000)
      assert.ok(result.getTime() <= after - 7200000)
    })
  })
})
