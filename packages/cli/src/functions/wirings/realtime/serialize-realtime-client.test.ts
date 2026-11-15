import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeRealtimeClient } from './serialize-realtime-client.js'

describe('serializeRealtimeClient', () => {
  describe('emitted client surface', () => {
    test('exports the PikkuRealtime class', () => {
      const out = serializeRealtimeClient('./pikku-fetch.gen.js')
      assert.match(out, /export class PikkuRealtime/)
    })

    test('imports PikkuFetch from the generated fetch client', () => {
      const out = serializeRealtimeClient('./pikku-fetch.gen.js')
      assert.match(
        out,
        /import \{ PikkuFetch \} from '\.\/pikku-fetch\.gen\.js'/
      )
    })

    test('exposes setPikkuFetch / setServerUrl / setAuthorizationJWT / setAPIKey', () => {
      const out = serializeRealtimeClient('./pikku-fetch.gen.js')
      assert.match(out, /setPikkuFetch\(pikkuFetch: PikkuFetch\): void/)
      assert.match(out, /setServerUrl\(serverUrl: string\): void/)
      assert.match(out, /setAuthorizationJWT\(jwt: string \| null\): void/)
      assert.match(out, /setAPIKey\(apiKey: string \| null\): void/)
    })

    test('has no open any-topic subscribe: only an sse route can be followed', () => {
      const out = serializeRealtimeClient('./pikku-fetch.gen.js')
      assert.match(out, /subscribeToSSE<T = unknown>/)
      assert.doesNotMatch(out, /subscribeToTopic/)
      assert.doesNotMatch(out, /EventHubTopics/)
      assert.doesNotMatch(out, /action: 'subscribe'/)
      assert.doesNotMatch(out, /'\/events'/)
    })

    test('exposes connectToChannel for raw wireChannel sockets', () => {
      const out = serializeRealtimeClient('./pikku-fetch.gen.js')
      assert.match(
        out,
        /connectToChannel\(\s*channelPath: string,\s*protocols\?: string \| string\[\]/
      )
    })

    test('throws if no server URL is configured before resolving', () => {
      const out = serializeRealtimeClient('./pikku-fetch.gen.js')
      assert.match(
        out,
        /PikkuRealtime: no server URL — call setServerUrl\(\.\.\.\) or setPikkuFetch\(\.\.\.\) first\./
      )
    })

    test('resolveWsUrl rewrites http(s) to ws(s)', () => {
      const out = serializeRealtimeClient('./pikku-fetch.gen.js')
      assert.match(out, /\.replace\(\/\^http\/i, 'ws'\)/)
    })
  })
})
