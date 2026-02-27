import { describe, test } from 'node:test'
import assert from 'node:assert'
import { ScopedSecretService } from './scoped-secret-service.js'

const createMockSecrets = () => ({
  getSecret: async (key: string) => `value-of-${key}`,
  getSecretJSON: async (key: string) => ({ key }),
  hasSecret: async () => true,
  setSecretJSON: async () => {},
  deleteSecret: async () => {},
})

describe('ScopedSecretService', () => {
  test('should allow access to allowed keys', async () => {
    const mock = createMockSecrets()
    const scoped = new ScopedSecretService(mock, new Set(['KEY1', 'KEY2']))
    const result = await scoped.getSecret('KEY1')
    assert.strictEqual(result, 'value-of-KEY1')
  })

  test('should deny access to non-allowed keys', async () => {
    const mock = createMockSecrets()
    const scoped = new ScopedSecretService(mock, new Set(['KEY1']))
    await assert.rejects(() => scoped.getSecret('KEY2'), {
      message: 'Access denied to secret key: KEY2',
    })
  })

  test('should allow getSecretJSON for allowed keys', async () => {
    const mock = createMockSecrets()
    const scoped = new ScopedSecretService(mock, new Set(['KEY1']))
    const result = await scoped.getSecretJSON('KEY1')
    assert.deepStrictEqual(result, { key: 'KEY1' })
  })

  test('should deny getSecretJSON for non-allowed keys', async () => {
    const mock = createMockSecrets()
    const scoped = new ScopedSecretService(mock, new Set(['KEY1']))
    await assert.rejects(() => scoped.getSecretJSON('FORBIDDEN'), {
      message: 'Access denied to secret key: FORBIDDEN',
    })
  })

  test('should allow hasSecret for allowed keys', async () => {
    const mock = createMockSecrets()
    const scoped = new ScopedSecretService(mock, new Set(['KEY1']))
    const result = await scoped.hasSecret('KEY1')
    assert.strictEqual(result, true)
  })

  test('should deny hasSecret for non-allowed keys', async () => {
    const mock = createMockSecrets()
    const scoped = new ScopedSecretService(mock, new Set(['KEY1']))
    await assert.rejects(() => scoped.hasSecret('KEY2'), {
      message: 'Access denied to secret key: KEY2',
    })
  })

  test('should always throw on setSecretJSON', async () => {
    const mock = createMockSecrets()
    const scoped = new ScopedSecretService(mock, new Set(['KEY1']))
    await assert.rejects(() => scoped.setSecretJSON('KEY1', 'val'), {
      message: 'setSecretJSON is not allowed in scoped secret service',
    })
  })

  test('should always throw on deleteSecret', async () => {
    const mock = createMockSecrets()
    const scoped = new ScopedSecretService(mock, new Set(['KEY1']))
    await assert.rejects(() => scoped.deleteSecret('KEY1'), {
      message: 'deleteSecret is not allowed in scoped secret service',
    })
  })
})
