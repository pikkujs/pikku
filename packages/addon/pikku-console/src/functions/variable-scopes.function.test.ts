import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MissingScopeError } from '#pikku/addon/error'
import { verifyScopes } from '@pikku/core/scope'
import { LocalVariablesService } from '@pikku/core/services'

import { variableGet } from './variable-get.function.js'
import { variableSet } from './variable-set.function.js'

test('variableGet refuses a caller with no session', () => {
  assert.throws(
    () => verifyScopes(variableGet.scopes, undefined),
    MissingScopeError
  )
})

test('variableGet refuses a holder of only the secrets read scope', () => {
  assert.throws(
    () =>
      verifyScopes(variableGet.scopes, {
        userId: 'alice',
        scopes: ['pikku:console:secrets:read'],
      }),
    MissingScopeError
  )
})

test('variableGet admits a holder of the variables read scope', () => {
  assert.doesNotThrow(() =>
    verifyScopes(variableGet.scopes, {
      userId: 'root',
      scopes: ['pikku:console:variables:read'],
    })
  )
})

test('variableSet refuses a holder of only the variables read scope', () => {
  assert.throws(
    () =>
      verifyScopes(variableSet.scopes, {
        userId: 'alice',
        scopes: ['pikku:console:variables:read'],
      }),
    MissingScopeError
  )
})

test('variableSet admits a holder of the variables write scope', () => {
  assert.doesNotThrow(() =>
    verifyScopes(variableSet.scopes, {
      userId: 'root',
      scopes: ['pikku:console:variables:write'],
    })
  )
})

test('variableSet admits a holder of the console root', () => {
  assert.doesNotThrow(() =>
    verifyScopes(variableSet.scopes, {
      userId: 'root',
      scopes: ['pikku:console'],
    })
  )
})

test('an unset variable reads as missing, and a set one reads back', async () => {
  const variables = new LocalVariablesService({})
  const services = { variables } as never

  assert.deepEqual(
    await variableGet.func(
      services,
      { variableId: 'REGION' } as never,
      {} as never
    ),
    { exists: false, value: null }
  )
  assert.deepEqual(
    await variableSet.func(
      services,
      { variableId: 'REGION', value: 'eu-west' } as never,
      {} as never
    ),
    { success: true }
  )
  assert.deepEqual(
    await variableGet.func(
      services,
      { variableId: 'REGION' } as never,
      {} as never
    ),
    { exists: true, value: 'eu-west' }
  )
})
