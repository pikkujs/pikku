import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeEventsScaffold } from './serialize-events-scaffold.js'

describe('serializeEventsScaffold', () => {
  test('wires no route a caller could subscribe to any topic through', () => {
    const out = serializeEventsScaffold()
    assert.doesNotMatch(out, /^\s*wireHTTP\(/m)
    assert.doesNotMatch(out, /^\s*wireChannel\(/m)
    assert.doesNotMatch(out, /\/events\/:topic/)
    assert.doesNotMatch(out, /eventHub\??\.subscribe/)
  })

  test('points at pikkuSubscribeFunc as the way to subscribe', () => {
    assert.match(serializeEventsScaffold(), /pikkuSubscribeFunc/)
  })

  test('is a module', () => {
    assert.match(serializeEventsScaffold(), /^export \{\}$/m)
  })
})
