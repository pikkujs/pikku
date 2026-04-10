import { describe, it } from 'node:test'
import assert from 'node:assert'
import { extractJson, extractJsonArray } from './claude.js'

describe('extractJson', () => {
  it('extracts plain JSON object', () => {
    const result = extractJson('{"name": "test", "value": 42}')
    assert.deepStrictEqual(result, { name: 'test', value: 42 })
  })

  it('extracts JSON from markdown fence', () => {
    const result = extractJson('```json\n{"key": "value"}\n```')
    assert.deepStrictEqual(result, { key: 'value' })
  })

  it('extracts JSON from fence without language tag', () => {
    const result = extractJson('```\n{"key": "value"}\n```')
    assert.deepStrictEqual(result, { key: 'value' })
  })

  it('extracts JSON surrounded by text', () => {
    const result = extractJson('Here is the result:\n{"a": 1}\nEnd.')
    assert.deepStrictEqual(result, { a: 1 })
  })

  it('returns null for no JSON', () => {
    assert.strictEqual(extractJson('no json here'), null)
  })

  it('returns null for invalid JSON', () => {
    assert.strictEqual(extractJson('{invalid json}'), null)
  })

  it('returns null for empty string', () => {
    assert.strictEqual(extractJson(''), null)
  })

  it('handles nested objects', () => {
    const result = extractJson('{"a": {"b": [1, 2, 3]}}')
    assert.deepStrictEqual(result, { a: { b: [1, 2, 3] } })
  })
})

describe('extractJsonArray', () => {
  it('extracts plain JSON array', () => {
    const result = extractJsonArray('["a", "b", "c"]')
    assert.deepStrictEqual(result, ['a', 'b', 'c'])
  })

  it('extracts array from markdown fence', () => {
    const result = extractJsonArray('```json\n["one", "two"]\n```')
    assert.deepStrictEqual(result, ['one', 'two'])
  })

  it('extracts array surrounded by text', () => {
    const result = extractJsonArray('Result: ["x", "y"] done')
    assert.deepStrictEqual(result, ['x', 'y'])
  })

  it('returns null for no array', () => {
    assert.strictEqual(extractJsonArray('no array here'), null)
  })

  it('returns null for invalid array', () => {
    assert.strictEqual(extractJsonArray('[not valid]'), null)
  })

  it('returns null for empty string', () => {
    assert.strictEqual(extractJsonArray(''), null)
  })
})
