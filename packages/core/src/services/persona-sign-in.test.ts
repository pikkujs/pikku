import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createHttpPersonas } from './http-personas.js'

const OPERATOR_TOKEN = 'operator.jwt.token'

/**
 * Minimal deployed stage: the fabric plugin's sign-in, the admin plugin's
 * user endpoints, and an RPC route that reports back who it was addressed as.
 */
const startStage = async (seeded: Array<{ id: string; email: string }>) => {
  const users = [...seeded]
  let created = 0
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {}
      const url = new URL(req.url ?? '/', 'http://stage.invalid')

      if (url.pathname === '/api/auth/sign-in/fabric') {
        if (body.token !== OPERATOR_TOKEN) {
          res.writeHead(401).end(JSON.stringify({ message: 'bad token' }))
          return
        }
        res.setHeader('set-cookie', ['session=operator; Path=/; HttpOnly'])
        res.writeHead(200).end(JSON.stringify({ token: 'operator' }))
        return
      }

      if (url.pathname === '/api/auth/admin/list-users') {
        const wanted = url.searchParams.get('filterValue')
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ users: users.filter((u) => u.email === wanted) })
        )
        return
      }

      if (url.pathname === '/api/auth/admin/create-user') {
        created++
        const user = { id: `made-${created}`, email: body.email }
        users.push(user)
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ user, sawPassword: Boolean(body.password) }))
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
    get createdCount() {
      return created
    },
  }
}

const persona = (email: string) => ({
  id: 'customer',
  name: 'Customer',
  email,
  roles: ['client'],
  goals: [],
  tags: [],
  runnable: true,
})

describe('operator persona sign-in', () => {
  const servers: Server[] = []
  after(() => servers.forEach((s) => s.close()))

  test('acts as an existing account rather than signing in as it', async () => {
    const stage = await startStage([
      { id: 'user-7', email: 'customer@personas.invalid' },
    ])
    servers.push(stage.server)

    const personas = createHttpPersonas({
      apiUrl: stage.apiUrl,
      operator: { token: OPERATOR_TOKEN },
      personas: { customer: persona('customer@personas.invalid') },
    })

    const result = (await personas.customer!.invoke('whoami', {})) as {
      actingAs: string | null
      cookie: string
    }
    assert.equal(result.actingAs, 'user-7')
    assert.match(result.cookie, /session=operator/)
    assert.equal(stage.createdCount, 0)
  })

  test('refuses a persona the stage has no account for', async () => {
    const stage = await startStage([])
    servers.push(stage.server)

    const personas = createHttpPersonas({
      apiUrl: stage.apiUrl,
      operator: { token: OPERATOR_TOKEN },
      personas: { customer: persona('ghost@personas.invalid') },
    })

    await assert.rejects(
      () => personas.customer!.invoke('whoami', {}),
      /no account on the target for persona 'customer'/
    )
    assert.equal(stage.createdCount, 0)
  })

  test('provisions the account only when told to', async () => {
    const stage = await startStage([])
    servers.push(stage.server)

    const personas = createHttpPersonas({
      apiUrl: stage.apiUrl,
      operator: { token: OPERATOR_TOKEN, createMissing: true },
      personas: { customer: persona('fresh@personas.invalid') },
    })

    const result = (await personas.customer!.invoke('whoami', {})) as {
      actingAs: string | null
    }
    assert.equal(result.actingAs, 'made-1')
    assert.equal(stage.createdCount, 1)
  })

  test('mints the operator session from a token factory', async () => {
    const stage = await startStage([
      { id: 'user-9', email: 'lazy@personas.invalid' },
    ])
    servers.push(stage.server)

    let minted = 0
    const personas = createHttpPersonas({
      apiUrl: stage.apiUrl,
      operator: {
        token: () => {
          minted++
          return OPERATOR_TOKEN
        },
      },
      personas: { customer: persona('lazy@personas.invalid') },
    })

    await personas.customer!.invoke('whoami', {})
    assert.equal(minted, 1)
  })

  test('a persona with neither credential is refused at construction', async () => {
    const stage = await startStage([])
    servers.push(stage.server)

    assert.throws(
      () =>
        createHttpPersonas({
          apiUrl: stage.apiUrl,
          personas: { customer: persona('nobody@personas.invalid') },
        }),
      /has no way to sign in/
    )
  })
})
