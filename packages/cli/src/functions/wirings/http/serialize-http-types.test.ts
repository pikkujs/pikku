import { test, describe } from 'node:test'
import * as assert from 'assert'
import { serializeHTTPTypes } from './serialize-http-types.js'

describe('serializeHTTPTypes', () => {
  /**
   * `cors` is middleware an app wires like any other, and every other name it
   * wires HTTP with is already on this leaf. Leaving it on
   * `@pikku/core/middleware` made it the one import in a wiring file that
   * reached past `#pikku`.
   */
  test('the http leaf carries cors', () => {
    assert.match(
      serializeHTTPTypes('./pikku-types.gen.js'),
      /export \{ cors \} from '@pikku\/core\/middleware'/
    )
  })

  test('the http leaf still carries addHTTPMiddleware', () => {
    assert.match(
      serializeHTTPTypes('./pikku-types.gen.js'),
      /export const addHTTPMiddleware/
    )
  })
})
