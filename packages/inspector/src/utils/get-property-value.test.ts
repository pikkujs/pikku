import { describe, test } from 'node:test'
import assert from 'node:assert'
import * as ts from 'typescript'
import {
  getArrayPropertyValue,
  getRecordPropertyValue,
} from './get-property-value.js'

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

const firstObjectLiteral = (src: string): ts.ObjectLiteralExpression => {
  const sourceFile = ts.createSourceFile(
    'test.ts',
    src,
    ts.ScriptTarget.Latest,
    true
  )
  let found: ts.ObjectLiteralExpression | undefined
  const walk = (node: ts.Node) => {
    if (!found && ts.isObjectLiteralExpression(node)) {
      found = node
    }
    ts.forEachChild(node, walk)
  }
  walk(sourceFile)
  if (!found) {
    throw new Error('no object literal in source')
  }
  return found
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

describe('getRecordPropertyValue', () => {
  test('extracts a string record', () => {
    const obj = firstObjectLiteral(
      `const x = { additionalParams: { access_type: 'offline', prompt: 'consent' } }`
    )
    assert.deepStrictEqual(getRecordPropertyValue(obj, 'additionalParams'), {
      access_type: 'offline',
      prompt: 'consent',
    })
  })

  test('handles quoted keys', () => {
    const obj = firstObjectLiteral(
      `const x = { additionalParams: { 'token_access_type': 'offline' } }`
    )
    assert.deepStrictEqual(getRecordPropertyValue(obj, 'additionalParams'), {
      token_access_type: 'offline',
    })
  })

  test('returns null when the property is absent', () => {
    const obj = firstObjectLiteral(`const x = { scopes: ['a'] }`)
    assert.strictEqual(getRecordPropertyValue(obj, 'additionalParams'), null)
  })

  test('returns null for a non-literal initializer', () => {
    const obj = firstObjectLiteral(`const x = { additionalParams: SOME_CONST }`)
    assert.strictEqual(getRecordPropertyValue(obj, 'additionalParams'), null)
  })

  test('skips non-string values rather than coercing them', () => {
    const obj = firstObjectLiteral(
      `const x = { additionalParams: { a: 'keep', b: 42, c: true } }`
    )
    assert.deepStrictEqual(getRecordPropertyValue(obj, 'additionalParams'), {
      a: 'keep',
    })
  })

  test('returns null for an empty record', () => {
    const obj = firstObjectLiteral(`const x = { additionalParams: {} }`)
    assert.strictEqual(getRecordPropertyValue(obj, 'additionalParams'), null)
  })
})
