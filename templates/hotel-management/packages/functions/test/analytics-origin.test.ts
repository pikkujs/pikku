import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isAllowedAnalyticsOrigin,
  toOrigin,
} from '../src/middleware/analytics-origin.middleware.js'

describe('toOrigin', () => {
  test('reduces a URL to scheme, host and port', () => {
    assert.equal(toOrigin('https://thealder.example/a/b?c=d#e'), 'https://thealder.example')
    assert.equal(toOrigin('http://localhost:5173/app'), 'http://localhost:5173')
  })

  test('a non-default port is part of the origin', () => {
    assert.notEqual(toOrigin('http://localhost:5173'), toOrigin('http://localhost:5174'))
  })

  test('returns null for the things that are not origins', () => {
    // A sandboxed iframe and a file:// page both send the literal string "null".
    assert.equal(toOrigin('null'), null)
    assert.equal(toOrigin(''), null)
    assert.equal(toOrigin(undefined), null)
    assert.equal(toOrigin('not a url'), null)
  })
})

describe('isAllowedAnalyticsOrigin', () => {
  const configured = ['https://thealder.example', 'https://www.thealder.example']

  test('the app posting to its own origin is allowed without configuration', () => {
    assert.equal(
      isAllowedAnalyticsOrigin('https://thealder.example', 'https://thealder.example', []),
      true
    )
  })

  test('a configured origin is allowed', () => {
    assert.equal(
      isAllowedAnalyticsOrigin('https://www.thealder.example', null, configured),
      true
    )
  })

  test('a missing origin is rejected — a browser beacon always sets one', () => {
    assert.equal(isAllowedAnalyticsOrigin(null, 'https://thealder.example', configured), false)
  })

  /**
   * The reason this function exists rather than an `endsWith` call. Each of
   * these passes a suffix check and is a different site.
   */
  test('matching is exact, so no lookalike host gets in', () => {
    for (const impostor of [
      'https://evil-thealder.example',
      'https://thealder.example.evil.net',
      'https://notthealder.example',
      'https://thealder.example.co',
    ]) {
      assert.equal(
        isAllowedAnalyticsOrigin(impostor, 'https://thealder.example', configured),
        false,
        `${impostor} must not be accepted`
      )
    }
  })

  test('a subdomain is a different origin unless it is configured too', () => {
    assert.equal(
      isAllowedAnalyticsOrigin('https://api.thealder.example', 'https://thealder.example', configured),
      false
    )
  })

  test('scheme and port are both significant', () => {
    assert.equal(
      isAllowedAnalyticsOrigin('http://thealder.example', 'https://thealder.example', configured),
      false
    )
    assert.equal(
      isAllowedAnalyticsOrigin('https://thealder.example:8443', 'https://thealder.example', configured),
      false
    )
  })
})
