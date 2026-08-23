import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolvePersonaCredentials,
  ACTOR_SECRET_VARIABLE,
  OPERATOR_TOKEN_VARIABLE,
  CREATE_MISSING_VARIABLE,
} from './persona-credentials.js'
import { LocalVariablesService } from '@pikku/core/services'

// The real service, not a fake that hands back what it was given: `get`
// JSON-parses, so 'true' arrives as a boolean and 'false' as one too. A stub
// returning raw strings is more forgiving than anything this code runs
// against, and hid a createMissing flag that could never be turned on.
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

  test('leaves account creation off unless it is asked for', async () => {
    const off = await resolvePersonaCredentials(
      variablesFrom({ [OPERATOR_TOKEN_VARIABLE]: 'operator-token' }),
      'scenario actors'
    )
    assert.equal(off.operator?.createMissing, false)

    const on = await resolvePersonaCredentials(
      variablesFrom({
        [OPERATOR_TOKEN_VARIABLE]: 'operator-token',
        [CREATE_MISSING_VARIABLE]: 'true',
      }),
      'scenario actors'
    )
    assert.equal(on.operator?.createMissing, true)

    const explicitlyOff = await resolvePersonaCredentials(
      variablesFrom({
        [OPERATOR_TOKEN_VARIABLE]: 'operator-token',
        [CREATE_MISSING_VARIABLE]: 'false',
      }),
      'scenario actors'
    )
    assert.equal(explicitlyOff.operator?.createMissing, false)
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
