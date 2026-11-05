import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  requireOrigin,
  isAllowedOrigin,
  toOrigin,
  hostOriginOf,
  allowedOriginsFromVariables,
} from './require-origin.js'
import { InvalidOriginError } from '../errors/errors.js'
import { resetPikkuState } from '../pikku-state.js'

beforeEach(() => {
  resetPikkuState()
})

const headers = (values: Record<string, string | undefined>) => ({
  method: () => 'post',
  header: (name: string) => values[name],
})

const run = async (
  config: Parameters<typeof requireOrigin>[0],
  values: Record<string, string | undefined>
) => {
  let reached = false
  const middleware = requireOrigin(config)
  await middleware(
    {} as any,
    { http: { request: headers(values) } } as any,
    async () => {
      reached = true
    }
  )
  return reached
}

describe('toOrigin', () => {
  test('keeps scheme, host and port and drops the rest', () => {
    assert.equal(
      toOrigin('https://app.com:8443/a/b?c=1'),
      'https://app.com:8443'
    )
  })

  test('rejects the sandboxed-iframe "null" origin and unparseable values', () => {
    assert.equal(toOrigin('null'), null)
    assert.equal(toOrigin(''), null)
    assert.equal(toOrigin(undefined), null)
  })
})

describe('isAllowedOrigin', () => {
  test('matches the request host exactly', () => {
    assert.equal(
      isAllowedOrigin('https://app.com', 'https://app.com', []),
      true
    )
  })

  test('does not suffix-match a lookalike domain', () => {
    assert.equal(
      isAllowedOrigin('https://evil-app.com', null, ['https://app.com']),
      false
    )
    assert.equal(
      isAllowedOrigin('https://app.com.evil.net', null, ['https://app.com']),
      false
    )
  })

  test('normalises a configured origin before comparing', () => {
    assert.equal(
      isAllowedOrigin('https://app.com', null, ['https://app.com/path']),
      true
    )
  })

  test('rejects a missing origin', () => {
    assert.equal(
      isAllowedOrigin(null, 'https://app.com', ['https://app.com']),
      false
    )
  })
})

describe('requireOrigin', () => {
  test('allows a beacon from the request own host', async () => {
    assert.equal(
      await run({}, { origin: 'https://app.com', host: 'app.com' }),
      true
    )
  })

  test('falls back to referer when only it is sent', async () => {
    assert.equal(
      await run({}, { referer: 'https://app.com/pricing', host: 'app.com' }),
      true
    )
  })

  test('honours x-forwarded-proto when deriving the host origin', async () => {
    assert.equal(
      await run(
        {},
        {
          origin: 'http://app.com',
          host: 'app.com',
          'x-forwarded-proto': 'http',
        }
      ),
      true
    )
  })

  test('rejects another site with a 403', async () => {
    await assert.rejects(
      () => run({}, { origin: 'https://evil.com', host: 'app.com' }),
      InvalidOriginError
    )
  })

  test('rejects a non-browser caller that sends no origin', async () => {
    await assert.rejects(() => run({}, { host: 'app.com' }), InvalidOriginError)
  })

  test('resolves configured origins from services when given a function', async () => {
    assert.equal(
      await run(
        { origins: async () => ['https://other.com'] },
        { origin: 'https://other.com', host: 'app.com' }
      ),
      true
    )
  })

  test('passes through when there is no http wire at all', async () => {
    let reached = false
    await requireOrigin({})({} as any, {} as any, async () => {
      reached = true
    })
    assert.equal(reached, true)
  })
})

describe('hostOriginOf', () => {
  test('defaults to http only for a loopback host', () => {
    assert.equal(hostOriginOf('localhost:64866'), 'http://localhost:64866')
    assert.equal(hostOriginOf('127.0.0.1:3000'), 'http://127.0.0.1:3000')
    assert.equal(hostOriginOf('[::1]:3000'), 'http://[::1]:3000')
    assert.equal(hostOriginOf('localhost'), 'http://localhost')
  })

  test('still defaults to https for every other host', () => {
    assert.equal(hostOriginOf('app.com'), 'https://app.com')
    assert.equal(
      hostOriginOf('localhost.evil.net'),
      'https://localhost.evil.net'
    )
    assert.equal(hostOriginOf('localhost:80.evil.net'), null)
  })

  test('lets x-forwarded-proto win over the default', () => {
    assert.equal(
      hostOriginOf('localhost:3000', 'https'),
      'https://localhost:3000'
    )
    assert.equal(hostOriginOf('app.com', 'http'), 'http://app.com')
  })

  test('is null without a host', () => {
    assert.equal(hostOriginOf(undefined), null)
  })
})

describe('requireOrigin on a local http dev server', () => {
  test('accepts http://localhost:PORT when Host is localhost:PORT and no proto header', async () => {
    assert.equal(
      await run(
        {},
        { origin: 'http://localhost:64866', host: 'localhost:64866' }
      ),
      true
    )
  })

  test('rejects another site', async () => {
    await assert.rejects(
      () =>
        run({}, { origin: 'https://evil.example', host: 'localhost:64866' }),
      InvalidOriginError
    )
  })

  test('rejects another port on localhost', async () => {
    await assert.rejects(
      () =>
        run({}, { origin: 'http://localhost:9999', host: 'localhost:64866' }),
      InvalidOriginError
    )
  })

  test('rejects a missing origin', async () => {
    await assert.rejects(
      () => run({}, { host: 'localhost:64866' }),
      InvalidOriginError
    )
  })

  test('a real https host with no proto header still expects https', async () => {
    await assert.rejects(
      () => run({}, { origin: 'http://app.com', host: 'app.com' }),
      InvalidOriginError
    )
  })

  test('rejects lookalike domains against a configured origin', async () => {
    for (const origin of [
      'https://evil-myapp.com',
      'https://myapp.com.evil.net',
    ]) {
      await assert.rejects(
        () =>
          run(
            { origins: ['https://myapp.com'] },
            { origin, host: 'api.myapp.com' }
          ),
        InvalidOriginError
      )
    }
  })
})

describe('allowedOriginsFromVariables', () => {
  const vars = (values: Record<string, string>) => ({
    variables: { get: async (name: string) => values[name] } as any,
  })

  test('prefers CORS_ORIGINS, split and trimmed', async () => {
    assert.deepEqual(
      await allowedOriginsFromVariables(
        vars({
          CORS_ORIGINS: 'https://a.com, https://b.com ',
          FRONTEND_URL: 'https://c.com',
        })
      ),
      ['https://a.com', 'https://b.com']
    )
  })

  test('falls back to FRONTEND_URL, then to nothing', async () => {
    assert.deepEqual(
      await allowedOriginsFromVariables(
        vars({ FRONTEND_URL: 'https://c.com' })
      ),
      ['https://c.com']
    )
    assert.deepEqual(await allowedOriginsFromVariables(vars({})), [])
  })
})
