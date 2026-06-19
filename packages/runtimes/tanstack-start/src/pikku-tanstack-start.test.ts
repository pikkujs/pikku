import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { toTanStackStartAuthHandler } from './pikku-tanstack-start.js'

describe('toTanStackStartAuthHandler', () => {
  test('passes direct auth handlers through', async () => {
    const handler = toTanStackStartAuthHandler(async (request: Request) => {
      return new Response(`ok:${request.method}`, { status: 200 })
    })

    const response = await handler({
      request: new Request('https://example.com/api/auth/sign-up', {
        method: 'POST',
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'ok:POST')
  })

  test('lazily resolves a Pikku auth factory once', async () => {
    let configCalls = 0
    let serviceCalls = 0
    let authCalls = 0

    const handler = toTanStackStartAuthHandler(
      async (_services: any) => {
        authCalls += 1
        return {
          handler: async (request: Request) => new Response(request.url),
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

    const first = await handler({
      request: new Request('https://example.com/api/auth/get-session'),
    })
    const second = await handler({
      request: new Request('https://example.com/api/auth/sign-out', {
        method: 'POST',
      }),
    })

    assert.equal(await first.text(), 'https://example.com/api/auth/get-session')
    assert.equal(await second.text(), 'https://example.com/api/auth/sign-out')
    assert.equal(configCalls, 1)
    assert.equal(serviceCalls, 1)
    assert.equal(authCalls, 1)
  })

  test('rejects factory usage without singleton services', async () => {
    assert.throws(
      () =>
        toTanStackStartAuthHandler(
          async (_services: any) =>
            ({
              handler: async () => new Response('ok'),
              api: {},
            }) as any,
          async () => ({} as any)
        ),
      /createSingletonServices is required/
    )
  })
})
