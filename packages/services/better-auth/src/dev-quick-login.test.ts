import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { createAuthHandler } from './auth-handler.js'
import {
  DEV_QUICK_LOGIN_USER,
  isDevQuickLoginRequest,
} from './dev-quick-login.js'

const FLAG = 'PIKKU_DEV_QUICK_LOGIN'

interface FakeAuthCalls {
  handler: Request[]
  createUser: any[]
  linkAccount: any[]
  updatePassword: any[]
  signIn: any[]
}

function createFakeAuth(opts: {
  existingUser?: { id: string; email: string }
  existingCredential?: boolean
}) {
  const calls: FakeAuthCalls = {
    handler: [],
    createUser: [],
    linkAccount: [],
    updatePassword: [],
    signIn: [],
  }
  let user = opts.existingUser ? { ...opts.existingUser } : undefined
  const accounts: Array<{ providerId: string }> = opts.existingCredential
    ? [{ providerId: 'credential' }]
    : []
  const auth = {
    options: { basePath: '/api/auth' },
    handler: async (request: Request) => {
      calls.handler.push(request)
      return new Response('better-auth-router', { status: 404 })
    },
    api: {
      signInEmail: async (input: any) => {
        calls.signIn.push(input)
        return new Response(JSON.stringify({ user }), {
          status: 200,
          headers: { 'set-cookie': 'better-auth.session_token=dev; Path=/' },
        })
      },
    },
    $context: Promise.resolve({
      password: { hash: async (password: string) => `hashed:${password}` },
      internalAdapter: {
        findUserByEmail: async (email: string) =>
          user && user.email === email ? { user } : null,
        createUser: async (input: any) => {
          calls.createUser.push(input)
          user = { id: 'u_dev', email: input.email }
          return user
        },
        findAccounts: async () => accounts,
        linkAccount: async (input: any) => {
          calls.linkAccount.push(input)
          accounts.push({ providerId: input.providerId })
        },
        updatePassword: async (userId: string, hash: string) => {
          calls.updatePassword.push({ userId, hash })
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
  xForwardedHost?: string
  xForwardedFor?: string
  extraHeaders?: Record<string, string>
}) {
  const headers: Record<string, string> = {
    host: opts.host ?? 'localhost:7071',
    ...opts.extraHeaders,
  }
  if (opts.xForwardedHost) headers['x-forwarded-host'] = opts.xForwardedHost
  if (opts.xForwardedFor) headers['x-forwarded-for'] = opts.xForwardedFor
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

/** Records the scope grants quick login makes, standing in for a ScopeService. */
function createFakeScopeService(held: string[] = []) {
  const granted: Array<{ userId: string; scope: string }> = []
  return {
    granted,
    scopeService: {
      listUserScopes: async () => held,
      addScopeToUser: async (userId: string, scope: string) => {
        granted.push({ userId, scope })
      },
    },
  }
}

async function run(opts: {
  method: string
  path?: string
  host?: string
  xForwardedHost?: string
  xForwardedFor?: string
  extraHeaders?: Record<string, string>
  auth: any
  scopeService?: any
  warnings?: string[]
}) {
  const { func } = createAuthHandler()
  const services: any = {
    logger: {
      info() {},
      warn(message: string) {
        opts.warnings?.push(message)
      },
      error() {},
    },
    auth: async () => opts.auth,
    scopeService: opts.scopeService,
  }
  const request = fakeHttpRequest({
    method: opts.method,
    path: opts.path ?? '/api/auth/dev/quick-login',
    host: opts.host,
    xForwardedHost: opts.xForwardedHost,
    xForwardedFor: opts.xForwardedFor,
    extraHeaders: opts.extraHeaders,
  })
  return (await func(services, {}, { http: { request } } as any)) as Response
}

describe('dev quick login', () => {
  afterEach(() => {
    delete process.env[FLAG]
    delete process.env.NODE_ENV
  })

  test('is inert in production even when the flag is set', async () => {
    process.env[FLAG] = 'true'
    process.env.NODE_ENV = 'production'
    const { auth, calls } = createFakeAuth({})
    const response = await run({ method: 'POST', auth })
    assert.equal(response.status, 404, 'must fall through to better-auth')
    assert.equal(calls.signIn.length, 0, 'must not mint a dev-admin session')
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

  test('POST creates the dev admin, grants both roots and signs in', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    const { granted, scopeService } = createFakeScopeService()
    const response = await run({ method: 'POST', auth, scopeService })
    assert.equal(response.status, 200)
    assert.equal(calls.createUser.length, 1)
    assert.equal(calls.createUser[0].email, DEV_QUICK_LOGIN_USER.email)
    assert.equal(calls.linkAccount.length, 1)
    assert.equal(calls.linkAccount[0].providerId, 'credential')
    assert.equal(
      calls.linkAccount[0].password,
      `hashed:${calls.signIn[0].body.password}`,
      'the linked credential is the one the sign-in uses'
    )
    assert.deepEqual(
      granted,
      [
        { userId: 'u_dev', scope: 'admin' },
        { userId: 'u_dev', scope: 'pikku:console' },
      ],
      'the console gate checks pikku:console, which admin does not cover'
    )
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
      },
      existingCredential: true,
    })
    const { granted, scopeService } = createFakeScopeService([
      'admin',
      'pikku:console',
    ])
    const response = await run({ method: 'POST', auth, scopeService })
    assert.equal(response.status, 200)
    assert.equal(calls.createUser.length, 0)
    assert.deepEqual(calls.updatePassword, [
      {
        userId: 'u_existing',
        hash: `hashed:${calls.signIn[0].body.password}`,
      },
    ])
    assert.equal(calls.signIn.length, 1)
    assert.equal(granted.length, 0)
  })

  test('the password is random, not a value from the source', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    await run({ method: 'POST', auth })
    const password: string = calls.signIn[0].body.password
    assert.notEqual(password, 'pikku-dev-password')
    assert.ok(password.length >= 64)
    assert.equal('password' in DEV_QUICK_LOGIN_USER, false)
  })

  test('a cross-site browser request is refused', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    const response = await run({
      method: 'POST',
      extraHeaders: { 'sec-fetch-site': 'cross-site' },
      auth,
    })
    assert.equal(response.status, 404)
    assert.equal(calls.signIn.length, 0)
  })

  test('a request from a non-local Origin is refused', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    for (const origin of ['https://evil.example', 'null']) {
      const response = await run({
        method: 'POST',
        extraHeaders: { origin },
        auth,
      })
      assert.equal(response.status, 404, origin)
    }
    assert.equal(calls.signIn.length, 0)
  })

  test('a request from a local Origin on another port is accepted', async () => {
    process.env[FLAG] = 'true'
    const { auth } = createFakeAuth({})
    const response = await run({
      method: 'POST',
      extraHeaders: {
        origin: 'http://localhost:5173',
        'sec-fetch-site': 'same-site',
      },
      auth,
    })
    assert.equal(response.status, 200)
  })

  test('POST still signs in, with a warning, when no ScopeService is registered', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    const warnings: string[] = []
    const response = await run({ method: 'POST', auth, warnings })
    assert.equal(response.status, 200)
    assert.equal(calls.signIn.length, 1)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /no ScopeService/)
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

  test('a spoofed X-Forwarded-Host does not make a remote request local', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    const { granted, scopeService } = createFakeScopeService()
    const response = await run({
      method: 'POST',
      host: 'app.example.com',
      xForwardedHost: 'localhost',
      auth,
      scopeService,
    })
    assert.equal(response.status, 404, 'must fall through to better-auth')
    assert.equal(calls.signIn.length, 0, 'must not mint a dev-admin session')
    assert.deepEqual(granted, [], 'must not grant the dev-admin scopes')
  })

  test('a proxied request (X-Forwarded-For present) is refused even with a loopback Host', async () => {
    process.env[FLAG] = 'true'
    const { auth, calls } = createFakeAuth({})
    const response = await run({
      method: 'POST',
      host: 'localhost:7071',
      xForwardedFor: '203.0.113.7',
      auth,
    })
    assert.equal(response.status, 404)
    assert.equal(calls.signIn.length, 0)
  })
})

describe('dev quick login against a real better-auth', () => {
  afterEach(() => {
    delete process.env[FLAG]
  })

  test('the dev admin cannot be signed into through /sign-in/email, even from an old database', async () => {
    process.env[FLAG] = 'true'
    const { betterAuth } = await import('better-auth')
    const { memoryAdapter } = await import('better-auth/adapters/memory')
    const auth = betterAuth({
      baseURL: 'http://localhost:7071',
      secret: 'a-test-secret-for-dev-quick-login-0123456789',
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
      }),
      emailAndPassword: { enabled: true },
    })
    // A dev database left behind by a version that used a fixed password.
    await auth.api.signUpEmail({
      body: {
        name: 'Dev Admin',
        email: DEV_QUICK_LOGIN_USER.email,
        password: 'pikku-dev-password',
      },
    })
    const response = await run({ method: 'POST', auth })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('set-cookie') ?? '', /session_token=/)

    // Neither the fixed password older versions used nor a guess gets in.
    for (const password of ['pikku-dev-password', 'password1234']) {
      const attempt = await auth.api.signInEmail({
        body: { email: DEV_QUICK_LOGIN_USER.email, password },
        asResponse: true,
      })
      assert.equal(attempt.status, 401, password)
    }

    // A second quick login in the same process still works.
    assert.equal((await run({ method: 'POST', auth })).status, 200)
  })
})

describe('isDevQuickLoginRequest', () => {
  afterEach(() => {
    delete process.env[FLAG]
  })

  const request = (headers: Record<string, string>) =>
    new Request('http://localhost/api/auth/dev/quick-login', {
      method: 'POST',
      headers,
    })

  test('judges each loopback spelling local and anything else remote', () => {
    process.env[FLAG] = 'true'
    for (const host of [
      'localhost',
      'localhost:3000',
      '127.0.0.1',
      '[::1]:7071',
    ]) {
      assert.equal(
        isDevQuickLoginRequest(request({ host }), '/api/auth'),
        true,
        host
      )
    }
    for (const host of [
      '',
      'example.com',
      'localhost.example.com',
      '10.0.0.1',
    ]) {
      assert.equal(
        isDevQuickLoginRequest(request({ host }), '/api/auth'),
        false,
        host
      )
    }
  })

  test('honours a custom basePath', () => {
    process.env[FLAG] = 'true'
    const custom = new Request('http://localhost/auth/dev/quick-login', {
      headers: { host: 'localhost' },
    })
    assert.equal(isDevQuickLoginRequest(custom, '/auth'), true)
    assert.equal(isDevQuickLoginRequest(custom, '/api/auth'), false)
  })

  test('refuses every proxy marker', () => {
    process.env[FLAG] = 'true'
    for (const marker of [
      'forwarded',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-proto',
    ]) {
      assert.equal(
        isDevQuickLoginRequest(
          request({ host: 'localhost', [marker]: 'x' }),
          '/api/auth'
        ),
        false,
        marker
      )
    }
  })
})
