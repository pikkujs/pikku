import { describe, test } from 'node:test'
import assert from 'node:assert'
import * as ts from 'typescript'

import { jsonObjectProperty } from './literal-properties.js'

function getObjectLiteral(code: string): ts.ObjectLiteralExpression {
  const sourceFile = ts.createSourceFile(
    'test.ts',
    code,
    ts.ScriptTarget.ESNext,
    true
  )
  let result: ts.ObjectLiteralExpression | undefined
  ts.forEachChild(sourceFile, function visit(node) {
    if (ts.isObjectLiteralExpression(node) && !result) {
      result = node
    }
    ts.forEachChild(node, visit)
  })
  if (!result) throw new Error('No object literal found')
  return result
}

const read = (code: string) =>
  jsonObjectProperty(getObjectLiteral(code), 'opts')

describe('jsonObjectProperty', () => {
  test('is undefined when the property is absent', () => {
    assert.strictEqual(read(`const x = { other: 1 }`), undefined)
  })

  test('reads scalars', () => {
    assert.deepStrictEqual(
      read(
        `const x = { opts: { a: 'one', b: 2, c: true, d: false, e: null } }`
      ),
      { a: 'one', b: 2, c: true, d: false, e: null }
    )
  })

  test('reads a negative number', () => {
    assert.deepStrictEqual(read(`const x = { opts: { seed: -1 } }`), {
      seed: -1,
    })
  })

  test('reads nested objects and arrays', () => {
    assert.deepStrictEqual(
      read(`const x = { opts: { a: { b: [1, 'two', { c: true }] } } }`),
      { a: { b: [1, 'two', { c: true }] } }
    )
  })

  test('reads quoted and template keys', () => {
    assert.deepStrictEqual(read(`const x = { opts: { 'a-b': \`c\` } }`), {
      'a-b': 'c',
    })
  })

  test('unwraps `as const`', () => {
    assert.deepStrictEqual(read(`const x = { opts: { a: 1 } as const }`), {
      a: 1,
    })
  })

  test('is undefined for a computed value', () => {
    assert.strictEqual(read(`const x = { opts: buildOpts() }`), undefined)
    assert.strictEqual(read(`const x = { opts: { a: someVar } }`), undefined)
    assert.strictEqual(
      read(`const x = { opts: { a: \`v-\${n}\` } }`),
      undefined
    )
  })

  test('is undefined for a spread, which hides entries', () => {
    assert.strictEqual(read(`const x = { opts: { ...base, a: 1 } }`), undefined)
  })

  test('is undefined when the value is not an object', () => {
    assert.strictEqual(read(`const x = { opts: [1, 2] }`), undefined)
    assert.strictEqual(read(`const x = { opts: 'nope' }`), undefined)
  })
})
