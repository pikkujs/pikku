import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  ACTOR_ROOT_SECRET_MIN_LENGTH,
  deriveActorSecret,
  verifyActorSecret,
} from './persona-actor-secret.js'

const ROOT = 'root-secret-root-secret-root-secret'
const OTHER_ROOT = 'other-secret-other-secret-other-sec'

describe('actor credentials', () => {
  test('a credential verifies for its own address', async () => {
    const secret = await deriveActorSecret(ROOT, 'susan@actors.local')
    assert.equal(
      await verifyActorSecret(ROOT, 'susan@actors.local', secret),
      true
    )
  })

  test('and for no other address', async () => {
    const secret = await deriveActorSecret(ROOT, 'susan@actors.local')
    assert.equal(
      await verifyActorSecret(ROOT, 'yasser@actors.local', secret),
      false
    )
  })

  test('the address is matched the way the row is looked up', async () => {
    const secret = await deriveActorSecret(ROOT, ' Susan@Actors.Local ')
    assert.equal(
      await verifyActorSecret(ROOT, 'susan@actors.local', secret),
      true
    )
  })

  test('rotating the root invalidates every credential at once', async () => {
    const secret = await deriveActorSecret(ROOT, 'susan@actors.local')
    assert.equal(
      await verifyActorSecret(OTHER_ROOT, 'susan@actors.local', secret),
      false
    )
  })

  test('the root is not a credential for anybody', async () => {
    assert.equal(
      await verifyActorSecret(ROOT, 'susan@actors.local', ROOT),
      false
    )
  })

  test('a malformed value is false rather than a throw', async () => {
    assert.equal(await verifyActorSecret(ROOT, 'susan@actors.local', ''), false)
    assert.equal(
      await verifyActorSecret(ROOT, 'susan@actors.local', 'not base64url!!'),
      false
    )
  })

  test('key material shorter than the minimum is refused, not silently used', async () => {
    await assert.rejects(
      () => deriveActorSecret('short', 'susan@actors.local'),
      /SCENARIO_ACTOR_SECRET/
    )
    assert.ok(ACTOR_ROOT_SECRET_MIN_LENGTH >= 32)
  })
})
