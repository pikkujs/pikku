import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { suggestSecurityForColumn, tokenise } from './sensitive-names.js'

const suggest = (column: string, type = 'text', table = 'invoice') =>
  suggestSecurityForColumn(table, column, type)?.security ?? null

describe('tokenise', () => {
  test('splits snake, camel and acronyms', () => {
    assert.deepEqual(tokenise('customerEmail'), ['customer', 'email'])
    assert.deepEqual(tokenise('api_key'), ['api', 'key'])
    assert.deepEqual(tokenise('IPAddress'), ['ip', 'address'])
  })
})

describe('names that warn', () => {
  const cases: Array<[string, 'pii' | 'secret']> = [
    ['password', 'secret'],
    ['password_hash', 'secret'],
    ['secret', 'secret'],
    ['api_key', 'secret'],
    ['apiKey', 'secret'],
    ['apikey', 'secret'],
    ['private_key', 'secret'],
    ['access_token', 'secret'],
    ['refresh_token', 'secret'],
    ['idToken', 'secret'],
    ['token', 'secret'],
    ['client_secret', 'secret'],
    ['credentials', 'secret'],
    ['email', 'pii'],
    ['customerEmail', 'pii'],
    ['phone', 'pii'],
    ['first_name', 'pii'],
    ['lastName', 'pii'],
    ['full_name', 'pii'],
    ['address', 'pii'],
    ['dob', 'pii'],
    ['birth_date', 'pii'],
    ['ssn', 'pii'],
    ['ip', 'pii'],
    ['ip_address', 'pii'],
    ['lat', 'pii'],
    ['lng', 'pii'],
  ]
  for (const [column, expected] of cases) {
    test(`${column} -> ${expected}`, () =>
      assert.equal(suggest(column), expected))
  }

  test('password_hash suggests hashed, api_key a value read back', () => {
    assert.equal(
      suggestSecurityForColumn('t', 'password_hash', 'text')?.formHint,
      'hashed'
    )
    assert.equal(
      suggestSecurityForColumn('t', 'api_key', 'text')?.formHint,
      'readBack'
    )
  })
})

describe('false positives stay silent', () => {
  for (const column of [
    'username',
    'emailVerified',
    'email_verified',
    'email_verified_at',
    'token_count',
    'tokens_used',
    'zip',
    'description',
    'shipping',
    'file_hash',
    'has_password',
    'is_secret',
    'password_changed_at',
    'created_at',
    'user_id',
    'email_id',
    'token_type',
    'secret_ref',
    'secret_name',
    'display_name',
    'status',
  ]) {
    test(column, () => assert.equal(suggest(column), null))
  }
})

describe('types', () => {
  for (const type of [
    'boolean',
    'integer',
    'bigint',
    'timestamp without time zone',
    'date',
    'tinyint(1)',
    'double precision',
  ])
    test(`skips ${type}`, () => assert.equal(suggest('email', type), null))
  test('does not skip point/inet', () => {
    assert.equal(suggest('ip', 'inet'), 'pii')
  })
})

describe('bare name', () => {
  for (const table of [
    'user',
    'users',
    'person',
    'customer',
    'member',
    'contact',
    'profile',
    'employee',
    'account_holder',
  ])
    test(`warns on ${table}`, () =>
      assert.equal(suggest('name', 'text', table), 'pii'))
  for (const table of ['plugin', 'project', 'invoice', 'user_group', 'account'])
    test(`silent on ${table}`, () =>
      assert.equal(suggest('name', 'text', table), null))
})
