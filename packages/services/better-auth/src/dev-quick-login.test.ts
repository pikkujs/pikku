import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { createAuthHandler } from './auth-handler.js'
import { DEV_QUICK_LOGIN_USER } from './dev-quick-login.js'

const FLAG = 'PIKKU_DEV_QUICK_LOGIN'

interface FakeAuthCalls {
  handler: Request[]
  signUp: any[]
  signIn: any[]
  roleUpdates: Array<{ userId: string; update: any }>
}

function createFakeAuth(opts: {
  existingUser?: { id: string; email: string; role?: string }
  signUpError?: Error
}) {
  const calls: FakeAuthCalls = {
    handler: [],
    signUp: [],
    signIn: [],
    roleUpdates: [],
  }
  let user = opts.existingUser ? { ...opts.existingUser } : undefined
  const auth = {
    options: { basePath: '/api/auth' },
    handler: async (request: Request) => {
      calls.handler.push(request)
      return new Response('better-auth-router', { status: 404 })
    },
    api: {
      signUpEmail: async (input: any) => {
        calls.signUp.push(input)
        if (opts.signUpError) {
          throw opts.signUpError
        }
        user = { id: 'u_dev', email: input.body.email, role: 'user' }
        return { user }
      },
      signInEmail: async (input: any) => {
        calls.signIn.push(input)
        return new Response(JSON.stringify({ user }), {
          status: 200,
          headers: { 'set-cookie': 'better-auth.session_token=dev; Path=/' },
        })
      },
    },
    $context: Promise.resolve({
      internalAdapter: {
        findUserByEmail: async (email: string) =>
          user && user.email === email ? { user } : null,
        updateUser: async (userId: string, update: any) => {
          calls.roleUpdates.push({ userId, update })
          user = { ...user!, ...update }
          return user
        },
      },
    }),
  }
  return { auth, calls }
}

function fakeHttpRequest(opts: {
  method: string
  path: string
  host?: string
}) {
  const headers: Record<string, string> = {
    host: opts.host ?? 'localhost:7071',
  }
  return {
    header: (name: string) => headers[name.toLowerCase()],
    headers: () => headers,
    path: () => opts.path,
    query: () => ({}),
    method: () => opts.method,
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => ({}),
  }
}

async function run(opts: {
  method: string
  path?: string
  host?: string
  auth: any
}) {
  const { func } = createAuthHandler()
  const services: any = {
    logger: { info() {}, warn() {}, error() {} },
    auth: async () => opts.auth,
  }
  const request = fakeHttpRequest({
    method: opts.method,
    path: opts.path ?? '/api/auth/dev/quick-login',
    host: opts.host,
  })
  return (await func(services, {}, { http: { request } } as any)) as Response
}

describe('dev quick login', () => {
  afterEach(() => {
    delete process.env[FLAG]
  })

  test('falls through to better-auth when the flag is not set', async () => {
    const { auth, calls } = createFakeAuth({})
    const response = await run({ method: 'GET', auth })
    assert.equal(response.status, 404)
    assert.equal(calls.handler.length, 1)
    assert.equal(calls.signIn.length, 0)
  })

  test('falls through to better-auth for non-local hosts', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    const response = await run({
      method: 'POST',
      host: 'app.example.com',
      auth,
    })
    assert.equal(response.status, 404)
    assert.equal(calls.handler.length, 1)
    assert.equal(calls.signIn.length, 0)
  })

  test('falls through to better-auth for other auth paths', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    const response = await run({
      method: 'POST',
      path: '/api/auth/sign-in/email',
      auth,
    })
    assert.equal(response.status, 404)
    assert.equal(calls.handler.length, 1)
  })

  test('GET reports availability and the dev admin email', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    const response = await run({ method: 'GET', auth })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      enabled: true,
      email: DEV_QUICK_LOGIN_USER.email,
    })
    assert.equal(calls.handler.length, 0)
  })

  test('POST creates the dev admin, promotes the role and signs in', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    const response = await run({ method: 'POST', auth })
    assert.equal(response.status, 200)
    assert.equal(calls.signUp.length, 1)
    assert.equal(calls.signUp[0].body.email, DEV_QUICK_LOGIN_USER.email)
    assert.deepEqual(calls.roleUpdates, [
      { userId: 'u_dev', update: { role: 'admin' } },
    ])
    assert.equal(calls.signIn.length, 1)
    assert.equal(calls.signIn[0].body.email, DEV_QUICK_LOGIN_USER.email)
    assert.equal(calls.signIn[0].asResponse, true)
    assert.match(
      response.headers.get('set-cookie') ?? '',
      /better-auth\.session_token/
    )
  })

  test('POST signs in when the dev admin already exists', async () => {
    process.env[FLAG] = '1'
    const { auth, calls } = createFakeAuth({
      existingUser: {
        id: 'u_existing',
        email: DEV_QUICK_LOGIN_USER.email,
        role: 'admin',
      },
      signUpError: new Error('user already exists'),
    })
    const response = await run({ method: 'POST', auth })
    assert.equal(response.status, 200)
    assert.equal(calls.signIn.length, 1)
    assert.equal(calls.roleUpdates.length, 0)
  })

  test('127.0.0.1 counts as local', async () => {
    process.env[FLAG] = 'true'
    const { auth } = createFakeAuth({})
    const response = await run({
      method: 'GET',
      host: '127.0.0.1:7071',
      auth,
    })
    assert.equal(response.status, 200)
  })
})
