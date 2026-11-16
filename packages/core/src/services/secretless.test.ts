import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SecretAccessDeniedError,
  secretlessView,
  withoutSecrets,
} from './secretless.js'

const services = () => ({
  logger: { info: () => {} },
  secrets: { getSecret: async () => 'super-secret' },
  db: { query: async () => [] },
})

describe('withoutSecrets', () => {
  test('throws when secrets is read', () => {
    const stripped = withoutSecrets(services(), 'a pikku function') as any
    assert.throws(() => stripped.secrets, SecretAccessDeniedError)
  })

  test('throws when secrets is destructured, at the point of the mistake', () => {
    const stripped = withoutSecrets(services(), 'a pikku function') as any
    assert.throws(() => {
      const { secrets } = stripped
      return secrets
    }, SecretAccessDeniedError)
  })

  test('names the context so the message points somewhere', () => {
    const stripped = withoutSecrets(services(), 'a permission') as any
    assert.throws(
      () => stripped.secrets,
      (error: Error) => error.message.includes('a permission')
    )
  })

  test('leaves every other service reachable', () => {
    const stripped = withoutSecrets(services(), 'a pikku function')
    assert.ok(stripped.logger)
    assert.ok(stripped.db)
  })

  test('does not mutate the original services object', async () => {
    const original = services()
    withoutSecrets(original, 'a pikku function')
    assert.equal(await original.secrets.getSecret(), 'super-secret')
  })

  test('is a no-op when there is no secrets service', () => {
    const bare = { logger: {} }
    assert.equal(withoutSecrets(bare, 'a pikku function'), bare)
  })

  test('does not leak the value through spreading', () => {
    const stripped = withoutSecrets(services(), 'a pikku function')
    assert.equal('secrets' in { ...stripped }, false)
  })
})

describe('secretlessView', () => {
  test('returns the same view for the same services object and context', () => {
    const singletons = services()
    assert.equal(
      secretlessView(singletons, 'a permission'),
      secretlessView(singletons, 'a permission')
    )
  })

  test('still throws on secrets, and keeps every other service', () => {
    const singletons = services()
    const view = secretlessView(singletons, 'a permission') as any
    assert.throws(() => view.secrets, SecretAccessDeniedError)
    assert.equal(view.db, singletons.db)
    assert.equal(view.logger, singletons.logger)
    assert.equal('secrets' in view, true)
    assert.equal(Object.keys(view).includes('secrets'), false)
  })

  test('is not shared between different services objects', () => {
    const a = services()
    const b = services()
    const viewA = secretlessView(a, 'a permission') as any
    const viewB = secretlessView(b, 'a permission') as any
    assert.notEqual(viewA, viewB)
    assert.equal(viewA.db, a.db)
    assert.equal(viewB.db, b.db)
  })

  test('is not shared between contexts, so the error names its own', () => {
    const singletons = services()
    const permission = secretlessView(singletons, 'a permission') as any
    const func = secretlessView(singletons, 'a pikku function') as any
    assert.notEqual(permission, func)
    assert.throws(
      () => permission.secrets,
      (error: Error) => error.message.includes('a permission')
    )
    assert.throws(
      () => func.secrets,
      (error: Error) => error.message.includes('a pikku function')
    )
  })

  test('does not mutate or retain the original secrets', async () => {
    const singletons = services()
    secretlessView(singletons, 'a permission')
    assert.equal(await singletons.secrets.getSecret(), 'super-secret')
  })

  test('a services object without secrets is returned as it is', () => {
    const plain = { db: {} }
    assert.equal(secretlessView(plain, 'a permission'), plain)
  })

  test('secrets attached after a first call are still hidden from the view', async () => {
    const late: Record<string, unknown> = { db: {} }
    assert.equal(secretlessView(late, 'a permission'), late)
    late.secrets = { getSecret: async () => 'super-secret' }
    const view = secretlessView(late, 'a permission') as any
    assert.throws(() => view.secrets, SecretAccessDeniedError)
  })
})
