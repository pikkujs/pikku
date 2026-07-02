import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createHttpUserFlowActors } from './http-user-flow-actors.js'

// Minimal target app: actor sign-in endpoint + exposed RPC endpoint, session
// via cookie. Mirrors the Better Auth actor plugin's contract.
const startTarget = async () => {
  let logins = 0
  let expireNext = false
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
      if (req.url === '/api/auth/sign-in/actor') {
        if (body.secret !== 'impersonation-secret') {
          res.writeHead(401).end(JSON.stringify({ message: 'bad actor secret' }))
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
      if (req.url?.startsWith('/api/rpc/')) {
        const cookie = req.headers.cookie ?? ''
        if (!cookie.includes('session=') || expireNext) {
          expireNext = false
          res.writeHead(401).end()
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            rpcName: req.url.slice('/api/rpc/'.length),
            echoed: body.data,
            cookie,
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
    apiUrl: `http://127.0.0.1:${port}/api`,
    loginCount: () => logins,
    expireSession: () => {
      expireNext = true
    },
  }
}

describe('HttpUserFlowActor', async () => {
  const target = await startTarget()
  after(() => target.server.close())

  const makeActors = (secret = 'impersonation-secret') =>
    createHttpUserFlowActors({
      apiUrl: target.apiUrl,
      secret,
      actors: {
        customer: { email: 'customer@actors.local', jobTitle: 'Buyer' },
        manager: { email: 'manager@actors.local' },
      },
    })

  test('builds one lazy actor per config entry', () => {
    const actors = makeActors()
    assert.deepEqual(Object.keys(actors).sort(), ['customer', 'manager'])
    assert.equal(actors.customer!.name, 'customer')
    assert.equal(target.loginCount(), 0, 'no login until first invoke')
  })

  test('logs in lazily once and replays the session cookie on RPCs', async () => {
    const actors = makeActors()

    const first = (await actors.customer!.invoke('createTodo', { title: 'x' })) as any
    const second = (await actors.customer!.invoke('listTodos', {})) as any

    assert.equal(first.rpcName, 'createTodo')
    assert.deepEqual(first.echoed, { title: 'x' })
    assert.match(first.cookie, /session=s1/)
    assert.match(first.cookie, /csrf=c1/)
    assert.match(second.cookie, /session=s1/, 'session is cached, not re-minted')
    assert.equal(target.loginCount(), 1)
  })

  test('re-logs-in once when the session expires mid-run', async () => {
    const actors = makeActors()
    await actors.manager!.invoke('ping', {})
    const loginsBefore = target.loginCount()

    target.expireSession()
    const result = (await actors.manager!.invoke('ping', {})) as any

    assert.equal(target.loginCount(), loginsBefore + 1, 'one re-login')
    assert.match(result.cookie, new RegExp(`session=s${loginsBefore + 1}`))
  })

  test('a wrong impersonation secret surfaces status and body', async () => {
    const actors = makeActors('wrong-secret')
    await assert.rejects(
      actors.customer!.invoke('ping', {}),
      /actor sign-in failed for 'customer' \(401\).*bad actor secret/
    )
  })
})
