import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createHttpPersonas } from './http-personas.js'
import { verifyActorSecret } from './persona-actor-secret.js'

/** The root the personas derive from; the target verifies against the same one. */
const ROOT = 'impersonation-secret-impersonation'

// Minimal target app mirroring the Better Auth actor plugin's contract:
// sign-in endpoint, exposed RPC endpoint, session by cookie.
const startTarget = async () => {
  let logins = 0
  let expireNext = false
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', async () => {
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {}
      if (req.url === '/api/auth/sign-in/actor') {
        if (!(await verifyActorSecret(ROOT, body.email, body.secret))) {
          res
            .writeHead(401)
            .end(JSON.stringify({ message: 'bad actor secret' }))
          return
        }
        logins++
        res.setHeader('set-cookie', [
          `session=s${logins}; Path=/; HttpOnly`,
          `csrf=c${logins}; Path=/`,
        ])
        res.writeHead(200).end(JSON.stringify({ ok: true, email: body.email }))
        return
      }
      if (req.url === '/api/auth/sign-in/fabric') {
        if (body.token !== 'operator-token') {
          res.writeHead(401).end(JSON.stringify({ message: 'bad operator' }))
          return
        }
        logins++
        res.setHeader('set-cookie', [`session=s${logins}; Path=/; HttpOnly`])
        res
          .writeHead(200)
          .end(JSON.stringify({ actAs: { userId: `u-${body.actAs.email}` } }))
        return
      }
      if (req.url === '/api/auth/get-session') {
        const cookie = req.headers.cookie ?? ''
        if (!cookie.includes('session=')) {
          res.writeHead(200).end('null')
          return
        }
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ user: { role: 'admin,support' } }))
        return
      }
      if (req.url?.startsWith('/api/rpc/')) {
        const cookie = req.headers.cookie ?? ''
        if (!cookie.includes('session=') || expireNext) {
          expireNext = false
          res.writeHead(401).end()
          return
        }
        const rpcName = req.url.slice('/api/rpc/'.length)
        if (rpcName === 'html-error') {
          res
            .writeHead(500, { 'content-type': 'text/html' })
            .end('<html><body>Gateway blew up</body></html>')
          return
        }
        if (rpcName === 'forbidden') {
          res
            .writeHead(403, { 'content-type': 'application/json' })
            .end(
              JSON.stringify({ message: 'MissingScopeError', scope: 'admin' })
            )
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            rpcName,
            echoed: body.data,
            cookie,
            userHeader: req.headers['x-user-id'] ?? null,
            impersonated: req.headers['x-pikku-impersonate-user-id'] ?? null,
          })
        )
        return
      }
      res.writeHead(404).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as { port: number }
  return {
    server,
    origin: `http://127.0.0.1:${port}`,
    apiUrl: `http://127.0.0.1:${port}/api`,
    loginCount: () => logins,
    expireSession: () => {
      expireNext = true
    },
  }
}

describe('HttpPersona', async () => {
  const target = await startTarget()
  after(() => target.server.close())

  const makePersonas = (
    secret: Parameters<typeof createHttpPersonas>[0]['secret'] = ROOT
  ) =>
    createHttpPersonas({
      apiUrl: target.apiUrl,
      secret,
      personas: {
        customer: {
          id: 'customer',
          name: 'Customer',
          email: 'customer@personas.invalid',
          jobTitle: 'Buyer',
          roles: [],
          goals: [],
          tags: [],
          runnable: true,
        },
        manager: {
          id: 'manager',
          name: 'Manager',
          email: 'manager@personas.invalid',
          roles: [],
          goals: [],
          tags: [],
          runnable: true,
        },
      },
    })

  test('builds one lazy persona per declaration', () => {
    const actors = makePersonas()
    assert.deepEqual(Object.keys(actors).sort(), ['customer', 'manager'])
    assert.equal(actors.customer!.name, 'customer')
    assert.equal(target.loginCount(), 0, 'no login until first invoke')
  })

  test('logs in lazily once and replays the session cookie on RPCs', async () => {
    const actors = makePersonas()

    const first = (await actors.customer!.invoke('createTodo', {
      title: 'x',
    })) as any
    const second = (await actors.customer!.invoke('listTodos', {})) as any

    assert.equal(first.rpcName, 'createTodo')
    assert.deepEqual(first.echoed, { title: 'x' })
    assert.match(first.cookie, /session=s1/)
    assert.match(first.cookie, /csrf=c1/)
    assert.match(
      second.cookie,
      /session=s1/,
      'session is cached, not re-minted'
    )
    assert.equal(target.loginCount(), 1)
  })

  test('re-logs-in once when the session expires mid-run', async () => {
    const actors = makePersonas()
    await actors.manager!.invoke('ping', {})
    const loginsBefore = target.loginCount()

    target.expireSession()
    const result = (await actors.manager!.invoke('ping', {})) as any

    assert.equal(target.loginCount(), loginsBefore + 1, 'one re-login')
    assert.match(result.cookie, new RegExp(`session=s${loginsBefore + 1}`))
  })

  test('invokeRaw returns the status and body instead of throwing', async () => {
    const actors = makePersonas()

    // A refusal is the expected outcome of a permissions scenario, so the
    // status and the payload that names the missing scope both have to survive.
    const res = await actors.customer!.invokeRaw('forbidden', {})

    assert.equal(res.status, 403)
    assert.equal(res.ok, false)
    assert.deepEqual(res.body, {
      message: 'MissingScopeError',
      scope: 'admin',
    })
  })

  test('invokeRaw reports a success the same way', async () => {
    const actors = makePersonas()
    const res = await actors.manager!.invokeRaw('listTodos', { page: 2 })

    assert.equal(res.status, 200)
    assert.equal(res.ok, true)
    assert.deepEqual((res.body as any).echoed, { page: 2 })
  })

  test('invokeRaw carries the response text so a step can search it', async () => {
    const actors = makePersonas()
    const res = await actors.customer!.invokeRaw('forbidden', {})

    assert.match(res.serialized, /MissingScopeError/)
    assert.match(res.serialized, /admin/)
  })

  test('invokeRaw keeps a non-JSON error body instead of failing to parse it', async () => {
    const actors = makePersonas()
    const res = await actors.manager!.invokeRaw('html-error', {})

    assert.equal(res.status, 500)
    assert.equal(res.ok, false)
    assert.equal(res.body, '<html><body>Gateway blew up</body></html>')
    assert.match(res.serialized, /Gateway blew up/)
  })

  test('invokeRaw reports an empty body as an empty string', async () => {
    const actors = makePersonas()
    const res = await actors.manager!.invokeRaw('listTodos', {})

    assert.equal(typeof res.serialized, 'string')
  })

  test('invokeRaw passes extra headers through', async () => {
    const actors = makePersonas()
    const res = await actors.manager!.invokeRaw(
      'whoAmI',
      {},
      { headers: { 'x-user-id': 'impersonated-1' } }
    )

    assert.equal((res.body as any).userHeader, 'impersonated-1')
  })

  test('invoke still throws on a refusal, naming the status and body', async () => {
    const actors = makePersonas()
    await assert.rejects(
      actors.customer!.invoke('forbidden', {}),
      /'forbidden' as 'customer' returned 403.*MissingScopeError/
    )
  })

  // A caller holding one persona's credential and asking for another gets the
  // target's refusal, not a client-side guess about whether it would have worked.
  test('a credential the target will not accept surfaces status and body', async () => {
    const actors = makePersonas(() => 'not-this-personas-credential')
    await assert.rejects(
      actors.customer!.invoke('ping', {}),
      /persona sign-in failed for 'customer' \(401\).*bad actor secret/
    )
  })

  // An app whose auth is under `/api` but whose RPCs are not cannot put the
  // mount in `apiUrl`, so it moves `signInPath` instead. The session read has
  // to follow it: a 404 there reads as 'this stage does not report roles' and
  // silently turns the role check off.
  test('reads the session from the mount the sign-in path names', async () => {
    const actors = createHttpPersonas({
      apiUrl: target.origin,
      secret: ROOT,
      signInPath: '/api/auth/sign-in/actor',
      rpcPath: '/api/rpc',
      personas: {
        manager: {
          id: 'manager',
          name: 'Manager',
          email: 'manager@personas.invalid',
          roles: ['admin'],
          goals: [],
          tags: [],
          runnable: true,
        },
      },
    })

    assert.deepEqual(await actors.manager!.sessionRoles(), ['admin', 'support'])
  })

  // The operator handshake sits under the same mount and must be derived from
  // it, not inherited verbatim: posting an operator token to the ACTOR path is
  // a validation error about a missing email, which reads like a broken
  // persona rather than a wrong URL.
  test('derives the operator sign-in path from the same auth mount', async () => {
    const actors = createHttpPersonas({
      apiUrl: target.origin,
      signInPath: '/api/auth/sign-in/actor',
      rpcPath: '/api/rpc',
      operator: { token: 'operator-token' },
      personas: {
        manager: {
          id: 'manager',
          name: 'Manager',
          email: 'manager@personas.invalid',
          roles: ['admin'],
          goals: [],
          tags: [],
          runnable: true,
        },
      },
    })

    const result = (await actors.manager!.invoke('ping', {})) as any
    assert.equal(result.rpcName, 'ping')
    assert.equal(result.impersonated, 'u-manager@personas.invalid')
  })
})
