import { test, describe } from 'node:test'
import assert from 'node:assert'
import * as ts from 'typescript'
import { getRecordPropertyValue } from './get-property-value.js'

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
