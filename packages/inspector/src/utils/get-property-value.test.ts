import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import * as ts from 'typescript'
import { getArrayPropertyValue } from './get-property-value.js'

/**
 * Parses `const x = { ... }` and hands back the object literal.
 */
const objectLiteral = (source: string): ts.ObjectLiteralExpression => {
  const file = ts.createSourceFile(
    'test.ts',
    `const x = ${source}`,
    ts.ScriptTarget.Latest,
    true
  )
  const statement = file.statements[0] as ts.VariableStatement
  const initializer = statement.declarationList.declarations[0]!.initializer
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    throw new Error('expected an object literal')
  }
  return initializer
}

describe('getArrayPropertyValue', () => {
  test('reads a plain array literal', () => {
    const obj = objectLiteral(`{ tags: ['a', 'b'] }`)
    assert.deepEqual(getArrayPropertyValue(obj, 'tags'), ['a', 'b'])
  })

  test('returns null when the property is absent', () => {
    const obj = objectLiteral(`{ other: ['a'] }`)
    assert.equal(getArrayPropertyValue(obj, 'tags'), null)
  })

  test('reads an array widened with `as const`', () => {
    const obj = objectLiteral(`{ tags: ['a', 'b'] as const }`)
    assert.deepEqual(
      getArrayPropertyValue(obj, 'tags'),
      ['a', 'b'],
      '`as const` on an array is idiomatic and must not drop the value'
    )
  })

  test('reads an array cast with `as any`', () => {
    const obj = objectLiteral(`{ tags: ['a'] as any }`)
    assert.deepEqual(
      getArrayPropertyValue(obj, 'tags'),
      ['a'],
      'a cast must not let a value escape static validation'
    )
  })

  test('reads an array through `satisfies`', () => {
    const obj = objectLiteral(`{ tags: ['a'] satisfies string[] }`)
    assert.deepEqual(getArrayPropertyValue(obj, 'tags'), ['a'])
  })

  test('reads an array through nested casts', () => {
    const obj = objectLiteral(`{ tags: ['a'] as const as any }`)
    assert.deepEqual(getArrayPropertyValue(obj, 'tags'), ['a'])
  })

  test('ignores non-string elements', () => {
    const obj = objectLiteral(`{ tags: ['a', 1, foo] }`)
    assert.deepEqual(getArrayPropertyValue(obj, 'tags'), ['a'])
  })

  test('returns null for a non-array initializer', () => {
    const obj = objectLiteral(`{ tags: 'a' }`)
    assert.equal(getArrayPropertyValue(obj, 'tags'), null)
  })
})
