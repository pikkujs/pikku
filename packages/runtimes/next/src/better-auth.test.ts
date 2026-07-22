import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { toNextJsAuthHandler } from './better-auth.js'

describe('toNextJsAuthHandler', () => {
  test('passes direct auth handlers through', async () => {
    const handlers = toNextJsAuthHandler(async (request: Request) => {
      return new Response(request.method, { status: 200 })
    })

    const response = await handlers.POST(
      new Request('https://example.com/api/auth/sign-in', { method: 'POST' })
    )

    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'POST')
  })

  test('lazily resolves a Pikku auth factory once', async () => {
    let configCalls = 0
    let serviceCalls = 0
    let authCalls = 0

    const handlers = toNextJsAuthHandler(
      async (_services: any) => {
        authCalls += 1
        return {
          handler: async (request: Request) =>
            new Response(`${request.method}:${request.url}`),
          api: {},
        }
      },
      async () => {
        configCalls += 1
        return {} as any
      },
      async (_config) => {
        serviceCalls += 1
        return {} as any
      }
    )

    const first = await handlers.GET(
      new Request('https://example.com/api/auth/get-session')
    )
    const second = await handlers.POST(
      new Request('https://example.com/api/auth/sign-in', { method: 'POST' })
    )

    assert.equal(
      await first.text(),
      'GET:https://example.com/api/auth/get-session'
    )
    assert.equal(
      await second.text(),
      'POST:https://example.com/api/auth/sign-in'
    )
    assert.equal(configCalls, 1)
    assert.equal(serviceCalls, 1)
    assert.equal(authCalls, 1)
  })

  test('rejects factory usage without singleton services', () => {
    assert.throws(
      () =>
        toNextJsAuthHandler(
          async (_services: any) =>
            ({
              handler: async () => new Response('ok'),
              api: {},
            }) as any,
          async () => ({}) as any
        ),
      /createSingletonServices is required/
    )
  })
})
