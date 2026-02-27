import { describe, test } from 'node:test'
import assert from 'node:assert'
import { template } from './template.js'

describe('template', () => {
  test('should parse a simple template with one placeholder', () => {
    const result = template('Hello $0!', [{ $ref: 'greeting' }])
    assert.deepStrictEqual(result.$template.parts, ['Hello ', '!'])
    assert.deepStrictEqual(result.$template.expressions, [{ $ref: 'greeting' }])
  })

  test('should parse template with multiple placeholders', () => {
    const result = template('$0 and $1', [{ $ref: 'a' }, { $ref: 'b' }])
    assert.deepStrictEqual(result.$template.parts, ['', ' and ', ''])
    assert.strictEqual(result.$template.expressions.length, 2)
    assert.strictEqual(result.$template.expressions[0].$ref, 'a')
    assert.strictEqual(result.$template.expressions[1].$ref, 'b')
  })

  test('should preserve path in references', () => {
    const result = template('Value: $0', [{ $ref: 'node1', path: 'data.name' }])
    assert.deepStrictEqual(result.$template.expressions[0], {
      $ref: 'node1',
      path: 'data.name',
    })
  })

  test('should handle template with no placeholders', () => {
    const result = template('No placeholders here', [])
    assert.deepStrictEqual(result.$template.parts, ['No placeholders here'])
    assert.deepStrictEqual(result.$template.expressions, [])
  })

  test('should handle out-of-range ref index as unknown', () => {
    const result = template('$5', [{ $ref: 'a' }])
    assert.deepStrictEqual(result.$template.expressions[0], { $ref: 'unknown' })
  })

  test('should handle adjacent placeholders', () => {
    const result = template('$0$1', [{ $ref: 'a' }, { $ref: 'b' }])
    assert.deepStrictEqual(result.$template.parts, ['', '', ''])
    assert.strictEqual(result.$template.expressions.length, 2)
  })

  test('should omit path when not provided', () => {
    const result = template('$0', [{ $ref: 'node' }])
    assert.strictEqual(result.$template.expressions[0].path, undefined)
  })
})
