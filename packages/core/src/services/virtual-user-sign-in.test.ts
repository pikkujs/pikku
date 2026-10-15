import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createCookieJar } from './scenario-cookie-jar.js'
import {
  authMount,
  inProcessSignIn,
  statementSignIn,
} from './virtual-user-sign-in.js'

const virtualUser = {
  id: 'customer',
  name: 'Customer',
  email: 'customer@virtualuser.invalid',
  roles: ['client'],
  goals: [],
  tags: [],
  runnable: true,
}

describe('statementSignIn', () => {
  const servers: Server[] = []
  after(() => servers.forEach((s) => s.close()))

  const start = async (status: number, cookies: string[] = []) => {
    const bodies: unknown[] = []
    const server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        bodies.push(JSON.parse(Buffer.concat(chunks).toString()))
        if (cookies.length) res.setHeader('set-cookie', cookies)
        res.writeHead(status).end(JSON.stringify({ message: 'nope' }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    servers.push(server)
    const { port } = server.address() as { port: number }
    return { apiUrl: `http://127.0.0.1:${port}`, bodies }
  }

  test('posts a freshly minted statement and keeps the cookie', async () => {
    const stage = await start(200, ['session=abc; Path=/'])
    const jar = createCookieJar(stage.apiUrl)
    let minted = 0
    const signIn = statementSignIn({
      apiUrl: stage.apiUrl,
      mint: () => `statement-${++minted}`,
    })
    await signIn.login(jar, virtualUser)
    await signIn.login(jar, virtualUser)
    assert.deepEqual(stage.bodies, [
      { statement: 'statement-1' },
      { statement: 'statement-2' },
    ])
    assert.equal(jar.empty, false)
  })

  test('says what is missing when the stage has no such endpoint', async () => {
    const stage = await start(404)
    await assert.rejects(
      statementSignIn({ apiUrl: stage.apiUrl, mint: () => 's' }).login(
        createCookieJar(stage.apiUrl),
        virtualUser
      ),
      /VIRTUAL_USER_VERIFY_KEY/
    )
  })

  test('surfaces the status and body of a refusal', async () => {
    const stage = await start(401)
    await assert.rejects(
      statementSignIn({ apiUrl: stage.apiUrl, mint: () => 's' }).login(
        createCookieJar(stage.apiUrl),
        virtualUser
      ),
      /failed for 'customer' \(401\).*nope/
    )
  })

  test('a success that sets no cookie is not a session', async () => {
    const stage = await start(200)
    await assert.rejects(
      statementSignIn({ apiUrl: stage.apiUrl, mint: () => 's' }).login(
        createCookieJar(stage.apiUrl),
        virtualUser
      ),
      /no session cookie/
    )
  })
})

describe('inProcessSignIn', () => {
  const apiUrl = 'http://127.0.0.1:1'

  test('asks the server-only endpoint and puts the cookie in the jar', async () => {
    const calls: any[] = []
    const jar = createCookieJar(apiUrl)
    await inProcessSignIn({
      api: {
        signInVirtualUserInternal: async (input: any) => {
          calls.push(input)
          return new Response('{}', {
            headers: { 'set-cookie': 'session=in-process; Path=/' },
          })
        },
      },
    }).login(jar, virtualUser)
    assert.deepEqual(calls, [
      {
        body: { email: virtualUser.email, name: virtualUser.name },
        asResponse: true,
      },
    ])
    assert.equal(jar.empty, false)
  })

  test('an auth without the endpoint says how to add it', async () => {
    await assert.rejects(
      inProcessSignIn({ api: {} }).login(createCookieJar(apiUrl), virtualUser),
      /pikkuVirtualUser plugin/
    )
  })

  test('a refusal comes back with its status', async () => {
    await assert.rejects(
      inProcessSignIn({
        api: {
          signInVirtualUserInternal: async () =>
            new Response('{"message":"not a virtual user"}', { status: 401 }),
        },
      }).login(createCookieJar(apiUrl), virtualUser),
      /failed for 'customer' \(401\).*not a virtual user/
    )
  })
})

describe('authMount', () => {
  test('reads the mount off a sign-in path', () => {
    assert.equal(authMount('/api/auth/sign-in/virtual-user'), '/api/auth')
    assert.equal(authMount('/custom'), undefined)
    assert.equal(authMount(undefined), undefined)
  })
})
