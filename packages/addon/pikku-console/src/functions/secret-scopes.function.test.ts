import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MissingScopeError } from '#pikku/addon/error'
import { verifyScopes } from '@pikku/core/scope'

import { secretGet } from './secret-get.function.js'
import { secretHas } from './secret-has.function.js'
import { secretSet } from './secret-set.function.js'

const readers = [
  ['secretGet', secretGet],
  ['secretHas', secretHas],
] as const

for (const [name, reader] of readers) {
  test(`${name} refuses a caller with no session`, () => {
    assert.throws(
      () => verifyScopes(reader.scopes, undefined),
      MissingScopeError
    )
  })

  test(`${name} refuses a console user without the secrets scope`, () => {
    assert.throws(
      () =>
        verifyScopes(reader.scopes, {
          userId: 'alice',
          scopes: ['pikku:console:wirings:read'],
        }),
      MissingScopeError
    )
  })

  test(`${name} admits a holder of the secrets read scope`, () => {
    assert.doesNotThrow(() =>
      verifyScopes(reader.scopes, {
        userId: 'root',
        scopes: ['pikku:console:secrets:read'],
      })
    )
  })

  test(`${name} admits a holder of the console root`, () => {
    assert.doesNotThrow(() =>
      verifyScopes(reader.scopes, { userId: 'root', scopes: ['pikku:console'] })
    )
  })
}

test('secretSet refuses a caller with no session', () => {
  assert.throws(
    () => verifyScopes(secretSet.scopes, undefined),
    MissingScopeError
  )
})

test('secretSet refuses a console user without the secrets scope', () => {
  assert.throws(
    () =>
      verifyScopes(secretSet.scopes, {
        userId: 'alice',
        scopes: ['pikku:console:wirings:read'],
      }),
    MissingScopeError
  )
})

// Reading a secret and overwriting one are separate grants.
test('secretSet refuses a holder of only the secrets read scope', () => {
  assert.throws(
    () =>
      verifyScopes(secretSet.scopes, {
        userId: 'alice',
        scopes: ['pikku:console:secrets:read'],
      }),
    MissingScopeError
  )
})

test('secretSet admits a holder of the secrets write scope', () => {
  assert.doesNotThrow(() =>
    verifyScopes(secretSet.scopes, {
      userId: 'root',
      scopes: ['pikku:console:secrets:write'],
    })
  )
})

test('secretSet admits a holder of the console root', () => {
  assert.doesNotThrow(() =>
    verifyScopes(secretSet.scopes, {
      userId: 'root',
      scopes: ['pikku:console'],
    })
  )
})
