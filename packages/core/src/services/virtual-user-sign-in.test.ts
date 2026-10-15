import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createHttpVirtualUsers } from './http-virtual-users.js'
import { establishOperatorSession } from './virtual-user-sign-in.js'

const OPERATOR_TOKEN = 'operator.jwt.token'

/**
 * Minimal deployed stage: the cloud plugin's sign-in, which resolves the
 * account to act as in the same request, and an RPC route that reports back who
 * it was addressed as.
 */
const startStage = async (seeded: Array<{ id: string; email: string }>) => {
  const users = [...seeded]
  const sentBodies: unknown[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {}
      const url = new URL(req.url ?? '/', 'http://stage.invalid')

      if (url.pathname === '/api/auth/sign-in/cloud') {
        if (body.token !== OPERATOR_TOKEN) {
          res.writeHead(401).end(JSON.stringify({ message: 'bad token' }))
          return
        }
        let actAs: { userId: string } | undefined
        if (body.actAs) {
          sentBodies.push(body.actAs)
          const user = users.find((u) => u.email === body.actAs.email)
          if (!user) {
            res.writeHead(404).end(
              JSON.stringify({
                message: `No account on this stage for ${body.actAs.email}`,
              })
            )
            return
          }
          actAs = { userId: user.id }
        }
        res.setHeader('set-cookie', ['session=operator; Path=/; HttpOnly'])
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ token: 'operator', actAs }))
        return
      }

      if (url.pathname.startsWith('/api/rpc/')) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            actingAs: req.headers['x-pikku-impersonate-user-id'] ?? null,
            cookie: req.headers.cookie ?? '',
          })
        )
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
    get sentBodies() {
      return sentBodies
    },
  }
}

const virtualUser = (email: string) => ({
  id: 'customer',
  name: 'Customer',
  email,
  roles: ['client'],
  goals: [],
  tags: [],
  runnable: true,
})

describe('operator virtual user sign-in', () => {
  const servers: Server[] = []
  after(() => servers.forEach((s) => s.close()))

  test('acts as an existing account rather than signing in as it', async () => {
    const stage = await startStage([
      { id: 'user-7', email: 'customer@virtualuser.invalid' },
    ])
    servers.push(stage.server)

    const virtualUsers = createHttpVirtualUsers({
      apiUrl: stage.apiUrl,
      operator: { token: OPERATOR_TOKEN },
      virtualUsers: { customer: virtualUser('customer@virtualuser.invalid') },
    })

    const result = (await virtualUsers.customer!.invoke('whoami', {})) as {
      actingAs: string | null
      cookie: string
    }
    assert.equal(result.actingAs, 'user-7')
    assert.match(result.cookie, /session=operator/)
  })

  // An app that mounts auth somewhere other than the root moves both sign-in
  // paths together, and `SCENARIO_SIGN_IN_PATH` is the only place it can say so.
  test('honours a moved sign-in path the same way the virtual user path does', async () => {
    const stage = await startStage([
      { id: 'user-7', email: 'customer@virtualuser.invalid' },
    ])
    servers.push(stage.server)

    const virtualUsers = createHttpVirtualUsers({
      apiUrl: stage.apiUrl.replace(/\/api$/, ''),
      operator: { token: OPERATOR_TOKEN },
      signInPath: '/api/auth/sign-in/cloud',
      rpcPath: '/api/rpc',
      virtualUsers: { customer: virtualUser('customer@virtualuser.invalid') },
    })

    const result = (await virtualUsers.customer!.invoke('whoami', {})) as {
      actingAs: string | null
    }
    assert.equal(result.actingAs, 'user-7')
  })

  test('refuses a virtual user the stage has no account for', async () => {
    const stage = await startStage([])
    servers.push(stage.server)

    const virtualUsers = createHttpVirtualUsers({
      apiUrl: stage.apiUrl,
      operator: { token: OPERATOR_TOKEN },
      virtualUsers: { customer: virtualUser('ghost@virtualuser.invalid') },
    })

    await assert.rejects(
      () => virtualUsers.customer!.invoke('whoami', {}),
      /operator sign-in failed for 'customer' \(404\)/
    )
  })

  // Provisioning moved into the stage, so the handshake carries an address and
  // nothing else. A `create` flag or a role list here would be the caller
  // deciding what the stage holds, which is the arrangement this replaced.
  test('asks only to act as an address', async () => {
    const stage = await startStage([
      { id: 'user-3', email: 'customer@virtualuser.invalid' },
    ])
    servers.push(stage.server)

    const virtualUsers = createHttpVirtualUsers({
      apiUrl: stage.apiUrl,
      operator: { token: OPERATOR_TOKEN },
      virtualUsers: { customer: virtualUser('customer@virtualuser.invalid') },
    })

    await virtualUsers.customer!.invoke('whoami', {})
    assert.deepEqual(stage.sentBodies, [
      { email: 'customer@virtualuser.invalid' },
    ])
  })

  test('mints the operator session from a token factory', async () => {
    const stage = await startStage([
      { id: 'user-9', email: 'lazy@virtualuser.invalid' },
    ])
    servers.push(stage.server)

    let minted = 0
    const virtualUsers = createHttpVirtualUsers({
      apiUrl: stage.apiUrl,
      operator: {
        token: () => {
          minted++
          return OPERATOR_TOKEN
        },
      },
      virtualUsers: { customer: virtualUser('lazy@virtualuser.invalid') },
    })

    await virtualUsers.customer!.invoke('whoami', {})
    assert.equal(minted, 1)
  })

  test('resolves the account to act as without a second request', async () => {
    const stage = await startStage([{ id: 'user-9', email: 'susan@acme.test' }])
    servers.push(stage.server)

    // Plain fetch keeps no cookies, which is the browser provider's situation:
    // it plants them on a Playwright context only once this has returned. The
    // handshake must not need a session of its own to resolve the virtual user.
    const { userId } = await establishOperatorSession(
      fetch,
      stage.apiUrl,
      virtualUser('susan@acme.test'),
      { token: OPERATOR_TOKEN }
    )
    assert.equal(userId, 'user-9')
  })

  test('a virtual user with neither credential is refused at construction', async () => {
    const stage = await startStage([])
    servers.push(stage.server)

    assert.throws(
      () =>
        createHttpVirtualUsers({
          apiUrl: stage.apiUrl,
          virtualUsers: { customer: virtualUser('nobody@virtualuser.invalid') },
        }),
      /has no way to sign in/
    )
  })
})
