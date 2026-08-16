import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeEventsScaffold } from './serialize-events-scaffold.js'

describe('serializeEventsScaffold', () => {
  test('emits auth: true when authRequired is true', () => {
    const { functions: out } = serializeEventsScaffold(
      true,
      (name: string) => `./${name}/index.js`
    )
    assert.match(out, /name: 'events',\s*route: '\/events',\s*auth: true,/)
    assert.match(
      out,
      /route: '\/events\/:topic',\s*func: realtimeEventStream,\s*auth: true,/
    )
  })

  test('emits auth: false when authRequired is false', () => {
    const { functions: out } = serializeEventsScaffold(
      false,
      (name: string) => `./${name}/index.js`
    )
    assert.match(out, /name: 'events',\s*route: '\/events',\s*auth: false,/)
    assert.match(
      out,
      /route: '\/events\/:topic',\s*func: realtimeEventStream,\s*auth: false,/
    )
  })

  test('wires both transports against eventHub', () => {
    const { functions: out } = serializeEventsScaffold(
      false,
      (name: string) => `./${name}/index.js`
    )
    // WebSocket channel
    assert.match(out, /wireChannel\(\{/)
    assert.match(out, /onMessageWiring: \{\s*action: realtimeRoutes/)
    // SSE endpoint
    assert.match(out, /wireHTTP\(\{/)
    assert.match(out, /sse: true/)
    assert.match(out, /method: 'get',\s*route: '\/events\/:topic'/)
  })

  test('defines subscribe/unsubscribe via defineChannelRoutes', () => {
    const { functions: out } = serializeEventsScaffold(
      false,
      (name: string) => `./${name}/index.js`
    )
    assert.match(
      out,
      /defineChannelRoutes\(\{\s*subscribe: realtimeSubscribe,\s*unsubscribe: realtimeUnsubscribe/
    )
  })

  test('subscribe/unsubscribe handlers fail loudly if eventHub is missing', () => {
    const { functions: out } = serializeEventsScaffold(
      false,
      (name: string) => `./${name}/index.js`
    )
    assert.match(out, /eventHub\?\.subscribe\(topic, channel\.channelId\)/)
    assert.match(out, /eventHub\?\.unsubscribe\(topic, channel\.channelId\)/)
  })

  test('SSE handler subscribes and lets eventHub fan out', () => {
    const { functions: out } = serializeEventsScaffold(
      false,
      (name: string) => `./${name}/index.js`
    )
    assert.match(out, /eventHub\?\.subscribe\(topic, channel\.channelId\)/)
    assert.match(out, /Realtime SSE handler invoked without a channel/)
  })

  test('tags include realtime and sse on the right routes', () => {
    const { functions: out } = serializeEventsScaffold(
      false,
      (name: string) => `./${name}/index.js`
    )
    assert.match(out, /tags: \['pikku:realtime'\]/)
    assert.match(out, /tags: \['pikku:realtime', 'sse'\]/)
  })

  test('imports each name from the leaf it belongs to', () => {
    const { functions: out } = serializeEventsScaffold(
      false,
      (name: string) => `./${name}/index.js`
    )
    assert.match(
      out,
      /import \{[^}]*pikkuSessionlessFunc[^}]*\} from '\.\/function\/index\.js'/
    )
    assert.match(
      out,
      /import \{[^}]*wireChannel[^}]*defineChannelRoutes[^}]*\} from '\.\/channel\/index\.js'/
    )
    // `pikkuChannelFunc` is declared by the channel wiring, not the function
    // one — asking the function leaf for it is a name the leaf never exports.
    assert.match(
      out,
      /import \{[^}]*pikkuChannelFunc[^}]*\} from '\.\/channel\/index\.js'/
    )
    assert.ok(
      !/import \{[^}]*pikkuChannelFunc[^}]*\} from '\.\/function\/index\.js'/.test(
        out
      )
    )
    assert.match(
      out,
      /import \{[^}]*wireHTTP[^}]*\} from '\.\/http\/index\.js'/
    )
  })

  test('shares one zod TopicRef across every handler', () => {
    const { schemas, functions } = serializeEventsScaffold(
      false,
      (name: string) => `./${name}/index.js`
    )
    assert.match(schemas, /import \{ z \} from 'zod'/)
    assert.match(
      schemas,
      /export const TopicRef = z\.object\(\{ topic: z\.string\(\) \}\)/
    )
    assert.match(functions, /from '\.\/events\.schemas\.gen\.js'/)
    assert.equal(functions.match(/input: TopicRef/g)?.length, 3)
    assert.ok(
      !functions.includes('pikkuChannelFunc<') &&
        !functions.includes('pikkuSessionlessFunc<'),
      'schemas and generics are mutually exclusive'
    )
  })

  test('keeps the schemas module free of anything but zod', () => {
    const { schemas } = serializeEventsScaffold(
      false,
      (name: string) => `./${name}/index.js`
    )
    assert.ok(
      !schemas.includes('pikku-types.gen.js'),
      'the inspector imports this module directly, so it must not reach for a path deploy codegen rewrites'
    )
    assert.ok(!schemas.includes('@pikku/core'))
  })
})
