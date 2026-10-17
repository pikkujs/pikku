import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { makeSignature } from 'better-auth/crypto'
import { verifySessionCredential } from './session-credential.js'

const SECRET = 'test-secret'
const TOKEN = 'sess_abc'

const sign = async (token: string, secret = SECRET) =>
  `${token}.${await makeSignature(token, secret)}`

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

  test('accepts the URL-safe alphabet without padding', async () => {
    const signature = (await sign(TOKEN)).split('.')[1]!
    const urlSafe = signature
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    assert.equal(
      await verifySessionCredential(`${TOKEN}.${urlSafe}`, SECRET),
      TOKEN
    )
  })

  test('rejects a signature that is not base64 at all', async () => {
    assert.equal(
      await verifySessionCredential(`${TOKEN}.%%%not*base64`, SECRET),
      null
    )
  })
})
