import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readSyntaxErrors } from './helpers.js'

describe('readSyntaxErrors', () => {
  test('valid TypeScript has no parse errors', () => {
    assert.deepEqual(readSyntaxErrors('async function f(){ return 1 }'), [])
  })

  test('an octal literal is a parse error, as ts.transpileModule reports it', () => {
    assert.deepEqual(
      readSyntaxErrors('async function __n8n(){\nconst a = 00000000\n}'),
      [{ code: 1121, start: 34 }]
    )
  })

  test('an unterminated string is a parse error', () => {
    assert.ok(readSyntaxErrors("async function f(){ return 'a }").length > 0)
  })
})
