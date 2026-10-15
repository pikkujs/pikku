import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { SignJWT, exportSPKI, generateKeyPair } from 'jose'

import { JoseVirtualUserStatementVerifier } from './jose-virtual-user-statement-verifier.js'

const AUD = 'https://stage.example.com'
const NOW = 1_800_000_000_000

const keys = async () => {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
    extractable: true,
  })
  return { publicKey, privateKey, pem: await exportSPKI(publicKey) }
}

const sign = (
  privateKey: CryptoKey,
  claims: {
    sub?: string
    aud?: string
    jti?: string
    iat?: number
    exp?: number
  } = {},
  alg = 'EdDSA'
) => {
  const iat = claims.iat ?? NOW / 1000
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg })
    .setSubject(claims.sub ?? 'dan')
    .setAudience(claims.aud ?? AUD)
    .setIssuedAt(iat)
    .setExpirationTime(claims.exp ?? iat + 180)
    .setJti(claims.jti ?? crypto.randomUUID())
  return jwt.sign(privateKey)
}

const verifier = (pem: string) =>
  new JoseVirtualUserStatementVerifier(pem, () => NOW)

describe('JoseVirtualUserStatementVerifier', () => {
  test('accepts a fresh statement and names the virtual user', async () => {
    const { privateKey, pem } = await keys()
    const result = await verifier(pem).verify(await sign(privateKey), AUD)
    assert.deepEqual(result, { virtualUserId: 'dan' })
  })

  test('accepts the single-line base64 DER a stage variable carries', async () => {
    const { privateKey, pem } = await keys()
    const der = pem.replace(/-----[A-Z ]+-----|\s+/g, '')
    const result = await verifier(der).verify(await sign(privateKey), AUD)
    assert.equal(result.virtualUserId, 'dan')
  })

  test('rejects an expired statement', async () => {
    const { privateKey, pem } = await keys()
    const statement = await sign(privateKey, {
      iat: NOW / 1000 - 600,
      exp: NOW / 1000 - 300,
    })
    await assert.rejects(verifier(pem).verify(statement, AUD), /exp/)
  })

  test('rejects a statement signed by another key', async () => {
    const { pem } = await keys()
    const other = await keys()
    await assert.rejects(
      verifier(pem).verify(await sign(other.privateKey), AUD),
      /signature/
    )
  })

  test('rejects a statement for another audience', async () => {
    const { privateKey, pem } = await keys()
    await assert.rejects(
      verifier(pem).verify(
        await sign(privateKey, { aud: 'https://other.example.com' }),
        AUD
      ),
      /aud/
    )
  })

  test('rejects a replayed statement, once it has been accepted', async () => {
    const { privateKey, pem } = await keys()
    const v = verifier(pem)
    const statement = await sign(privateKey)
    await v.verify(statement, AUD)
    await assert.rejects(v.verify(statement, AUD), /already used/)
  })

  test('forgets an id once its statement would have expired', async () => {
    const { privateKey, pem } = await keys()
    let now = NOW
    const v = new JoseVirtualUserStatementVerifier(pem, () => now)
    await v.verify(await sign(privateKey, { jti: 'one' }), AUD)
    now += 400_000
    const later = await sign(privateKey, {
      jti: 'one',
      iat: now / 1000,
      exp: now / 1000 + 180,
    })
    assert.deepEqual(await v.verify(later, AUD), { virtualUserId: 'dan' })
  })

  test('rejects a tampered statement', async () => {
    const { privateKey, pem } = await keys()
    const [header, payload, signature] = (await sign(privateKey)).split('.')
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString()),
        sub: 'admin',
      })
    ).toString('base64url')
    await assert.rejects(
      verifier(pem).verify(`${header}.${forged}.${signature}`, AUD),
      /signature/
    )
  })

  test('rejects a wrong algorithm, including none and HS256', async () => {
    const { pem } = await keys()
    const v = verifier(pem)
    const none = [
      Buffer.from('{"alg":"none"}').toString('base64url'),
      Buffer.from(
        JSON.stringify({
          sub: 'dan',
          aud: AUD,
          iat: NOW / 1000,
          exp: NOW / 1000 + 60,
          jti: 'x',
        })
      ).toString('base64url'),
      '',
    ].join('.')
    await assert.rejects(v.verify(none, AUD))
    const hs = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('dan')
      .setAudience(AUD)
      .setIssuedAt(NOW / 1000)
      .setExpirationTime(NOW / 1000 + 60)
      .setJti('y')
      .sign(new TextEncoder().encode('s'.repeat(32)))
    await assert.rejects(v.verify(hs, AUD))
    const rs = await generateKeyPair('RS256')
    const rsStatement = await sign(rs.privateKey, {}, 'RS256')
    await assert.rejects(v.verify(rsStatement, AUD))
  })

  test('rejects a statement that lives longer than the ceiling', async () => {
    const { privateKey, pem } = await keys()
    const statement = await sign(privateKey, {
      exp: NOW / 1000 + 3600,
    })
    await assert.rejects(verifier(pem).verify(statement, AUD), /longer than/)
  })

  test('rejects a statement with no one-time id', async () => {
    const { privateKey, pem } = await keys()
    const statement = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject('dan')
      .setAudience(AUD)
      .setIssuedAt(NOW / 1000)
      .setExpirationTime(NOW / 1000 + 60)
      .sign(privateKey)
    await assert.rejects(verifier(pem).verify(statement, AUD), /jti/)
  })
})
