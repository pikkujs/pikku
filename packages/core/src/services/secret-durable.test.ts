import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { LocalSecretService } from './local-secrets.js'
import { ScopedSecretService } from './scoped-secret-service.js'
import { TypedSecretService } from './typed-secret-service.js'
import type { SecretService } from './secret-service.js'

const durableBackend = (durable?: boolean): SecretService =>
  ({
    ...new LocalSecretService(),
    getSecret: async () => '',
    hasSecret: async () => false,
    setSecret: async () => {},
    deleteSecret: async () => {},
    getSecrets: async () => ({}),
    ...(durable === undefined ? {} : { durable }),
  }) as unknown as SecretService

describe('SecretService.durable through the wrappers', () => {
  test('survives TypedSecretService', () => {
    assert.equal(new TypedSecretService(durableBackend(true), {}).durable, true)
  })

  test('survives ScopedSecretService', () => {
    assert.equal(
      new ScopedSecretService(durableBackend(true), new Set()).durable,
      true
    )
  })

  test('survives TypedSecretService(ScopedSecretService(x))', () => {
    const nested = new TypedSecretService(
      new ScopedSecretService(durableBackend(true), new Set()),
      {}
    )
    assert.equal(nested.durable, true)
  })

  test('a false flag stays false', () => {
    assert.equal(
      new TypedSecretService(durableBackend(false), {}).durable,
      false
    )
  })

  test('absent stays absent through every wrapper', () => {
    const local = new LocalSecretService()
    assert.equal(local.durable, undefined)
    assert.equal(new TypedSecretService(local, {}).durable, undefined)
    assert.equal(new ScopedSecretService(local, new Set()).durable, undefined)
    assert.equal(
      new TypedSecretService(new ScopedSecretService(local, new Set()), {})
        .durable,
      undefined
    )
  })
})
