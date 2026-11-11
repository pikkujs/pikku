import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { httpRouter, wireHTTP } from '@pikku/core/http'
import { authCookie } from '@pikku/core/middleware'
import type { CorePikkuMiddleware } from '@pikku/core/middleware'

import { PikkuNodeHTTPServer } from './pikku-node-http-server.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  setLevel: () => {},
}

const jwt = {
  encode: async (_expiresIn: unknown, payload: unknown) =>
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
  decode: async <T>(token: string) =>
    JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as T,
}

const cookieOf = (session: unknown) =>
  Buffer.from(JSON.stringify(session)).toString('base64url')

/**
 * `setSession` in middleware re-issues the auth cookie through this runtime's
 * response writer, exactly as a function body's does (#1451), while
 * `setInitialSession` — what auth middleware restores a session with — writes
 * nothing back.
 */
describe('a session set in middleware, over node:http', () => {
  let server: PikkuNodeHTTPServer | undefined
  let stored: Map<string, unknown>

  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()
    stored = new Map()
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      jwt,
      schema: {
        compileSchema: async () => {},
        getSchemaNames: () => new Set<string>(),
      },
      sessionStore: {
        get: async (id: string) => stored.get(id),
        set: async (id: string, session: unknown) => {
          stored.set(id, session)
        },
        clear: async (id: string) => {
          stored.delete(id)
        },
      },
    } as any)
  })

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  const serve = async (route: string, middleware: CorePikkuMiddleware[]) => {
    pikkuState(null, 'function', 'meta')[route] = {
      pikkuFuncId: route,
      inputSchemaName: null,
      outputSchemaName: null,
    } as any
    pikkuState(null, 'http', 'meta').get[route] = {
      pikkuFuncId: route,
      route,
      method: 'get',
    } as any
    wireHTTP({
      route,
      method: 'get',
      func: {
        func: async (_services: any, _data: any, wire: any) => ({
          userId: wire.session?.userId,
        }),
        middleware,
      },
    } as any)

    server = new PikkuNodeHTTPServer(
      { hostname: '127.0.0.1', port: 0 } as any,
      logger as any
    )
    await server.init()
    await server.start()
    const address = server.server.address()
    assert.ok(address && typeof address === 'object')
    return `http://127.0.0.1:${address.port}${route}`
  }

  const cookie = authCookie({
    name: 'session',
    expiresIn: { value: 1, unit: 'day' },
    options: { secure: false },
  })

  test('setSession persists the session and re-issues the cookie', async () => {
    const signIn: CorePikkuMiddleware = async (_services, wire, next) => {
      await wire.setSession?.({ userId: 'signed-in' } as any)
      await next()
    }
    const url = await serve('/sign-in', [cookie, signIn])

    const response = await fetch(url, { headers: { connection: 'close' } })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { userId: 'signed-in' })
    assert.deepEqual(stored.get('signed-in'), { userId: 'signed-in' })
    assert.match(
      response.headers.get('set-cookie') ?? '',
      new RegExp(`^session=${cookieOf({ userId: 'signed-in' })};`)
    )
  })

  test('a session restored from the cookie is not written back', async () => {
    const url = await serve('/restore', [cookie])

    const response = await fetch(url, {
      headers: {
        connection: 'close',
        cookie: `session=${cookieOf({ userId: 'cookie-user' })}`,
      },
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { userId: 'cookie-user' })
    assert.equal(stored.size, 0)
    assert.equal(response.headers.get('set-cookie'), null)
  })
})
