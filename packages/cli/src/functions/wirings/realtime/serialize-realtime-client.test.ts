import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeRealtimeClient } from './serialize-realtime-client.js'

describe('serializeRealtimeClient', () => {
  describe('topics import', () => {
    test('falls back to Record<string, unknown> when no import is configured', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(out, /No EventHubTopics import configured/)
      assert.match(out, /type EventHubTopics = Record<string, unknown>/)
      assert.doesNotMatch(out, /import type \{ EventHubTopics \}/)
    })

    test('imports EventHubTopics by default when only path is given', () => {
      const out = serializeRealtimeClient(
        '../types/eventhub-topics.js',
        './pikku-fetch.gen.js'
      )
      assert.match(
        out,
        /import type \{ EventHubTopics \} from '\.\.\/types\/eventhub-topics\.js'/
      )
      assert.doesNotMatch(out, /No EventHubTopics import configured/)
    })

    test('imports EventHubTopics when path#EventHubTopics is given (no rename)', () => {
      const out = serializeRealtimeClient(
        '../types/eventhub-topics.js#EventHubTopics',
        './pikku-fetch.gen.js'
      )
      assert.match(
        out,
        /import type \{ EventHubTopics \} from '\.\.\/types\/eventhub-topics\.js'/
      )
    })

    test('aliases a non-default type name to EventHubTopics', () => {
      const out = serializeRealtimeClient(
        '../types/topics.js#MyAppTopics',
        './pikku-fetch.gen.js'
      )
      assert.match(
        out,
        /import type \{ MyAppTopics as EventHubTopics \} from '\.\.\/types\/topics\.js'/
      )
    })

    test('handles a hash with an empty path before it', () => {
      const out = serializeRealtimeClient('#OnlyName', './pikku-fetch.gen.js')
      // Empty path slice; alias still applies because typeName !== 'EventHubTopics'
      assert.match(out, /import type \{ OnlyName as EventHubTopics \} from ''/)
    })
  })

  describe('emitted client surface', () => {
    test('exports the PikkuRealtime class', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(out, /export class PikkuRealtime/)
    })

    test('imports PikkuFetch from the generated fetch client', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(
        out,
        /import \{ PikkuFetch \} from '\.\/pikku-fetch\.gen\.js'/
      )
    })

    test('exposes setPikkuFetch / setServerUrl / setAuthorizationJWT / setAPIKey', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(out, /setPikkuFetch\(pikkuFetch: PikkuFetch\): void/)
      assert.match(out, /setServerUrl\(serverUrl: string\): void/)
      assert.match(out, /setAuthorizationJWT\(jwt: string \| null\): void/)
      assert.match(out, /setAPIKey\(apiKey: string \| null\): void/)
    })

    test('exposes typed subscribe/unsubscribe over EventHubTopics keys', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(out, /subscribe<K extends keyof EventHubTopics & string>/)
      assert.match(out, /unsubscribe<K extends keyof EventHubTopics & string>/)
    })

    test('exposes subscribeToTopic (SSE per topic) and subscribeToSSE (generic)', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(
        out,
        /subscribeToTopic<K extends keyof EventHubTopics & string>/
      )
      assert.match(out, /subscribeToSSE<T = unknown>/)
    })

    test('exposes connectToChannel for raw wireChannel sockets', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(
        out,
        /connectToChannel\(\s*channelPath: string,\s*protocols\?: string \| string\[\]/
      )
    })

    test('throws if no server URL is configured before resolving', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(
        out,
        /PikkuRealtime: no server URL — call setServerUrl\(\.\.\.\) or setPikkuFetch\(\.\.\.\) first\./
      )
    })

    test('reconnect defaults are reflected in the constructor', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(out, /reconnect: options\.reconnect \?\? true/)
      assert.match(out, /reconnectDelayMs: options\.reconnectDelayMs \?\? 500/)
      assert.match(
        out,
        /reconnectMaxDelayMs: options\.reconnectMaxDelayMs \?\? 10_000/
      )
    })

    test('replays handler subscriptions on websocket reconnect', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(
        out,
        /onopen = \(\) => \{[\s\S]*for \(const topic of this\.handlers\.keys\(\)\)/
      )
    })

    test('resolveWsUrl rewrites http(s) to ws(s)', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(out, /\.replace\(\/\^http\/i, 'ws'\)/)
    })

    test('event payload dispatch only fires when the envelope has a string topic', () => {
      const out = serializeRealtimeClient(undefined, './pikku-fetch.gen.js')
      assert.match(
        out,
        /'topic' in \(payload as any\)[\s\S]*typeof \(payload as any\)\.topic === 'string'/
      )
    })
  })
})
