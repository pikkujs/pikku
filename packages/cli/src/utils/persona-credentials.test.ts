import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolvePersonaCredentials,
  ACTOR_SECRET_VARIABLE,
  OPERATOR_TOKEN_VARIABLE,
  PERSONA_SECRETS_VARIABLE,
  parsePersonaSecrets,
  personaSecretResolver,
} from './persona-credentials.js'
import { LocalVariablesService } from '@pikku/core/services'

// The real service, not a fake that hands back what it was given: `get`
// JSON-parses, so 'true' arrives as a boolean and 'false' as one too. A stub
// returning raw strings is more forgiving than anything this code runs
// against.
const variablesFrom = (values: Record<string, string>) =>
  new LocalVariablesService(values)

describe('resolvePersonaCredentials', () => {
  test('uses the actor secret when that is all the environment holds', async () => {
    const credentials = await resolvePersonaCredentials(
      variablesFrom({ [ACTOR_SECRET_VARIABLE]: 'dev-secret' }),
      'scenario actors'
    )
    assert.deepEqual(credentials, { secret: 'dev-secret' })
  })

  test('prefers the operator token over the actor secret', async () => {
    const credentials = await resolvePersonaCredentials(
      variablesFrom({
        [ACTOR_SECRET_VARIABLE]: 'dev-secret',
        [OPERATOR_TOKEN_VARIABLE]: 'operator-token',
      }),
      'scenario actors'
    )
    assert.equal(credentials.secret, undefined)
    assert.equal(credentials.operator?.token, 'operator-token')
  })

  test('prefers per-persona credentials over the root secret', async () => {
    const credentials = await resolvePersonaCredentials(
      variablesFrom({
        [ACTOR_SECRET_VARIABLE]: 'the-root-that-derives-every-persona',
        [PERSONA_SECRETS_VARIABLE]: 'admin=admin-credential',
      }),
      'scenario actors'
    )
    assert.equal(typeof credentials.secret, 'function')
    assert.equal(
      await (credentials.secret as any)({ id: 'admin' }),
      'admin-credential'
    )
  })

  test('a run given only some personas cannot reach the rest', async () => {
    const credentials = await resolvePersonaCredentials(
      variablesFrom({
        [ACTOR_SECRET_VARIABLE]: 'the-root-that-derives-every-persona',
        [PERSONA_SECRETS_VARIABLE]: 'admin=admin-credential',
      }),
      'scenario actors'
    )
    assert.throws(
      () => (credentials.secret as any)({ id: 'client' }),
      /No credential for persona 'client'/
    )
  })

  test('names both credentials, and the command, when neither is set', async () => {
    await assert.rejects(
      () => resolvePersonaCredentials(variablesFrom({}), 'a virtual user'),
      (error: Error) => {
        assert.match(error.message, /a virtual user cannot sign in/)
        assert.match(error.message, new RegExp(OPERATOR_TOKEN_VARIABLE))
        assert.match(error.message, new RegExp(ACTOR_SECRET_VARIABLE))
        return true
      }
    )
  })
})

describe('parsePersonaSecrets', () => {
  test('reads the list a mint produced', () => {
    assert.deepEqual(
      parsePersonaSecrets('admin=admin-credential,client=client-credential'),
      { admin: 'admin-credential', client: 'client-credential' }
    )
  })

  test('keeps a credential that itself contains an =', () => {
    assert.deepEqual(parsePersonaSecrets('admin=a=b=c'), { admin: 'a=b=c' })
  })

  test('tolerates whitespace and empty entries', () => {
    assert.deepEqual(parsePersonaSecrets(' admin = a-credential , '), {
      admin: 'a-credential',
    })
  })

  test('refuses an entry that is not personaId=secret', () => {
    assert.throws(
      () => parsePersonaSecrets('admin'),
      /is not 'personaId=secret'/
    )
    assert.throws(
      () => parsePersonaSecrets('=orphan'),
      /is not 'personaId=secret'/
    )
  })

  test('refuses a list that names nobody', () => {
    assert.throws(() => parsePersonaSecrets(' , '), /lists no personas/)
  })
})

describe('personaSecretResolver', () => {
  test('hands each persona their own credential', () => {
    const resolve = personaSecretResolver({
      admin: 'admin-credential',
      client: 'client-credential',
    })
    assert.equal(resolve({ id: 'client' } as any), 'client-credential')
  })

  test('says which persona is missing and how to mint it', () => {
    const resolve = personaSecretResolver({ admin: 'admin-credential' })
    assert.throws(
      () => resolve({ id: 'client' } as any),
      (error: Error) => {
        assert.match(error.message, /persona 'client'/)
        assert.match(error.message, /pikku persona secret client/)
        return true
      }
    )
  })
})
