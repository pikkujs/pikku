import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createPublicKey } from 'node:crypto'
import { compactDecrypt, base64url } from 'jose'
import { createJoseKeyCrypto } from './keys.js'

const crypto = createJoseKeyCrypto()
const enc = new TextEncoder()
const b64u = (s: string) => Buffer.from(s).toString('base64url')

const nodeJwk = (spki: string) =>
  createPublicKey({
    key: Buffer.from(spki, 'base64'),
    format: 'der',
    type: 'spki',
  }).export({ format: 'jwk' }) as Record<string, string>

const rfc7638 = (jwk: Record<string, string>) => {
  const members =
    jwk.kty === 'OKP'
      ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x }
      : { e: jwk.e, kty: jwk.kty, n: jwk.n }
  return createHash('sha256')
    .update(JSON.stringify(members))
    .digest('base64url')
}

describe('jose key crypto: identities and signatures', () => {
  for (const algorithm of ['ed25519', 'rs256', 'x25519'] as const) {
    test(`${algorithm}: the thumbprint is RFC 7638, checked against node:crypto`, async () => {
      const pair = await crypto.generate(algorithm)
      assert.equal(
        await crypto.thumbprint(algorithm, pair.publicKey),
        rfc7638(nodeJwk(pair.publicKey))
      )
    })
  }

  for (const algorithm of ['ed25519', 'rs256'] as const) {
    const alg = algorithm === 'ed25519' ? 'EdDSA' : 'RS256'

    test(`${algorithm}: sign and verify, a changed byte or another key fails`, async () => {
      const pair = await crypto.generate(algorithm)
      const other = await crypto.generate(algorithm)
      const priv = await crypto.importKey(algorithm, 'private', pair.privateKey)
      const pub = await crypto.importKey(algorithm, 'public', pair.publicKey)
      const otherPub = await crypto.importKey(
        algorithm,
        'public',
        other.publicKey
      )
      const jws = await crypto.sign(
        algorithm,
        priv,
        { alg, kid: 'k1' },
        enc.encode('payload')
      )
      assert.deepEqual(await crypto.verify(algorithm, pub, jws), {
        alg,
        kid: 'k1',
      })
      const [h, , s] = jws.split('.')
      assert.equal(
        await crypto.verify(algorithm, pub, `${h}.${b64u('payloaD')}.${s}`),
        undefined
      )
      assert.equal(await crypto.verify(algorithm, otherPub, jws), undefined)
      assert.equal(await crypto.verify(algorithm, pub, 'garbage'), undefined)
    })

    test(`${algorithm}: signing under another alg header is refused, and verify pins the algorithm`, async () => {
      const pair = await crypto.generate(algorithm)
      const priv = await crypto.importKey(algorithm, 'private', pair.privateKey)
      await assert.rejects(
        crypto.sign(algorithm, priv, { alg: 'none', kid: 'k' }, enc.encode('x'))
      )
      const jws = await crypto.sign(
        algorithm,
        priv,
        { alg, kid: 'k' },
        enc.encode('x')
      )
      const forged = `${b64u(JSON.stringify({ alg: 'none', kid: 'k' }))}.${jws.split('.')[1]}.${jws.split('.')[2]}`
      const pub = await crypto.importKey(algorithm, 'public', pair.publicKey)
      assert.equal(await crypto.verify(algorithm, pub, forged), undefined)
    })

    test(`${algorithm}: the JWK is node's own export`, async () => {
      const pair = await crypto.generate(algorithm)
      const pub = await crypto.importKey(algorithm, 'public', pair.publicKey)
      assert.deepEqual(
        await crypto.jwk(algorithm, pub),
        nodeJwk(pair.publicKey)
      )
    })
  }

  test('a PEM and a base64 private half import to the same key', async () => {
    const pair = await crypto.generate('ed25519')
    const pem = `-----BEGIN PRIVATE KEY-----\n${pair.privateKey}\n-----END PRIVATE KEY-----\n`
    const a = await crypto.importKey('ed25519', 'private', pem)
    const b = await crypto.importKey('ed25519', 'private', pair.privateKey)
    const pub = await crypto.importKey('ed25519', 'public', pair.publicKey)
    const h = { alg: 'EdDSA', kid: 'k' }
    assert.ok(
      await crypto.verify(
        'ed25519',
        pub,
        await crypto.sign('ed25519', a, h, enc.encode('x'))
      )
    )
    assert.ok(
      await crypto.verify(
        'ed25519',
        pub,
        await crypto.sign('ed25519', b, h, enc.encode('x'))
      )
    )
  })
})

describe('jose key crypto: sealing (compact JWE, ECDH-ES + A256GCM)', () => {
  const recipient = async () => {
    const pair = await crypto.generate('x25519')
    return {
      ...pair,
      key: await crypto.importKey('x25519', 'private', pair.privateKey),
    }
  }

  test('round trips, and the envelope is a standard JWE bound to its recipient', async () => {
    const r = await recipient()
    const sealed = await crypto.seal(r.publicKey, 'kid-1', 'héllo')
    assert.equal(sealed.split('.').length, 5)
    assert.equal(
      await crypto.open(r.key, r.publicKey, 'kid-1', sealed),
      'héllo'
    )
    const { protectedHeader } = await compactDecrypt(sealed, r.key as never)
    assert.equal(protectedHeader.alg, 'ECDH-ES')
    assert.equal(protectedHeader.enc, 'A256GCM')
    assert.equal(protectedHeader.kid, 'kid-1')
    assert.equal(
      protectedHeader.apv,
      base64url.encode(Buffer.from(r.publicKey, 'base64'))
    )
  })

  test('a tampered ciphertext or header does not open', async () => {
    const r = await recipient()
    const [h, k, iv, ct, tag] = (
      await crypto.seal(r.publicKey, 'k', 'x')
    ).split('.')
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1)
    await assert.rejects(
      crypto.open(r.key, r.publicKey, 'k', [h, k, iv, flip(ct!), tag].join('.'))
    )
    await assert.rejects(
      crypto.open(r.key, r.publicKey, 'k', [flip(h!), k, iv, ct, tag].join('.'))
    )
    await assert.rejects(crypto.open(r.key, r.publicKey, 'k', 'nope'))
  })

  test('a value sealed to another recipient, or naming another recipient, does not open', async () => {
    const a = await recipient()
    const b = await recipient()
    const forB = await crypto.seal(b.publicKey, 'k', 'x')
    await assert.rejects(crypto.open(a.key, a.publicKey, 'k', forB))
    // right private key, but the caller expects a different recipient binding
    await assert.rejects(crypto.open(b.key, a.publicKey, 'k', forB))
  })

  test('a kid that is not the one asked for, or another algorithm, is refused', async () => {
    const r = await recipient()
    const sealed = await crypto.seal(r.publicKey, 'kid-1', 'x')
    await assert.rejects(crypto.open(r.key, r.publicKey, 'kid-2', sealed))
    // a JWE under another key management algorithm never opens, even with the right key
    const { CompactEncrypt } = await import('jose')
    const dir = await import('jose').then((j) =>
      j.generateSecret('A256KW', { extractable: true })
    )
    const wrapped = await new CompactEncrypt(enc.encode('x'))
      .setProtectedHeader({
        alg: 'A256KW',
        enc: 'A256GCM',
        kid: 'kid-1',
        apv: base64url.encode(Buffer.from(r.publicKey, 'base64')),
      })
      .encrypt(dir)
    await assert.rejects(crypto.open(r.key, r.publicKey, 'kid-1', wrapped))
  })
})
