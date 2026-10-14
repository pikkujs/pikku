import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveVirtualUserCredentials,
  VIRTUAL_USER_SECRET_VARIABLE,
  OPERATOR_TOKEN_VARIABLE,
  VIRTUAL_USER_SECRETS_VARIABLE,
  parseVirtualUserSecrets,
  virtualUserSecretResolver,
} from './virtual-user-credentials.js'
import { LocalVariablesService } from '@pikku/core/services'

// The real service, not a fake that hands back what it was given: `get`
// JSON-parses, so 'true' arrives as a boolean and 'false' as one too. A stub
// returning raw strings is more forgiving than anything this code runs
// against.
const variablesFrom = (values: Record<string, string>) =>
  new LocalVariablesService(values)

describe('resolveVirtualUserCredentials', () => {
  test('uses the virtual user secret when that is all the environment holds', async () => {
    const credentials = await resolveVirtualUserCredentials(
      variablesFrom({ [VIRTUAL_USER_SECRET_VARIABLE]: 'dev-secret' }),
      'scenario virtual users'
    )
    assert.deepEqual(credentials, { secret: 'dev-secret' })
  })

  test('prefers the operator token over the virtual user secret', async () => {
    const credentials = await resolveVirtualUserCredentials(
      variablesFrom({
        [VIRTUAL_USER_SECRET_VARIABLE]: 'dev-secret',
        [OPERATOR_TOKEN_VARIABLE]: 'operator-token',
      }),
      'scenario virtual users'
    )
    assert.equal(credentials.secret, undefined)
    assert.equal(credentials.operator?.token, 'operator-token')
  })

  test('prefers per-virtual-user credentials over the root secret', async () => {
    const credentials = await resolveVirtualUserCredentials(
      variablesFrom({
        [VIRTUAL_USER_SECRET_VARIABLE]:
          'the-root-that-derives-every-virtual-user',
        [VIRTUAL_USER_SECRETS_VARIABLE]: 'admin=admin-credential',
      }),
      'scenario virtual users'
    )
    assert.equal(typeof credentials.secret, 'function')
    assert.equal(
      await (credentials.secret as any)({ id: 'admin' }),
      'admin-credential'
    )
  })

  test('a run given only some virtual users cannot reach the rest', async () => {
    const credentials = await resolveVirtualUserCredentials(
      variablesFrom({
        [VIRTUAL_USER_SECRET_VARIABLE]:
          'the-root-that-derives-every-virtual-user',
        [VIRTUAL_USER_SECRETS_VARIABLE]: 'admin=admin-credential',
      }),
      'scenario virtual users'
    )
    assert.throws(
      () => (credentials.secret as any)({ id: 'client' }),
      /No credential for virtual user 'client'/
    )
  })

  test('names both credentials, and the command, when neither is set', async () => {
    await assert.rejects(
      () => resolveVirtualUserCredentials(variablesFrom({}), 'a virtual user'),
      (error: Error) => {
        assert.match(error.message, /a virtual user cannot sign in/)
        assert.match(error.message, new RegExp(OPERATOR_TOKEN_VARIABLE))
        assert.match(error.message, new RegExp(VIRTUAL_USER_SECRET_VARIABLE))
        return true
      }
    )
  })
})

describe('parseVirtualUserSecrets', () => {
  test('reads the list a mint produced', () => {
    assert.deepEqual(
      parseVirtualUserSecrets(
        'admin=admin-credential,client=client-credential'
      ),
      { admin: 'admin-credential', client: 'client-credential' }
    )
  })

  test('keeps a credential that itself contains an =', () => {
    assert.deepEqual(parseVirtualUserSecrets('admin=a=b=c'), { admin: 'a=b=c' })
  })

  test('tolerates whitespace and empty entries', () => {
    assert.deepEqual(parseVirtualUserSecrets(' admin = a-credential , '), {
      admin: 'a-credential',
    })
  })

  test('refuses an entry that is not virtualUserId=secret', () => {
    assert.throws(
      () => parseVirtualUserSecrets('admin'),
      /is not 'virtualUserId=secret'/
    )
    assert.throws(
      () => parseVirtualUserSecrets('=orphan'),
      /is not 'virtualUserId=secret'/
    )
  })

  test('refuses a list that names nobody', () => {
    assert.throws(
      () => parseVirtualUserSecrets(' , '),
      /lists no virtual users/
    )
  })
})

describe('virtualUserSecretResolver', () => {
  test('hands each virtual user their own credential', () => {
    const resolve = virtualUserSecretResolver({
      admin: 'admin-credential',
      client: 'client-credential',
    })
    assert.equal(resolve({ id: 'client' } as any), 'client-credential')
  })

  test('says which virtual user is missing and how to mint it', () => {
    const resolve = virtualUserSecretResolver({ admin: 'admin-credential' })
    assert.throws(
      () => resolve({ id: 'client' } as any),
      (error: Error) => {
        assert.match(error.message, /virtual user 'client'/)
        assert.match(error.message, /pikku virtual-user secret client/)
        return true
      }
    )
  })
})
