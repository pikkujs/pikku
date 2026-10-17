import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createResolvedAuthGetter, getAuthSession } from './auth-api.js'

describe('getAuthSession', () => {
  test('reads a session from a direct Better Auth instance', async () => {
    const session = await getAuthSession(
      {
        handler: async () => new Response(null, { status: 204 }),
        api: {
          getSession: async ({ headers }: { headers: Headers }) => ({
            cookie: headers.get('cookie'),
          }),
        },
      },
      new Request('https://example.com/me', {
        headers: { cookie: 'better-auth.session_token=abc' },
      })
    )

    assert.deepEqual(session, { cookie: 'better-auth.session_token=abc' })
  })

  test('supports Pikku auth factories', async () => {
    let configCalls = 0
    let serviceCalls = 0
    let authCalls = 0

    const first = await getAuthSession(
      async (_services: any) => {
        authCalls += 1
        return {
          handler: async () => new Response(null, { status: 204 }),
          api: {
            getSession: async ({ headers }: { headers: Headers }) => ({
              cookie: headers.get('cookie'),
            }),
          },
        }
      },
      new Headers({ cookie: 'one=1' }),
      async () => {
        configCalls += 1
        return {} as any
      },
      async (_config) => {
        serviceCalls += 1
        return {} as any
      }
    )
    const second = await getAuthSession(
      async (_services: any) => {
        authCalls += 1
        return {
          handler: async () => new Response(null, { status: 204 }),
          api: {
            getSession: async ({ headers }: { headers: Headers }) => ({
              cookie: headers.get('cookie'),
            }),
          },
        }
      },
      new Headers({ cookie: 'two=2' }),
      async () => {
        configCalls += 1
        return {} as any
      },
      async (_config) => {
        serviceCalls += 1
        return {} as any
      }
    )

    assert.deepEqual(first, { cookie: 'one=1' })
    assert.deepEqual(second, { cookie: 'two=2' })
    assert.equal(configCalls, 2)
    assert.equal(serviceCalls, 2)
    assert.equal(authCalls, 2)
  })

  test('rejects auth factories without singleton services', async () => {
    await assert.rejects(
      async () =>
        await createResolvedAuthGetter(async (_services: any) => {
          return {
            handler: async () => new Response(null, { status: 204 }),
            api: { getSession: async () => null },
          }
        })(),
      /createSingletonServices is required/
    )
  })

  test('builds a factory, its config and its services once across calls', async () => {
    let configCalls = 0
    let serviceCalls = 0
    let authCalls = 0
    const factory = async (_services: any) => {
      authCalls += 1
      return {
        handler: async () => new Response(null, { status: 204 }),
        api: {
          getSession: async ({ headers }: { headers: Headers }) => ({
            cookie: headers.get('cookie'),
          }),
        },
      }
    }
    const createConfig = async () => {
      configCalls += 1
      return {} as any
    }
    const createSingletonServices = async (_config: any) => {
      serviceCalls += 1
      return {} as any
    }

    const sessions = await Promise.all(
      ['a=1', 'b=2', 'c=3'].map((cookie) =>
        getAuthSession(
          factory,
          new Headers({ cookie }),
          createConfig,
          createSingletonServices
        )
      )
    )

    assert.deepEqual(sessions, [
      { cookie: 'a=1' },
      { cookie: 'b=2' },
      { cookie: 'c=3' },
    ])
    assert.equal(configCalls, 1)
    assert.equal(serviceCalls, 1)
    assert.equal(authCalls, 1)
  })

  test('a failed build is retried on the next call rather than cached', async () => {
    let attempts = 0
    const factory = async (_services: any) => {
      attempts += 1
      if (attempts === 1) throw new Error('database not ready')
      return {
        handler: async () => new Response(null, { status: 204 }),
        api: { getSession: async () => ({ ok: true }) },
      }
    }
    const createSingletonServices = async () => ({}) as any
    await assert.rejects(
      getAuthSession(
        factory,
        new Headers(),
        undefined,
        createSingletonServices
      ),
      /database not ready/
    )
    assert.deepEqual(
      await getAuthSession(
        factory,
        new Headers(),
        undefined,
        createSingletonServices
      ),
      { ok: true }
    )
  })
})
