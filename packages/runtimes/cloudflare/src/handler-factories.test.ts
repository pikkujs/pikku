import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { constantTimeEqual } from './dispatch-auth.js'
// Type-only, so it is erased before runtime and does not load the module ahead
// of the `cloudflare:workers` stub registered below.
import type { createCloudflareHandler as CreateCloudflareHandler } from './handler-factories.js'

// `cloudflare:workers` only exists inside the workerd runtime. The handler
// factories import `WorkerEntrypoint` from it at module scope, so stub the
// specifier before the module graph is loaded to exercise the real fetch()
// routing under `node --test`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') {
      return {
        url: 'data:text/javascript,export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env } }',
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})

type CreateHandler = typeof CreateCloudflareHandler

let createCloudflareHandler: CreateHandler

const factories = {
  createConfig: async () => ({}),
  createSingletonServices: async () =>
    ({
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    }) as any,
}

const dispatchRequest = async (
  env: Record<string, unknown>,
  pathname: string,
  headers: Record<string, string> = {}
) => {
  const Handler = createCloudflareHandler(factories, ['queue', 'scheduled'])
  const handler = new Handler({} as any, env as any)
  return handler.fetch(
    new Request(`https://unit.example.com${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        queueName: 'no-such-queue',
        data: {},
        taskName: 'no-such-task',
      }),
    })
  )
}

describe('constantTimeEqual', () => {
  test('matches identical values', async () => {
    assert.equal(
      await constantTimeEqual('correct-horse', 'correct-horse'),
      true
    )
  })

  test('matches empty values', async () => {
    assert.equal(await constantTimeEqual('', ''), true)
  })

  test('rejects values differing in a single byte', async () => {
    assert.equal(
      await constantTimeEqual('correct-horse', 'correct-horsE'),
      false
    )
  })

  test('rejects values differing only in length', async () => {
    assert.equal(
      await constantTimeEqual('correct-horse', 'correct-horse '),
      false
    )
  })

  test('rejects a prefix of the expected value', async () => {
    assert.equal(await constantTimeEqual('correct', 'correct-horse'), false)
  })

  test('handles multi-byte characters', async () => {
    assert.equal(await constantTimeEqual('sécret-🔐', 'sécret-🔐'), true)
    assert.equal(await constantTimeEqual('sécret-🔐', 'secret-🔐'), false)
  })
})

describe('cloudflare dispatch routes', () => {
  before(async () => {
    ;({ createCloudflareHandler } = await import('./handler-factories.js'))
  })

  // Status the route reports once past auth for a job/task that has no
  // generated meta — proof the request reached the handler body.
  const unknownJobStatus = {
    '/__pikku/queue-job': 422,
    '/__pikku/scheduler-job': 503,
  }

  for (const [pathname, pastAuthStatus] of Object.entries(unknownJobStatus)) {
    describe(pathname, () => {
      test('rejects when no dispatch secret is configured', async () => {
        const response = await dispatchRequest({}, pathname)
        assert.equal(response.status, 401)
      })

      test('rejects when the dispatch secret is configured but absent', async () => {
        const response = await dispatchRequest(
          { PIKKU_DISPATCH_SECRET: 'correct-horse' },
          pathname
        )
        assert.equal(response.status, 401)
      })

      test('rejects a wrong dispatch secret', async () => {
        const response = await dispatchRequest(
          { PIKKU_DISPATCH_SECRET: 'correct-horse' },
          pathname,
          { 'x-pikku-dispatch': 'battery-staple' }
        )
        assert.equal(response.status, 401)
      })

      test('rejects a dispatch secret of the wrong length', async () => {
        const response = await dispatchRequest(
          { PIKKU_DISPATCH_SECRET: 'correct-horse' },
          pathname,
          { 'x-pikku-dispatch': 'correct-horse-battery' }
        )
        assert.equal(response.status, 401)
      })

      test('reveals nothing about why the request was rejected', async () => {
        const response = await dispatchRequest({}, pathname)
        const body = await response.text()
        assert.equal(body.includes('PIKKU_DISPATCH_SECRET'), false)
        assert.equal(/unset|missing|mismatch/i.test(body), false)
      })

      test('proceeds past auth with the correct dispatch secret', async () => {
        const response = await dispatchRequest(
          { PIKKU_DISPATCH_SECRET: 'correct-horse' },
          pathname,
          { 'x-pikku-dispatch': 'correct-horse' }
        )
        assert.equal(response.status, pastAuthStatus)
      })
    })
  }
})
