import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'

import { betterAuthOAuthAccessToken } from './auth-session-oauth.js'

let server: Server
let origin: string
let privateKey: CryptoKey
let otherKey: CryptoKey

before(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  otherKey = (await generateKeyPair('RS256')).privateKey
  const jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] }
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(jwks))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const address = server.address() as { port: number }
  origin = `http://127.0.0.1:${address.port}`
})

after(() => server.close())

const mint = (
  claims: Record<string, unknown>,
  key = privateKey,
  issuer = origin
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(issuer)
    .setAudience(origin)
    .setSubject('user-1')
    .setExpirationTime('5m')
    .sign(key)

const resolve = async (
  authorization: string | undefined,
  options: Partial<Parameters<typeof betterAuthOAuthAccessToken>[0]> = {}
) => {
  const captured: any[] = []
  const headers: Record<string, string> = { host: origin.slice(7) }
  if (authorization) headers.authorization = authorization
  const wire: any = {
    http: {
      request: {
        header: (name: string) => headers[name.toLowerCase()],
        headers: () => headers,
      },
    },
    setInitialSession: (s: any) => captured.push(s),
  }
  const services: any = { logger: { info() {}, warn() {}, error() {} } }
  await betterAuthOAuthAccessToken({
    issuer: (o) => ({ issuer: o, jwksUrl: `${o}/jwks` }),
    ...options,
  })(services, wire, async () => {})
  return captured[0] ?? null
}

describe('betterAuthOAuthAccessToken', () => {
  test('a valid access token resolves its subject', async () => {
    const session = await resolve(`Bearer ${await mint({ scope: 'openid' })}`)
    assert.equal(session?.userId, 'user-1')
  })

  test('a token signed with another key resolves nothing', async () => {
    assert.equal(await resolve(`Bearer ${await mint({}, otherKey)}`), null)
  })

  test('a token from another issuer resolves nothing', async () => {
    assert.equal(
      await resolve(`Bearer ${await mint({}, privateKey, 'http://evil')}`),
      null
    )
  })

  test('a missing required scope resolves nothing', async () => {
    const token = await mint({ scope: 'openid' })
    assert.equal(
      await resolve(`Bearer ${token}`, { requiredScopes: ['studio'] }),
      null
    )
  })

  test('a non-JWT bearer is left to the cookie middlewares', async () => {
    assert.equal(await resolve('Bearer abc.def'), null)
  })

  test('no Authorization header resolves nothing', async () => {
    assert.equal(await resolve(undefined), null)
  })
})
