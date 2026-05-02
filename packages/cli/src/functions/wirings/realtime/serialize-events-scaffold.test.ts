import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeEventsScaffold } from './serialize-events-scaffold.js'

describe('serializeEventsScaffold', () => {
  test('emits auth: true when authRequired is true', () => {
    const out = serializeEventsScaffold(true)
    assert.match(out, /name: 'events',\s*route: '\/events',\s*auth: true,/)
    assert.match(out, /route: '\/events\/:topic',\s*func: realtimeEventStream,\s*auth: true,/)
  })

  test('emits auth: false when authRequired is false', () => {
    const out = serializeEventsScaffold(false)
    assert.match(out, /name: 'events',\s*route: '\/events',\s*auth: false,/)
    assert.match(out, /route: '\/events\/:topic',\s*func: realtimeEventStream,\s*auth: false,/)
  })

  test('wires both transports against eventHub', () => {
    const out = serializeEventsScaffold(false)
    // WebSocket channel
    assert.match(out, /wireChannel\(\{/)
    assert.match(out, /onMessageWiring: \{\s*action: realtimeRoutes/)
    // SSE endpoint
    assert.match(out, /wireHTTP\(\{/)
    assert.match(out, /sse: true/)
    assert.match(out, /method: 'get',\s*route: '\/events\/:topic'/)
  })

  test('defines subscribe/unsubscribe via defineChannelRoutes', () => {
    const out = serializeEventsScaffold(false)
    assert.match(out, /defineChannelRoutes\(\{\s*subscribe: realtimeSubscribe,\s*unsubscribe: realtimeUnsubscribe/)
  })

  test('subscribe/unsubscribe handlers fail loudly if eventHub is missing', () => {
    const out = serializeEventsScaffold(false)
    const matches = out.match(/Realtime channel needs an eventHub service/g)
    assert.strictEqual(matches?.length, 2, 'both subscribe and unsubscribe must guard')
  })

  test('SSE handler subscribes and lets eventHub fan out', () => {
    const out = serializeEventsScaffold(false)
    assert.match(out, /eventHub\.subscribe\(topic, channel\.channelId\)/)
    assert.match(out, /Realtime SSE needs an eventHub service/)
  })

  test('tags include realtime and sse on the right routes', () => {
    const out = serializeEventsScaffold(false)
    assert.match(out, /tags: \['realtime'\]/)
    assert.match(out, /tags: \['realtime', 'sse'\]/)
  })

  test('imports the generated pikku-types entrypoint', () => {
    const out = serializeEventsScaffold(false)
    assert.match(
      out,
      /from '\.\.\/\.\.\/\.pikku\/pikku-types\.gen\.js'/
    )
    assert.match(out, /import \{[^}]*pikkuSessionlessFunc[^}]*\}/)
    assert.match(out, /import \{[^}]*wireChannel[^}]*\}/)
    assert.match(out, /import \{[^}]*wireHTTP[^}]*\}/)
    assert.match(out, /import \{[^}]*defineChannelRoutes[^}]*\}/)
  })

  test('uses zod TopicInput shared across handlers', () => {
    const out = serializeEventsScaffold(false)
    assert.match(out, /const TopicInput = z\.object\(\{ topic: z\.string\(\) \}\)/)
  })
})
