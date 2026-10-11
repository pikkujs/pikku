import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyOptions } from './verify-options.js'

describe('pikku verify flags', () => {
  test('--strict reaches runVerify; the default is not strict', () => {
    assert.equal(verifyOptions('/p', { strict: true }).strict, true)
    assert.equal(verifyOptions('/p', {}).strict, false)
    assert.equal(verifyOptions('/p', undefined).strict, false)
  })

  test('the skip flags turn the steps off', () => {
    const o = verifyOptions('/p', { skipCodegen: true, skipFrontends: true })
    assert.deepEqual(
      [o.codegen, o.typecheck, o.frontends],
      [false, true, false]
    )
  })
})
