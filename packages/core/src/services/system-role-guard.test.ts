import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  assertRoleIsMutable,
  assertRoleNameAvailable,
  roleLockReason,
} from './system-role-guard.js'
import {
  SystemRoleImmutableError,
  SystemRoleShadowedError,
} from '../errors/errors.js'

const system =
  (...names: string[]) =>
  (name: string) =>
    names.includes(name)

describe('mutating a role', () => {
  test('a declared role refuses to be deleted or re-scoped', async () => {
    await assert.rejects(
      () => assertRoleIsMutable('buyer', system('buyer'), 'delete role'),
      SystemRoleImmutableError
    )
  })

  test('the refusal says which role and what was attempted', async () => {
    await assert.rejects(
      () => assertRoleIsMutable('buyer', system('buyer'), 'set scopes on'),
      /Cannot set scopes on 'buyer'[\s\S]*defineSystemRole/
    )
  })

  test('a custom role is left alone', async () => {
    await assert.doesNotReject(() =>
      assertRoleIsMutable('invoicing-clerk', system('buyer'), 'delete role')
    )
  })

  test('an async lookup is awaited, not truthy-tested', async () => {
    await assert.rejects(
      () => assertRoleIsMutable('buyer', async () => true, 'delete role'),
      SystemRoleImmutableError
    )
    // A promise resolving to false is itself truthy — the guard must await it
    // rather than treat the promise as the answer.
    await assert.doesNotReject(() =>
      assertRoleIsMutable('buyer', async () => false, 'delete role')
    )
  })
})

describe('creating a role', () => {
  test('shadowing a declared name is refused', async () => {
    await assert.rejects(
      () => assertRoleNameAvailable('buyer', system('buyer')),
      SystemRoleShadowedError
    )
  })

  test('an unused name is allowed', async () => {
    await assert.doesNotReject(() =>
      assertRoleNameAvailable('invoicing-clerk', system('buyer'))
    )
  })
})

describe('what the console renders', () => {
  test('a custom role has no lock', () => {
    assert.equal(roleLockReason({ name: 'clerk', scopes: [] }), null)
  })

  test('a declared role locks with the reason and the fix', () => {
    const reason = roleLockReason({
      name: 'buyer',
      scopes: [],
      system: true,
      declared: true,
    })
    assert.match(reason!, /declared in code with defineSystemRole/)
  })

  // An undeclared system role is still locked, but for a different reason and
  // with a different fix — saying "edit the declaration" would send someone
  // looking for a declaration that no longer exists.
  test('an undeclared system role explains that it is inert', () => {
    const reason = roleLockReason({
      name: 'buyer',
      scopes: [],
      system: true,
      declared: false,
    })
    assert.match(reason!, /inert/)
    assert.match(reason!, /pikku roles prune/)
  })
})
