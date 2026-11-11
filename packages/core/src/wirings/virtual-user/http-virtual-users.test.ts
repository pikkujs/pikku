import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createHttpVirtualUsers } from './http-virtual-users.js'
import { statementSignIn } from '../../services/virtual-user-sign-in.js'

/** Stands in for a signed statement: the target accepts exactly this shape. */
const statementFor = (email: string) => `statement-for:${email}`

const signInWith = (
  apiUrl: string,
  mint: (virtualUser: { email: string }) => string = (v) =>
    statementFor(v.email),
  signInPath?: string
) => statementSignIn({ apiUrl, signInPath, mint })

// Minimal target app mirroring the Better Auth virtual user plugin's contract:
// sign-in endpoint, exposed RPC endpoint, session by cookie.
const startTarget = async () => {
  let logins = 0
  let expireNext = false
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    const handleRequest = async () => {
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {}
      if (req.url === '/api/auth/sign-in/virtual-user') {
        const email = String(body.statement ?? '').replace(
          /^statement-for:/,
          ''
        )
        if (body.statement !== statementFor(email)) {
          res.writeHead(401).end(JSON.stringify({ message: 'bad statement' }))
          return
        }
        logins++
        res.setHeader('set-cookie', [
          `session=s${logins}; Path=/; HttpOnly`,
          `csrf=c${logins}; Path=/`,
        ])
        res.writeHead(200).end(JSON.stringify({ ok: true, email: email }))
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
        if (rpcName === 'getMyScopes') {
          res
            .writeHead(200, { 'content-type': 'application/json' })
            .end(JSON.stringify({ scopes: ['stays:read'], roles: ['guest'] }))
          return
        }
        if (rpcName === 'noSuchRpc') {
          res.writeHead(404).end()
          return
        }
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
          })
        )
        return
      }
      res.writeHead(404).end()
    }
    req.on('end', () => {
      handleRequest().catch((e) => {
        res.writeHead(500).end(String(e))
      })
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

describe('HttpVirtualUser', async () => {
  const target = await startTarget()
  after(() => target.server.close())

  const makeVirtualUsers = (
    mint?: (virtualUser: { email: string }) => string
  ) =>
    createHttpVirtualUsers({
      apiUrl: target.apiUrl,
      signIn: signInWith(target.apiUrl, mint),
      virtualUsers: {
        customer: {
          id: 'customer',
          name: 'Customer',
          email: 'customer@virtualuser.invalid',
          jobTitle: 'Buyer',
          roles: [],
          goals: [],
          tags: [],
          runnable: true,
        },
        manager: {
          id: 'manager',
          name: 'Manager',
          email: 'manager@virtualuser.invalid',
          roles: [],
          goals: [],
          tags: [],
          runnable: true,
        },
      },
    })

  test('builds one lazy virtual user per declaration', () => {
    const virtualUsers = makeVirtualUsers()
    assert.deepEqual(Object.keys(virtualUsers).sort(), ['customer', 'manager'])
    assert.equal(virtualUsers.customer!.name, 'customer')
    assert.equal(target.loginCount(), 0, 'no login until first invoke')
  })

  test('logs in lazily once and replays the session cookie on RPCs', async () => {
    const virtualUsers = makeVirtualUsers()

    const first = (await virtualUsers.customer!.invoke('createTodo', {
      title: 'x',
    })) as any
    const second = (await virtualUsers.customer!.invoke('listTodos', {})) as any

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
    const virtualUsers = makeVirtualUsers()
    await virtualUsers.manager!.invoke('ping', {})
    const loginsBefore = target.loginCount()

    target.expireSession()
    const result = (await virtualUsers.manager!.invoke('ping', {})) as any

    assert.equal(target.loginCount(), loginsBefore + 1, 'one re-login')
    assert.match(result.cookie, new RegExp(`session=s${loginsBefore + 1}`))
  })

  test('invokeRaw returns the status and body instead of throwing', async () => {
    const virtualUsers = makeVirtualUsers()

    // A refusal is the expected outcome of a permissions scenario, so the
    // status and the payload that names the missing scope both have to survive.
    const res = await virtualUsers.customer!.invokeRaw('forbidden', {})

    assert.equal(res.status, 403)
    assert.equal(res.ok, false)
    assert.deepEqual(res.body, {
      message: 'MissingScopeError',
      scope: 'admin',
    })
  })

  test('invokeRaw reports a success the same way', async () => {
    const virtualUsers = makeVirtualUsers()
    const res = await virtualUsers.manager!.invokeRaw('listTodos', { page: 2 })

    assert.equal(res.status, 200)
    assert.equal(res.ok, true)
    assert.deepEqual((res.body as any).echoed, { page: 2 })
  })

  test('invokeRaw carries the response text so a step can search it', async () => {
    const virtualUsers = makeVirtualUsers()
    const res = await virtualUsers.customer!.invokeRaw('forbidden', {})

    assert.match(res.serialized, /MissingScopeError/)
    assert.match(res.serialized, /admin/)
  })

  test('invokeRaw keeps a non-JSON error body instead of failing to parse it', async () => {
    const virtualUsers = makeVirtualUsers()
    const res = await virtualUsers.manager!.invokeRaw('html-error', {})

    assert.equal(res.status, 500)
    assert.equal(res.ok, false)
    assert.equal(res.body, '<html><body>Gateway blew up</body></html>')
    assert.match(res.serialized, /Gateway blew up/)
  })

  test('invokeRaw reports an empty body as an empty string', async () => {
    const virtualUsers = makeVirtualUsers()
    const res = await virtualUsers.manager!.invokeRaw('listTodos', {})

    assert.equal(typeof res.serialized, 'string')
  })

  test('invokeRaw passes extra headers through', async () => {
    const virtualUsers = makeVirtualUsers()
    const res = await virtualUsers.manager!.invokeRaw(
      'whoAmI',
      {},
      { headers: { 'x-user-id': 'impersonated-1' } }
    )

    assert.equal((res.body as any).userHeader, 'impersonated-1')
  })

  test('invoke still throws on a refusal, naming the status and body', async () => {
    const virtualUsers = makeVirtualUsers()
    await assert.rejects(
      virtualUsers.customer!.invoke('forbidden', {}),
      /'forbidden' as 'customer' returned 403.*MissingScopeError/
    )
  })

  // A statement naming someone else gets the target's refusal, not a
  // client-side guess about whether it would have worked.
  test('a statement the target will not accept surfaces status and body', async () => {
    const virtualUsers = makeVirtualUsers(() => 'not-a-statement-for-anyone')
    await assert.rejects(
      virtualUsers.customer!.invoke('ping', {}),
      /virtual user sign-in failed for 'customer' \(401\).*bad statement/
    )
  })

  // An app whose auth is under `/api` but whose RPCs are not cannot put the
  // mount in `apiUrl`, so it moves `signInPath` instead. The session read has
  // to follow it: a 404 there reads as 'this stage does not report roles' and
  // silently turns the role check off.
  //
  // `rolesRpc: false` because this is about the better-auth path specifically —
  // leaving the RPC in would answer first and the mount would go untested.
  test('reads the session from the mount the sign-in path names', async () => {
    const virtualUsers = createHttpVirtualUsers({
      apiUrl: target.origin,
      signIn: signInWith(
        target.origin,
        undefined,
        '/api/auth/sign-in/virtual-user'
      ),
      signInPath: '/api/auth/sign-in/virtual-user',
      rpcPath: '/api/rpc',
      rolesRpc: false,
      virtualUsers: {
        manager: {
          id: 'manager',
          name: 'Manager',
          email: 'manager@virtualuser.invalid',
          roles: ['admin'],
          goals: [],
          tags: [],
          runnable: true,
        },
      },
    })

    assert.deepEqual(await virtualUsers.manager!.sessionRoles(), [
      'admin',
      'support',
    ])
  })

  // Scopes are the model in an app that authorizes on them; better-auth's
  // `user.role` is a projection kept in step for its own admin endpoints, and
  // is absent entirely from an app that declares no such field. Reading the
  // projection is how a guest holding exactly what it should got refused for
  // "roles drifted".
  test('reads roles from the app RPC in preference to better-auth', async () => {
    const virtualUsers = createHttpVirtualUsers({
      apiUrl: target.origin,
      signIn: signInWith(
        target.origin,
        undefined,
        '/api/auth/sign-in/virtual-user'
      ),
      signInPath: '/api/auth/sign-in/virtual-user',
      rpcPath: '/api/rpc',
      virtualUsers: {
        manager: {
          id: 'manager',
          name: 'Manager',
          email: 'manager@virtualuser.invalid',
          roles: ['guest'],
          goals: [],
          tags: [],
          runnable: true,
        },
      },
    })

    assert.deepEqual(await virtualUsers.manager!.sessionRoles(), ['guest'])
  })

  // An app without the RPC is not an app reporting "no roles" — going quiet
  // there would turn every virtual user into a mismatch against an empty list.
  test('falls back to better-auth when the roles RPC is absent', async () => {
    const virtualUsers = createHttpVirtualUsers({
      apiUrl: target.origin,
      signIn: signInWith(
        target.origin,
        undefined,
        '/api/auth/sign-in/virtual-user'
      ),
      signInPath: '/api/auth/sign-in/virtual-user',
      rpcPath: '/api/rpc',
      rolesRpc: 'noSuchRpc',
      virtualUsers: {
        manager: {
          id: 'manager',
          name: 'Manager',
          email: 'manager@virtualuser.invalid',
          roles: ['admin'],
          goals: [],
          tags: [],
          runnable: true,
        },
      },
    })

    assert.deepEqual(await virtualUsers.manager!.sessionRoles(), [
      'admin',
      'support',
    ])
  })
})
