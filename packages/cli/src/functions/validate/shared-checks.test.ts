import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
  betterAuthTableAliases,
  migrationCreatesTable,
} from './shared-checks.js'

const AUTH_CONFIG = `
  export const auth = betterAuth({
    database: { dialect, type: 'sqlite' },
    user: {
      modelName: 'authUser',
      additionalFields: { role: { type: 'string' } },
    },
    session: {
      modelName: 'authSession',
      cookieCache: { enabled: true },
    },
    account: { modelName: 'authAccount' },
    verification: { modelName: 'authVerification' },
  })
`

describe('betterAuthTableAliases', () => {
  test('is the default name alone when nothing renames the model', () => {
    assert.deepStrictEqual(betterAuthTableAliases('user', ''), ['user'])
  })

  test('adds the override and its snake_case form', () => {
    assert.deepStrictEqual(betterAuthTableAliases('user', AUTH_CONFIG), [
      'user',
      'authUser',
      'auth_user',
    ])
  })

  test('resolves a model declared after a nested option block', () => {
    assert.deepStrictEqual(betterAuthTableAliases('session', AUTH_CONFIG), [
      'session',
      'authSession',
      'auth_session',
    ])
  })

  test('finds the renamed table in a migration', () => {
    const sql = 'CREATE TABLE IF NOT EXISTS "auth_verification" ("id" TEXT)'
    const aliases = betterAuthTableAliases('verification', AUTH_CONFIG)
    assert.ok(aliases.some((name) => migrationCreatesTable(sql, name)))
    assert.ok(!migrationCreatesTable(sql, 'verification'))
  })
})
