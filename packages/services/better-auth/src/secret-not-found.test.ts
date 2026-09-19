import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  LocalSecretService,
  LocalVariablesService,
  ScopedSecretService,
} from '@pikku/core/services'

import { isSecretForbidden, isSecretNotFound } from './secret-not-found.js'

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

describe('isSecretForbidden', () => {
  test('matches what a ScopedSecretService throws for a key outside its scope', async () => {
    const secrets = new ScopedSecretService(
      new LocalSecretService(new LocalVariablesService({ GRANTED: 'value' })),
      new Set(['GRANTED'])
    )

    const error = await secrets.getSecret('BETTER_AUTH_SECRET').catch((e) => e)

    assert.equal(isSecretForbidden(error), true)
  })

  test('does not match a key the scope does grant', async () => {
    const secrets = new ScopedSecretService(
      new LocalSecretService(new LocalVariablesService({ GRANTED: 'value' })),
      new Set(['GRANTED'])
    )

    assert.equal((await secrets.getSecret('GRANTED')).reveal(), 'value')
  })

  test('is distinct from a missing secret, so the two stay tellable apart', async () => {
    const secrets = new LocalSecretService(new LocalVariablesService({}))

    const error = await secrets.getSecret('MISSING').catch((e) => e)

    assert.equal(isSecretNotFound(error), true)
    assert.equal(isSecretForbidden(error), false)
  })

  test('does not match an unrelated failure', () => {
    assert.equal(isSecretForbidden(new Error('connect ECONNREFUSED')), false)
  })

  test('does not match a non-error throw', () => {
    for (const thrown of [
      null,
      undefined,
      'Access denied to secret key: X',
      42,
      {},
    ]) {
      assert.equal(isSecretForbidden(thrown), false)
    }
  })
})
