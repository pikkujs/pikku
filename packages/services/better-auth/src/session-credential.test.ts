import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHMAC } from '@better-auth/utils/hmac'
import { verifySessionCredential } from './session-credential.js'

const SECRET = 'test-secret'
const TOKEN = 'sess_abc'

const sign = async (token: string, secret = SECRET) =>
  `${token}.${await createHMAC('SHA-256', 'base64urlnopad').sign(secret, token)}`

describe('session credential', () => {
  test('recovers the token from a signed value', async () => {
    assert.equal(
      await verifySessionCredential(await sign(TOKEN), SECRET),
      TOKEN
    )
  })

  test('rejects a value signed with another secret', async () => {
    const credential = await sign(TOKEN, 'other-secret')
    assert.equal(await verifySessionCredential(credential, SECRET), null)
  })

  test('rejects a token swapped onto a valid signature', async () => {
    const signature = (await sign(TOKEN)).split('.')[1]
    assert.equal(
      await verifySessionCredential(`sess_admin.${signature}`, SECRET),
      null
    )
  })

  test('rejects an unsigned bare token', async () => {
    assert.equal(await verifySessionCredential(TOKEN, SECRET), null)
  })

  test('accepts a percent-encoded value', async () => {
    const credential = await sign(TOKEN)
    assert.equal(
      await verifySessionCredential(encodeURIComponent(credential), SECRET),
      TOKEN
    )
  })

  test('rejects malformed input without throwing', async () => {
    for (const bad of ['', '.', 'a.', '.b', 'a.b.c', 'not-a-credential']) {
      assert.equal(await verifySessionCredential(bad, SECRET), null)
    }
  })
})
