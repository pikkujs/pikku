import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, createSign, generateKeyPairSync } from 'node:crypto'
import { WebhookSigningSecret } from './hmac.js'

const body = '{"id":"evt_1"}'

describe('WebhookSigningSecret', () => {
  const signing = new WebhookSigningSecret('Shop', 'shh')

  test('accepts the HMAC of the payload and refuses anything else', () => {
    const hex = createHmac('sha256', 'shh').update(body).digest('hex')
    signing.verifyHmac(hex, 'sha256', body, 'hex')
    assert.throws(() => signing.verifyHmac('0'.repeat(64), 'sha256', body, 'hex'), {
      message: 'Invalid Shop webhook signature',
    })
    assert.throws(() => signing.verifyHmac(undefined, 'sha256', body, 'hex'))
  })

  test('decodes a hex or base64 secret before signing', () => {
    const key = Buffer.from('c2ho', 'base64')
    const b64 = createHmac('sha1', key).update(body).digest('base64')
    new WebhookSigningSecret('Shop', 'c2ho').verifyHmac(b64, 'sha1', body, 'base64', 'base64')
  })

  test('compares a shared token', () => {
    signing.verifyToken('shh')
    assert.throws(() => signing.verifyToken('nope'))
  })

  test('verifies a public-key signature', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const signature = createSign('sha256').update(body).sign(privateKey, 'base64')
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const verifier = new WebhookSigningSecret('Shop', pem)
    verifier.verifyPublicKey(signature, body)
    assert.throws(() => verifier.verifyPublicKey(signature, body + ' '))
    assert.throws(() => verifier.verifyPublicKey('garbage', body))
  })

  test('refuses everything when no secret was provisioned', () => {
    const unset = new WebhookSigningSecret('Shop', null)
    assert.equal(unset.configured, false)
    assert.throws(() => unset.verifyToken('shh'), {
      message: 'The Shop webhook receiver has no signing secret',
    })
  })
})

describe('WebhookSigningSecret.fromCredential', () => {
  const store = (values: Record<string, string>) =>
    ({ get: async (name: string) => values[name] ?? null }) as any

  test('checks against the value stored when it loads', async () => {
    const values: Record<string, string> = { HOOK: 'first' }
    const secret = WebhookSigningSecret.fromCredential(
      'Shop',
      store(values),
      'HOOK'
    )
    const sign = (key: string) =>
      createHmac('sha256', key).update('body').digest('hex')

    ;(await secret.load()).verifyHmac(sign('first'), 'sha256', 'body', 'hex')
    values.HOOK = 'second'
    const loaded = await secret.load()
    loaded.verifyHmac(sign('second'), 'sha256', 'body', 'hex')
    assert.throws(() =>
      loaded.verifyHmac(sign('first'), 'sha256', 'body', 'hex')
    )
  })

  test('refuses everything until something is stored', async () => {
    const secret = WebhookSigningSecret.fromCredential(
      'Shop',
      store({}),
      'HOOK'
    )
    assert.equal(secret.configured, false)
    assert.equal((await secret.load()).configured, false)
    assert.throws(() => secret.verifyToken('x'), /has no signing secret/)
  })

  test('refuses everything without a credential service', async () => {
    const secret = WebhookSigningSecret.fromCredential(
      'Shop',
      undefined,
      'HOOK'
    )
    assert.equal((await secret.load()).configured, false)
  })
})
