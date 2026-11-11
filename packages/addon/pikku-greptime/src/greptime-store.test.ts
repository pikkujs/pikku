import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  GreptimeTelemetryStore,
  TelemetryQueryError,
  TelemetryUnavailableError,
} from './greptime-store.js'
import {
  createGreptimeContributor,
  greptimeOptionsFromEnv,
} from './greptime-contributor.js'

const scope = { project: 'p', stage: 's' }
const respond = (status: number, body: unknown = {}): typeof fetch =>
  (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
    })) as unknown as typeof fetch

const store = (fetcher: typeof fetch, extra = {}) =>
  new GreptimeTelemetryStore({
    url: 'http://127.0.0.1:1',
    fetch: fetcher,
    schemaTtlMs: 0,
    ...extra,
  })

describe('failure handling (transport only; the data path is tested against a real GreptimeDB)', () => {
  test('a refused connection is unavailable, not an empty answer', async () => {
    const dead = new GreptimeTelemetryStore({
      url: 'http://127.0.0.1:1',
      timeoutMs: 500,
    })
    await assert.rejects(dead.logs(scope, {}), (error: unknown) => {
      assert.ok(error instanceof TelemetryUnavailableError)
      assert.equal(error.reason, 'unreachable')
      return true
    })
  })
  test('a server that never answers times out', async () => {
    const slow = (async (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
      )) as unknown as typeof fetch
    await assert.rejects(
      store(slow, { timeoutMs: 50 }).logs(scope, {}),
      (error: unknown) => {
        assert.ok(error instanceof TelemetryUnavailableError)
        assert.equal(error.reason, 'timeout')
        return true
      }
    )
  })
  test('401 and 403 are an auth failure', async () => {
    for (const status of [401, 403]) {
      await assert.rejects(
        store(respond(status)).logs(scope, {}),
        (error: unknown) => {
          assert.ok(error instanceof TelemetryUnavailableError)
          assert.equal(error.reason, 'auth')
          return true
        }
      )
    }
  })
  test('5xx is unavailable; a 4xx the engine explains is a query error with its code', async () => {
    await assert.rejects(
      store(respond(503, 'busy')).logs(scope, {}),
      (error: unknown) =>
        error instanceof TelemetryUnavailableError && error.reason === 'server'
    )
    await assert.rejects(
      store(respond(400, { code: 2000, error: 'syntax' })).appendLogs(scope, [
        { at: 1, severity: 'info', body: 'x', source: 'app' },
      ]),
      (error: unknown) => error instanceof TelemetryQueryError
    )
  })
  test('credentials are sent as Basic auth', async () => {
    const seen: string[] = []
    const spy = (async (
      _url: string,
      init: { headers: Record<string, string> }
    ) => {
      seen.push(init.headers.authorization)
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    await store(spy, { username: 'u', password: 'p' }).ping()
    assert.equal(seen[0], `Basic ${Buffer.from('u:p').toString('base64')}`)
  })
  test('half a credential pair, or a bad url, is refused at construction', () => {
    assert.throws(
      () => new GreptimeTelemetryStore({ url: 'http://x:1', username: 'u' }),
      TypeError
    )
    assert.throws(
      () => new GreptimeTelemetryStore({ url: 'ftp://x' }),
      TypeError
    )
    assert.throws(() => new GreptimeTelemetryStore({ url: 'nope' }), TypeError)
    assert.throws(
      () => new GreptimeTelemetryStore({ url: 'http://x:1', database: 'a;b' }),
      TypeError
    )
  })
  test('an empty scope rejects before any request', async () => {
    let calls = 0
    const counting = (async () => {
      calls++
      return new Response('{}')
    }) as unknown as typeof fetch
    const s = store(counting)
    await assert.rejects(s.logs({ project: '', stage: 'x' }, {}))
    await assert.rejects(s.appendLogs({ project: 'x', stage: '' }, []))
    assert.equal(calls, 0)
  })
})

describe('contributor environment', () => {
  test('the url is required', () => {
    assert.throws(() => greptimeOptionsFromEnv({}), /PIKKU_GREPTIME_URL/)
  })
  test('a remote host needs credentials; loopback does not', () => {
    assert.throws(
      () =>
        greptimeOptionsFromEnv({
          PIKKU_GREPTIME_URL: 'http://db.internal:4000',
        }),
      /not this machine/
    )
    assert.equal(
      greptimeOptionsFromEnv({ PIKKU_GREPTIME_URL: 'http://127.0.0.1:4000' })
        .database,
      'pikku'
    )
    assert.equal(
      greptimeOptionsFromEnv({
        PIKKU_GREPTIME_URL: 'https://db.internal',
        PIKKU_GREPTIME_USER: 'u',
        PIKKU_GREPTIME_PASSWORD: 'p',
        PIKKU_GREPTIME_DB: 'tel',
      }).database,
      'tel'
    )
  })
  test('half a credential pair is refused', () => {
    assert.throws(
      () =>
        greptimeOptionsFromEnv({
          PIKKU_GREPTIME_URL: 'http://localhost:1',
          PIKKU_GREPTIME_USER: 'u',
        }),
      /both/
    )
  })
  test('run builds the store without touching the network and provides telemetryStore', () => {
    const contributor = createGreptimeContributor()
    assert.deepEqual(contributor.provides, ['telemetryStore'])
    const services: Record<string, unknown> = {}
    void contributor.run(
      services,
      { PIKKU_GREPTIME_URL: 'http://127.0.0.1:1' },
      {},
      {} as never
    )
    assert.ok(services.telemetryStore instanceof GreptimeTelemetryStore)
  })
  test('run with nothing set throws instead of falling back to a memory store', () => {
    const services: Record<string, unknown> = {}
    assert.throws(() => {
      void createGreptimeContributor().run(services, {}, {}, {} as never)
    })
    assert.equal(services.telemetryStore, undefined)
  })
  test('a retention setting that is not a number of days is refused', () => {
    for (const days of ['soon', '0', '1.5']) {
      assert.throws(() => {
        void createGreptimeContributor().run(
          {},
          {
            PIKKU_GREPTIME_URL: 'http://127.0.0.1:1',
            PIKKU_GREPTIME_RETENTION_DAYS: days,
          },
          {},
          {} as never
        )
      }, /PIKKU_GREPTIME_RETENTION_DAYS/)
    }
  })
})
