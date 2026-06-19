import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getAuthSession } from './auth-api.js'

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
})
