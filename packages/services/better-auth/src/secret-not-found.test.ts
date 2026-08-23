import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { LocalSecretService, LocalVariablesService } from '@pikku/core/services'

import { isSecretNotFound } from './secret-not-found.js'

describe('isSecretNotFound', () => {
  test('matches what a SecretService throws for a key it does not hold', async () => {
    const secrets = new LocalSecretService(new LocalVariablesService({}))

    const error = await secrets.getSecret('MISSING').catch((e) => e)

    assert.equal(isSecretNotFound(error), true)
  })

  test('does not match an unrelated failure', () => {
    assert.equal(isSecretNotFound(new Error('connect ECONNREFUSED')), false)
  })

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
