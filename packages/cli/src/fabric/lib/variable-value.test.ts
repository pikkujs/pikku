import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseVariableValue } from './variable-value.js'

describe('parseVariableValue', () => {
  it('parses the JSON spellings, so a stage sees what `.env` would give', () => {
    assert.equal(parseVariableValue('true'), true)
    assert.equal(parseVariableValue('false'), false)
    assert.equal(parseVariableValue('8080'), 8080)
    assert.equal(parseVariableValue('null'), null)
    assert.deepEqual(parseVariableValue('{"a":1}'), { a: 1 })
    assert.deepEqual(parseVariableValue('["a","b"]'), ['a', 'b'])
  })

  it('keeps anything that is not JSON as the string it was typed as', () => {
    assert.equal(parseVariableValue('hello'), 'hello')
    assert.equal(
      parseVariableValue('https://example.com'),
      'https://example.com'
    )
    assert.equal(parseVariableValue(''), '')
    // A quoted string is JSON, and unwrapping it is the point: it is how you
    // store the four characters `true` rather than the boolean.
    assert.equal(parseVariableValue('"true"'), 'true')
  })
})
