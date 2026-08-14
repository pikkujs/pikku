import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyScopes } from '@pikku/core'
import { MissingScopeError } from '@pikku/core/errors'

import { installAddon } from './install-addon.function.js'
import { installOpenapiAddon } from './install-openapi-addon.function.js'

const installers = [
  ['installAddon', installAddon],
  ['installOpenapiAddon', installOpenapiAddon],
] as const

for (const [name, installer] of installers) {
  test(`${name} refuses a caller with no session`, () => {
    assert.throws(
      () => verifyScopes(installer.scopes, undefined),
      MissingScopeError
    )
  })

  test(`${name} refuses a signed-in non-admin`, () => {
    assert.throws(
      () =>
        verifyScopes(installer.scopes, {
          userId: 'alice',
          scopes: ['pikku:scopes:read'],
        }),
      MissingScopeError
    )
  })

  test(`${name} admits a caller holding the console install scope`, () => {
    assert.doesNotThrow(() =>
      verifyScopes(installer.scopes, {
        userId: 'root',
        scopes: ['pikku:console:addons:install'],
      })
    )
  })

  test(`${name} no longer admits a bare admin`, () => {
    assert.throws(
      () =>
        verifyScopes(installer.scopes, { userId: 'root', scopes: ['admin'] }),
      MissingScopeError
    )
  })

  test(`${name} does not declare itself unauthenticated`, () => {
    assert.notEqual(installer.auth, false)
  })
}
