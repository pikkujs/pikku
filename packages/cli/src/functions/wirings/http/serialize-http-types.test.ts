import { test, describe } from 'node:test'
import * as assert from 'assert'
import { serializeHTTPTypes } from './serialize-http-types.js'

describe('serializeHTTPTypes', () => {
  /**
   * `cors` and `addHTTPMiddleware` are middleware, and middleware is one
   * concept regardless of the wiring it ends up attached to — so both live on
   * `#pikku/middleware` rather than being the two names an app has to reach
   * into the HTTP leaf for. This leaf keeps only what wires a route.
   */
  test('the http leaf leaves middleware to the middleware leaf', () => {
    const out = serializeHTTPTypes(
      './pikku-types.gen.js',
      './middleware.gen.js'
    )
    assert.doesNotMatch(out, /export \{ cors \}/)
    assert.doesNotMatch(out, /export const addHTTPMiddleware/)
  })

  test('the http leaf types its wirings against the middleware leaf', () => {
    assert.match(
      serializeHTTPTypes('./pikku-types.gen.js', './middleware.gen.js'),
      /import type \{ PikkuMiddleware \} from '\.\/middleware\.gen\.js'/
    )
  })
})
