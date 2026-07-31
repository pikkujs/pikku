import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createCookieJar } from './scenario-cookie-jar.js'

const startTarget = async () => {
  let issued = 0
  const server: Server = createServer((req, res) => {
    if (req.url === '/set') {
      issued++
      res.setHeader('set-cookie', [
        `session=s${issued}; Path=/; HttpOnly`,
        `csrf=c${issued}; Path=/`,
      ])
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        cookie: req.headers.cookie ?? '',
        origin: req.headers.origin ?? '',
      })
    )
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as { port: number }
  return { server, apiUrl: `http://127.0.0.1:${port}` }
}

describe('createCookieJar', () => {
  test('sends back the cookies the target set, on the next request', async () => {
    const { server, apiUrl } = await startTarget()
    after(() => server.close())

    const { fetch: call } = createCookieJar(apiUrl)
    await call(`${apiUrl}/set`)
    const seen = await (await call(`${apiUrl}/echo`)).json()

    assert.match(seen.cookie, /session=s1/)
    assert.match(seen.cookie, /csrf=c1/)
  })

  test('stamps the origin Better Auth checks on state-changing calls', async () => {
    const { server, apiUrl } = await startTarget()
    after(() => server.close())

    const seen = await (
      await createCookieJar(apiUrl).fetch(`${apiUrl}/echo`)
    ).json()

    assert.equal(seen.origin, apiUrl)
  })

  test('replaces a cookie the target reissues rather than sending both', async () => {
    const { server, apiUrl } = await startTarget()
    after(() => server.close())

    const { fetch: call } = createCookieJar(apiUrl)
    await call(`${apiUrl}/set`)
    await call(`${apiUrl}/set`)
    const seen = await (await call(`${apiUrl}/echo`)).json()

    assert.match(seen.cookie, /session=s2/)
    assert.doesNotMatch(seen.cookie, /session=s1/)
  })

  test('keeps each jar to itself, so one actor never inherits another session', async () => {
    const { server, apiUrl } = await startTarget()
    after(() => server.close())

    const first = createCookieJar(apiUrl)
    await first.fetch(`${apiUrl}/set`)
    const other = await (
      await createCookieJar(apiUrl).fetch(`${apiUrl}/echo`)
    ).json()

    assert.equal(other.cookie, '')
  })

  test('forgets the session when cleared, so a re-login starts fresh', async () => {
    const { server, apiUrl } = await startTarget()
    after(() => server.close())

    const jar = createCookieJar(apiUrl)
    await jar.fetch(`${apiUrl}/set`)
    assert.equal(jar.empty, false)
    jar.clear()
    assert.equal(jar.empty, true)

    const seen = await (await jar.fetch(`${apiUrl}/echo`)).json()
    assert.equal(seen.cookie, '')
  })

  test('leaves the caller headers alone', async () => {
    const { server, apiUrl } = await startTarget()
    after(() => server.close())

    const headers = new Headers({ 'x-test': 'kept' })
    const { fetch: call } = createCookieJar(apiUrl)
    await call(`${apiUrl}/set`)
    await call(`${apiUrl}/echo`, { headers })

    assert.equal(headers.get('cookie'), null)
    assert.equal(headers.get('x-test'), 'kept')
  })
})
