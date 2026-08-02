import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SecretAccessDeniedError, withoutSecrets } from './secretless.js'

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
