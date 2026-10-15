import assert from 'node:assert/strict'
import { createPublicKey, verify } from 'node:crypto'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { LocalVariablesService } from '@pikku/core/services'

import {
  devSigningKeyPath,
  generateVirtualUserKeyPair,
  loadOrCreateDevKeyPair,
  resolveStatementMint,
  signVirtualUserStatement,
  verifyKeyFor,
} from './virtual-user-signer.js'

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString())

describe('signVirtualUserStatement', () => {
  test('is an EdDSA token the matching public key verifies', () => {
    const { signingKey, verifyKey } = generateVirtualUserKeyPair()
    const statement = signVirtualUserStatement({
      signingKey,
      virtualUserId: 'susan',
      audience: 'http://localhost:3000',
      now: () => 1_000_000,
    })
    const [head, claims, signature] = statement.split('.') as [
      string,
      string,
      string,
    ]
    assert.deepEqual(decode(head), { alg: 'EdDSA', typ: 'JWT' })
    const body = decode(claims)
    assert.equal(body.sub, 'susan')
    assert.equal(body.aud, 'http://localhost:3000')
    assert.equal(body.iat, 1000)
    assert.equal(body.exp, 1000 + 180)
    assert.ok(body.jti)
    assert.equal(
      verify(
        null,
        Buffer.from(`${head}.${claims}`),
        createPublicKey({
          key: Buffer.from(verifyKey, 'base64'),
          format: 'der',
          type: 'spki',
        }),
        Buffer.from(signature, 'base64url')
      ),
      true
    )
  })

  test('every statement carries its own one-time id', () => {
    const { signingKey } = generateVirtualUserKeyPair()
    const options = { signingKey, virtualUserId: 'susan', audience: 'a' }
    const jti = (s: string) => decode(s.split('.')[1]!).jti
    assert.notEqual(
      jti(signVirtualUserStatement(options)),
      jti(signVirtualUserStatement(options))
    )
  })

  test('accepts a PEM, as one pasted into an environment variable', () => {
    const { signingKey } = generateVirtualUserKeyPair()
    const pem = `-----BEGIN PRIVATE KEY-----\n${signingKey.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`
    const escaped = pem.replace(/\n/g, '\\n')
    assert.equal(verifyKeyFor(escaped), verifyKeyFor(signingKey))
  })
})

describe('the dev key pair', () => {
  test('is made once and kept, private half unreadable to others', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-vu-'))
    const first = loadOrCreateDevKeyPair(dir)
    const second = loadOrCreateDevKeyPair(dir)
    assert.deepEqual(second, first)
    assert.equal(statSync(devSigningKeyPath(dir)).mode & 0o777, 0o600)
    assert.equal(
      readFileSync(join(dir, 'virtual-user', '.gitignore'), 'utf-8'),
      '*\n'
    )
    assert.equal(first.verifyKey, verifyKeyFor(first.signingKey))
  })
})

describe('resolveStatementMint', () => {
  const virtualUser = { id: 'susan' } as any

  test('prefers the key in the environment over the dev file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-vu-'))
    loadOrCreateDevKeyPair(dir)
    const stage = generateVirtualUserKeyPair()
    const mint = await resolveStatementMint(
      new LocalVariablesService({ VIRTUAL_USER_SIGNING_KEY: stage.signingKey }),
      { apiUrl: 'https://stage.example.com/api', runtimeDir: dir, what: 'x' }
    )
    const [head, claims, signature] = (await mint(virtualUser)).split('.')
    assert.equal(decode(claims!).aud, 'https://stage.example.com')
    assert.equal(
      verify(
        null,
        Buffer.from(`${head}.${claims}`),
        createPublicKey({
          key: Buffer.from(stage.verifyKey, 'base64'),
          format: 'der',
          type: 'spki',
        }),
        Buffer.from(signature!, 'base64url')
      ),
      true
    )
  })

  test('falls back to the key pikku dev wrote', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-vu-'))
    const { verifyKey } = loadOrCreateDevKeyPair(dir)
    const mint = await resolveStatementMint(new LocalVariablesService({}), {
      apiUrl: 'http://localhost:3000',
      runtimeDir: dir,
      what: 'x',
    })
    const [head, claims, signature] = (await mint(virtualUser)).split('.')
    assert.equal(
      verify(
        null,
        Buffer.from(`${head}.${claims}`),
        createPublicKey({
          key: Buffer.from(verifyKey, 'base64'),
          format: 'der',
          type: 'spki',
        }),
        Buffer.from(signature!, 'base64url')
      ),
      true
    )
  })

  test('with no key anywhere says how to get one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-vu-'))
    writeFileSync(join(dir, 'unrelated'), '')
    await assert.rejects(
      resolveStatementMint(new LocalVariablesService({}), {
        apiUrl: 'http://localhost:3000',
        runtimeDir: dir,
        what: 'a virtual user',
      }),
      /a virtual user cannot sign in.*pikku dev.*VIRTUAL_USER_SIGNING_KEY/s
    )
  })
})
