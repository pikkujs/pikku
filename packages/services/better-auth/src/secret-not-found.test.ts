import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { LocalSecretService, LocalVariablesService } from '@pikku/core/services'

import { isSecretNotFound } from './secret-not-found.js'

describe('isSecretNotFound', () => {
  // The contract is the message prefix, so the one test that matters is against
  // a real SecretService rather than a hand-written Error: if an implementation
  // changes its wording, this fails where the auth callers would otherwise
  // start swallowing genuine failures as "absent".
  test('matches what a SecretService throws for a key it does not hold', async () => {
    const secrets = new LocalSecretService(new LocalVariablesService({}))

    const error = await secrets.getSecret('MISSING').catch((e) => e)

    assert.equal(isSecretNotFound(error), true)
  })

  test('does not match an unrelated failure', () => {
    assert.equal(isSecretNotFound(new Error('connect ECONNREFUSED')), false)
  })

  // Every caller receives `unknown` from a catch, so the guard has to survive
  // whatever was thrown — including the things that are not errors at all.
  test('does not match a non-error throw', () => {
    for (const thrown of [
      null,
      undefined,
      'Requested secret not found',
      42,
      {},
    ]) {
      assert.equal(isSecretNotFound(thrown), false)
    }
  })
})
