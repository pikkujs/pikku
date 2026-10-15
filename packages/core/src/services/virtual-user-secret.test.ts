import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  VIRTUAL_USER_ROOT_SECRET_MIN_LENGTH,
  deriveVirtualUserSecret,
  verifyVirtualUserSecret,
} from './virtual-user-secret.js'

const ROOT = 'root-secret-root-secret-root-secret'
const OTHER_ROOT = 'other-secret-other-secret-other-sec'

describe('virtual user credentials', () => {
  test('a credential verifies for its own address', async () => {
    const secret = await deriveVirtualUserSecret(
      ROOT,
      'susan@virtualuser.local'
    )
    assert.equal(
      await verifyVirtualUserSecret(ROOT, 'susan@virtualuser.local', secret),
      true
    )
  })

  test('and for no other address', async () => {
    const secret = await deriveVirtualUserSecret(
      ROOT,
      'susan@virtualuser.local'
    )
    assert.equal(
      await verifyVirtualUserSecret(ROOT, 'yasser@virtualuser.local', secret),
      false
    )
  })

  test('the address is matched the way the row is looked up', async () => {
    const secret = await deriveVirtualUserSecret(
      ROOT,
      ' Susan@VirtualUser.Local '
    )
    assert.equal(
      await verifyVirtualUserSecret(ROOT, 'susan@virtualuser.local', secret),
      true
    )
  })

  test('rotating the root invalidates every credential at once', async () => {
    const secret = await deriveVirtualUserSecret(
      ROOT,
      'susan@virtualuser.local'
    )
    assert.equal(
      await verifyVirtualUserSecret(
        OTHER_ROOT,
        'susan@virtualuser.local',
        secret
      ),
      false
    )
  })

  test('the root is not a credential for anybody', async () => {
    assert.equal(
      await verifyVirtualUserSecret(ROOT, 'susan@virtualuser.local', ROOT),
      false
    )
  })

  test('a malformed value is false rather than a throw', async () => {
    assert.equal(
      await verifyVirtualUserSecret(ROOT, 'susan@virtualuser.local', ''),
      false
    )
    assert.equal(
      await verifyVirtualUserSecret(
        ROOT,
        'susan@virtualuser.local',
        'not base64url!!'
      ),
      false
    )
  })

  test('key material shorter than the minimum is refused, not silently used', async () => {
    await assert.rejects(
      () => deriveVirtualUserSecret('short', 'susan@virtualuser.local'),
      /SCENARIO_VIRTUAL_USER_SECRET/
    )
    assert.ok(VIRTUAL_USER_ROOT_SECRET_MIN_LENGTH >= 32)
  })
})
