import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import { deriveConsoleUrl } from './console-url.js'

describe('deriveConsoleUrl', () => {
  test('swaps api.* for cloud.* in prod', () => {
    assert.equal(
      deriveConsoleUrl('https://api.pikkustudio.app'),
      'https://cloud.pikkustudio.app/'
    )
  })
  test('uses the studio port locally', () => {
    assert.equal(
      deriveConsoleUrl('http://localhost:7101'),
      'http://localhost:7102/'
    )
  })
})
