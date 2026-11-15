import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DomainPolicyError } from '@pikku/core/keypair'
import { fromBase64, toBase64, toBase64Url } from './base64.js'
import { assertDomain, prefixWithDomain } from './domain.js'
import {
  generateKeyPair,
  importSigningKey,
  importVerifyKey,
  kidFor,
  pkcs8Bytes,
  publicJwk,
  signBytes,
} from './algorithms.js'
import { verifySpkiSignature } from '@pikku/core/hmac'
import { importSealingKey, open, parseSealedValue, seal } from './sealed-box.js'

const rfc7638 = (jwk: Record<string, string>) => {
  const members =
    jwk.kty === 'OKP'
      ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x }
      : { e: jwk.e, kty: jwk.kty, n: jwk.n }
  return createHash('sha256')
    .update(JSON.stringify(members))
    .digest('base64url')
}

describe('base64', () => {
  test('round trips, accepts base64url and unpadded input, refuses junk', () => {
    const bytes = Uint8Array.from([251, 255, 0, 1, 2, 250])
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes)
    assert.deepEqual(fromBase64(toBase64Url(bytes)), bytes)
    assert.throws(() => fromBase64('not base64 !!'))
  })
})

describe('domain prefix', () => {
  test('is utf8(domain) || 0x00 || data', () => {
    const out = prefixWithDomain('audit-v1', 'hi')
    assert.deepEqual([...out], [...Buffer.from('audit-v1\u0000hi')])
  })
  test('refuses an empty domain or one containing NUL', () => {
    assert.throws(() => assertDomain(''), DomainPolicyError)
    assert.throws(() => assertDomain('a\u0000b'), DomainPolicyError)
    assert.throws(() => assertDomain(undefined), DomainPolicyError)
  })
  test('different domains give different bytes, so one cannot stand in for the other', () => {
    assert.notDeepEqual(prefixWithDomain('a', 'x'), prefixWithDomain('b', 'x'))
    assert.notDeepEqual(
      prefixWithDomain('a', 'bx'),
      prefixWithDomain('ab', 'x')
    )
  })
})

describe('algorithms', () => {
  for (const algorithm of ['ed25519', 'rs256'] as const) {
    test(`${algorithm}: kid is the RFC 7638 thumbprint, checked against node:crypto`, async () => {
      const pair = await generateKeyPair(algorithm)
      const jwk = createPublicKey({
        key: Buffer.from(pair.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      }).export({ format: 'jwk' }) as Record<string, string>
      assert.equal(pair.kid, rfc7638(jwk))
      assert.equal(await kidFor(algorithm, pair.publicKey), pair.kid)
    })

    test(`${algorithm}: sign and verify round trip, and a changed byte fails`, async () => {
      const pair = await generateKeyPair(algorithm)
      const key = await importSigningKey(pair.privateKey, algorithm)
      const verifier = await importVerifyKey(pair.publicKey, algorithm)
      const data = new TextEncoder().encode('payload')
      const sig = await signBytes(key, algorithm, data)
      assert.equal(
        await verifySpkiSignature(verifier, algorithm, sig, data),
        true
      )
      assert.equal(
        await verifySpkiSignature(
          verifier,
          algorithm,
          sig,
          new TextEncoder().encode('payloaD')
        ),
        false
      )
    })

    test(`${algorithm}: the JWK matches node's own export`, async () => {
      const pair = await generateKeyPair(algorithm)
      const ours = await publicJwk(pair.publicKey, algorithm)
      const node = createPublicKey({
        key: Buffer.from(pair.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      }).export({ format: 'jwk' }) as Record<string, string>
      assert.deepEqual(ours, node)
    })
  }

  test('x25519: kid is the OKP thumbprint of the X25519 key', async () => {
    const pair = await generateKeyPair('x25519')
    const jwk = createPublicKey({
      key: Buffer.from(pair.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    }).export({ format: 'jwk' }) as Record<string, string>
    assert.equal(jwk.crv, 'X25519')
    assert.equal(pair.kid, rfc7638(jwk))
  })

  test('a PEM private half and a base64 one give the same bytes', async () => {
    const pair = await generateKeyPair('ed25519')
    const pem = `-----BEGIN PRIVATE KEY-----\n${pair.privateKey}\n-----END PRIVATE KEY-----\n`
    assert.deepEqual(pkcs8Bytes(pem), pkcs8Bytes(pair.privateKey))
  })
})

describe('sealed-x25519-v1 (cross-implementation, from the documented format)', () => {
  const SALT = Buffer.from('pikkufabric/sealed-box/v1')
  const spkiOf = (k: ReturnType<typeof generateKeyPairSync<'der', 'der'>>) =>
    k.publicKey

  const nodeSeal = (recipientSpki: Buffer, kid: string, text: string) => {
    const eph = generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    })
    const shared = diffieHellman({
      privateKey: createPrivateKey({
        key: eph.privateKey,
        format: 'der',
        type: 'pkcs8',
      }),
      publicKey: createPublicKey({
        key: recipientSpki,
        format: 'der',
        type: 'spki',
      }),
    })
    const info = Buffer.concat([eph.publicKey, recipientSpki])
    const key = Buffer.from(hkdfSync('sha256', shared, SALT, info, 32))
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return {
      alg: 'sealed-x25519-v1' as const,
      kid,
      epk: eph.publicKey.toString('base64'),
      iv: iv.toString('base64'),
      ct: ct.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    }
  }

  const recipient = () => {
    const pair = generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    })
    return { spki: spkiOf(pair), pkcs8: pair.privateKey }
  }

  test('opens an envelope sealed by an independent node:crypto implementation', async () => {
    const r = recipient()
    const sealed = nodeSeal(r.spki, 'kid-1', 'a secret value')
    const key = await importSealingKey(new Uint8Array(r.pkcs8))
    assert.equal(
      await open(key, r.spki.toString('base64'), parseSealedValue(sealed)),
      'a secret value'
    )
  })

  test('an envelope we seal opens with an independent node:crypto implementation', async () => {
    const r = recipient()
    const sealed = await seal(r.spki.toString('base64'), 'kid-1', 'héllo')
    const shared = diffieHellman({
      privateKey: createPrivateKey({
        key: r.pkcs8,
        format: 'der',
        type: 'pkcs8',
      }),
      publicKey: createPublicKey({
        key: Buffer.from(sealed.epk, 'base64'),
        format: 'der',
        type: 'spki',
      }),
    })
    const info = Buffer.concat([Buffer.from(sealed.epk, 'base64'), r.spki])
    const key = Buffer.from(hkdfSync('sha256', shared, SALT, info, 32))
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(sealed.iv, 'base64')
    )
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
    const out = Buffer.concat([
      decipher.update(Buffer.from(sealed.ct, 'base64')),
      decipher.final(),
    ]).toString('utf8')
    assert.equal(out, 'héllo')
  })

  test('a tampered ciphertext, or the wrong recipient, does not open', async () => {
    const r = recipient()
    const other = recipient()
    const sealed = await seal(r.spki.toString('base64'), 'k', 'x')
    const key = await importSealingKey(new Uint8Array(r.pkcs8))
    await assert.rejects(
      open(key, r.spki.toString('base64'), {
        ...sealed,
        ct: toBase64(Uint8Array.from([1, 2])),
      })
    )
    const wrong = await importSealingKey(new Uint8Array(other.pkcs8))
    await assert.rejects(open(wrong, other.spki.toString('base64'), sealed))
  })

  test('parseSealedValue refuses anything that is not a v1 envelope', () => {
    assert.throws(() => parseSealedValue('nope'))
    assert.throws(() => parseSealedValue(JSON.stringify({ alg: 'other' })))
  })
})

describe('runtime neutrality', () => {
  test('the root entry graph imports no node: module (the file subpath is the only place)', () => {
    const dir = new URL('.', import.meta.url).pathname
    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
    )
    assert.ok(files.includes('index.ts'))
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8')
      assert.doesNotMatch(text, /from\s+['"]node:/, file)
      assert.doesNotMatch(text, /require\(/, file)
      assert.doesNotMatch(text, /\bBuffer\b/, file)
      assert.doesNotMatch(text, /\bprocess\./, file)
    }
  })
})
