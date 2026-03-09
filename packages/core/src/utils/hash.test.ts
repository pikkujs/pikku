import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { canonicalJSON, hashString } from './hash.js'

describe('canonicalJSON', () => {
  it('sorts object keys alphabetically', () => {
    const result = canonicalJSON({ b: 1, a: 2, c: 3 })
    assert.equal(result, '{"a":2,"b":1,"c":3}')
  })

  it('sorts nested object keys', () => {
    const result = canonicalJSON({ z: { b: 1, a: 2 }, a: 1 })
    assert.equal(result, '{"a":1,"z":{"a":2,"b":1}}')
  })

  it('preserves array order', () => {
    const result = canonicalJSON([3, 1, 2])
    assert.equal(result, '[3,1,2]')
  })

  it('sorts objects inside arrays', () => {
    const result = canonicalJSON([{ b: 1, a: 2 }])
    assert.equal(result, '[{"a":2,"b":1}]')
  })

  it('handles null and undefined', () => {
    assert.equal(canonicalJSON(null), 'null')
    assert.equal(canonicalJSON(undefined), undefined)
  })

  it('handles primitives', () => {
    assert.equal(canonicalJSON('hello'), '"hello"')
    assert.equal(canonicalJSON(42), '42')
    assert.equal(canonicalJSON(true), 'true')
  })

  it('produces deterministic output for same input regardless of key order', () => {
    const a = canonicalJSON({ x: 1, y: 2, z: 3 })
    const b = canonicalJSON({ z: 3, x: 1, y: 2 })
    assert.equal(a, b)
  })
})

describe('hashString', () => {
  it('returns a hex string of default length 16', () => {
    const result = hashString('test')
    assert.equal(result.length, 16)
    assert.match(result, /^[0-9a-f]+$/)
  })

  it('returns consistent hash for same input', () => {
    const a = hashString('hello world')
    const b = hashString('hello world')
    assert.equal(a, b)
  })

  it('returns different hashes for different inputs', () => {
    const a = hashString('hello')
    const b = hashString('world')
    assert.notEqual(a, b)
  })

  it('respects custom length parameter', () => {
    const result = hashString('test', 8)
    assert.equal(result.length, 8)
  })
})
