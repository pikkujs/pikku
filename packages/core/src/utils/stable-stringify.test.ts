import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { stableStringify } from './stable-stringify.js'

describe('stableStringify', () => {
  it('sorts object keys at every depth', () => {
    assert.equal(
      stableStringify({ z: { b: 1, a: 2 }, a: [{ d: 1, c: 2 }] }),
      '{"a":[{"c":2,"d":1}],"z":{"a":2,"b":1}}'
    )
  })

  it('ignores property insertion order', () => {
    assert.equal(
      stableStringify({ b: 1, a: 2 }),
      stableStringify({ a: 2, b: 1 })
    )
  })

  it('preserves array order', () => {
    assert.equal(stableStringify([3, 1, 2]), '[3,1,2]')
  })

  it('orders integer-like keys as strings', () => {
    assert.equal(
      stableStringify({ 9: 'a', 10: 'b', x: 'c' }),
      '{"10":"b","9":"a","x":"c"}'
    )
  })

  it('omits object properties JSON cannot represent', () => {
    assert.equal(
      stableStringify({ a: undefined, b: () => 1, c: Symbol('s'), d: null }),
      '{"d":null}'
    )
  })

  it('writes null for array items JSON cannot represent', () => {
    assert.equal(
      stableStringify([undefined, () => 1, null]),
      '[null,null,null]'
    )
  })

  it('returns undefined for a top-level value JSON cannot represent', () => {
    assert.equal(stableStringify(undefined), undefined)
    assert.equal(
      stableStringify(() => 1),
      undefined
    )
  })

  it('honours toJSON', () => {
    const date = new Date('2026-01-02T03:04:05.000Z')
    assert.equal(
      stableStringify({ at: date }),
      '{"at":"2026-01-02T03:04:05.000Z"}'
    )
    assert.notEqual(stableStringify(new Date(0)), stableStringify(new Date(1)))
  })

  it('escapes strings and numbers exactly as JSON.stringify does', () => {
    const value = { s: 'x"y\n', n: -1.5e-7, t: true, nested: [{}, [], ''] }
    assert.equal(
      stableStringify(value),
      '{"n":-1.5e-7,"nested":[{},[],""],"s":"x\\"y\\n","t":true}'
    )
  })
})
