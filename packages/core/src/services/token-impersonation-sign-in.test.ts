import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createHttpPersonas } from './http-personas.js'
import type { PersonaSignIn, PersonaSignInFactory } from './persona-sign-in.js'
import { PikkuError } from '../errors/error-handler.js'

const TOKEN = 'impersonator.jwt.token'
const HEADER = 'x-pikku-impersonate-user-id'

type Mode = 'ok' | 'forbidden' | 'no-cookie' | 'no-user'

const tokenImpersonation =
  (options: { token: string; path?: string }): PersonaSignInFactory =>
  (ctx) => {
    let userId: string | null = null
    const path = options.path ?? '/auth/sign-in/fabric'
    const signIn: PersonaSignIn = {
      async login(_jar, persona) {
        const res = await ctx.fetch(`${ctx.apiUrl}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: options.token,
            actAs: { email: persona.email },
          }),
        })
        if (!res.ok) {
          const body = (await res.text().catch(() => '')).slice(0, 300)
          throw new PikkuError(
            `[scenario] operator sign-in failed for '${persona.id}' (${res.status}): ${body}`
          )
        }
        if ((res.headers.getSetCookie?.() ?? []).length === 0) {
          throw new PikkuError(
            `[scenario] operator sign-in for '${persona.id}' returned no session cookie`
          )
        }
        const body = (await res.json().catch(() => null)) as {
          actAs?: { userId?: unknown }
        } | null
        const resolved = body?.actAs?.userId
        if (!resolved) {
          throw new PikkuError(
            `[scenario] operator sign-in for '${persona.id}' returned no user to act as — ` +
              'the target is running a @pikku/better-auth too old to resolve one'
          )
        }
        userId = String(resolved)
      },
      headers() {
        if (!userId) {
          throw new Error(
            '[scenario] operator session has no persona to act as — login() first'
          )
        }
        return { [HEADER]: userId }
      },
    }
    return signIn
  }

const startStage = async (mode: Mode) => {
  const signInRequests: Array<{
    headers: Record<string, unknown>
    body: unknown
  }> = []
  const rpcRequests: Array<{ cookie: string; impersonate: unknown }> = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {}
      const url = new URL(req.url ?? '/', 'http://stage.invalid')
      if (url.pathname === '/api/auth/sign-in/fabric') {
        signInRequests.push({ headers: req.headers, body })
        if (mode === 'forbidden') {
          res.writeHead(403).end('operator token rejected')
          return
        }
        if (mode !== 'no-cookie') {
          res.setHeader('set-cookie', [
            'session=admin; Path=/; HttpOnly',
            'csrf=abc; Path=/',
          ])
        }
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(
            JSON.stringify(
              mode === 'no-user'
                ? { token: 'x' }
                : { actAs: { userId: 'user-7' } }
            )
          )
        return
      }
      if (url.pathname.startsWith('/api/rpc/')) {
        rpcRequests.push({
          cookie: req.headers.cookie ?? '',
          impersonate: req.headers[HEADER] ?? null,
        })
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ ok: true }))
        return
      }
      res.writeHead(404).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as { port: number }).port
  return {
    apiUrl: `http://127.0.0.1:${port}/api`,
    server,
    signInRequests,
    rpcRequests,
  }
}

const persona = {
  id: 'customer',
  name: 'Customer',
  email: 'customer@personas.invalid',
  roles: ['client'],
  goals: [],
  tags: [],
  runnable: true,
}

type Variant = 'operator' | 'hook'

const drive = async (variant: Variant, mode: Mode) => {
  const stage = await startStage(mode)
  try {
    const personas = createHttpPersonas({
      apiUrl: stage.apiUrl,
      ...(variant === 'operator'
        ? { operator: { token: TOKEN } }
        : { signIn: tokenImpersonation({ token: TOKEN }) }),
      personas: { customer: persona },
    })
    let error: Error | null = null
    try {
      await personas.customer!.invoke('whoami', {})
      await personas.customer!.invoke('whoami', {})
    } catch (e) {
      error = e as Error
    }
    return {
      error,
      signInRequests: stage.signInRequests.map((r) => ({
        body: r.body,
        contentType: r.headers['content-type'],
        originIsStage: r.headers.origin === new URL(stage.apiUrl).origin,
      })),
      rpcRequests: stage.rpcRequests,
    }
  } finally {
    stage.server.close()
  }
}

describe('token-impersonation sign-in as a plugin', () => {
  test('behaves identically to the built-in operator flow on success', async () => {
    const built = await drive('operator', 'ok')
    const hook = await drive('hook', 'ok')
    assert.equal(built.error, null)
    assert.equal(hook.error, null)
    assert.deepEqual(hook.signInRequests, built.signInRequests)
    assert.deepEqual(hook.rpcRequests, built.rpcRequests)
    assert.equal(hook.signInRequests.length, 1)
    assert.deepEqual(hook.signInRequests[0]!.body, {
      token: TOKEN,
      actAs: { email: persona.email },
    })
    assert.equal(hook.rpcRequests.length, 2)
    for (const request of hook.rpcRequests) {
      assert.equal(request.impersonate, 'user-7')
      assert.match(request.cookie, /session=admin/)
      assert.match(request.cookie, /csrf=abc/)
    }
  })

  for (const mode of ['forbidden', 'no-cookie', 'no-user'] as const) {
    test(`fails the same way as the built-in flow: ${mode}`, async () => {
      const built = await drive('operator', mode)
      const hook = await drive('hook', mode)
      assert.ok(built.error)
      assert.ok(hook.error)
      assert.equal(hook.error!.message, built.error!.message)
      assert.equal(hook.error!.constructor.name, built.error!.constructor.name)
      assert.deepEqual(hook.signInRequests, built.signInRequests)
      assert.deepEqual(hook.rpcRequests, [])
    })
  }

  test('headers() before login throws like the built-in flow', () => {
    const plugin = tokenImpersonation({ token: TOKEN })({
      apiUrl: 'http://x.invalid',
      fetch,
    })
    assert.throws(() => plugin.headers(), /has no persona to act as/)
  })

  test('a factory gets one instance per persona, so state is not shared', async () => {
    const stage = await startStage('ok')
    try {
      let built = 0
      const factory = tokenImpersonation({ token: TOKEN })
      const personas = createHttpPersonas({
        apiUrl: stage.apiUrl,
        signIn: (ctx) => {
          built++
          return factory(ctx)
        },
        personas: {
          a: { ...persona, id: 'a' },
          b: { ...persona, id: 'b' },
        },
      })
      await personas.a!.invoke('whoami', {})
      await personas.b!.invoke('whoami', {})
      assert.equal(built, 2)
    } finally {
      stage.server.close()
    }
  })

  test('the factory is handed apiUrl, a fetch and the configured signInPath', () => {
    let seen: any
    createHttpPersonas({
      apiUrl: 'http://x.invalid/api',
      signInPath: '/api/auth/sign-in/custom',
      signIn: (ctx) => {
        seen = ctx
        return { login: async () => {}, headers: () => ({}) }
      },
      personas: { customer: persona },
    })
    assert.equal(seen.apiUrl, 'http://x.invalid/api')
    assert.equal(seen.signInPath, '/api/auth/sign-in/custom')
    assert.equal(typeof seen.fetch, 'function')
  })

  test('a plain instance is accepted too', async () => {
    const stage = await startStage('ok')
    try {
      let userId = ''
      const personas = createHttpPersonas({
        apiUrl: stage.apiUrl,
        signIn: {
          login: async (jar, p) => {
            const res = await jar.fetch(`${stage.apiUrl}/auth/sign-in/fabric`, {
              method: 'POST',
              body: JSON.stringify({ token: TOKEN, actAs: { email: p.email } }),
            })
            userId = ((await res.json()) as any).actAs.userId
          },
          headers: () => ({ [HEADER]: userId }),
        },
        personas: { customer: persona },
      })
      await personas.customer!.invoke('whoami', {})
      assert.equal(stage.rpcRequests[0]!.impersonate, 'user-7')
      assert.match(stage.rpcRequests[0]!.cookie, /session=admin/)
    } finally {
      stage.server.close()
    }
  })

  test('signIn is mutually exclusive with secret and operator', () => {
    const signIn = tokenImpersonation({ token: TOKEN })
    assert.throws(
      () =>
        createHttpPersonas({
          apiUrl: 'http://x.invalid',
          signIn,
          secret: 's',
          personas: { customer: persona },
        }),
      /'signIn' replaces secret/
    )
    assert.throws(
      () =>
        createHttpPersonas({
          apiUrl: 'http://x.invalid',
          signIn,
          operator: { token: TOKEN },
          personas: {},
        }),
      /'signIn' replaces operator/
    )
  })
})
