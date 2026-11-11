import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { describeBuildFailure } from './build-pipeline.js'

const clean = {
  bundleErrors: [],
  codegenErrors: [],
  unroutedWirings: [],
  unservedGateways: [],
}

describe('describeBuildFailure', () => {
  test('a complete build is not a failure', () => {
    assert.equal(describeBuildFailure(clean), null)
  })

  test('names each gateway no unit serves, with its route', () => {
    const message = describeBuildFailure({
      ...clean,
      unservedGateways: [
        { name: 'chat', type: 'websocket', route: '/chat' },
        { name: 'discord', type: 'listener' },
      ],
    })
    assert.match(message ?? '', /2 gateway\(s\)/)
    assert.match(message ?? '', /chat \(websocket \/chat\)/)
    assert.match(message ?? '', /discord \(listener\)/)
  })
})
