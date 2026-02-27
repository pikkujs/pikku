import { describe, test } from 'node:test'
import assert from 'node:assert'
import { TypedSecretService } from './typed-secret-service.js'

const createMockSecrets = (store: Map<string, string> = new Map()) => ({
  getSecret: async (key: string) => {
    const val = store.get(key)
    if (!val) throw new Error(`Not found: ${key}`)
    return val
  },
  getSecretJSON: async (key: string) => {
    const val = store.get(key)
    if (!val) throw new Error(`Not found: ${key}`)
    return JSON.parse(val)
  },
  hasSecret: async (key: string) => store.has(key),
  setSecretJSON: async (key: string, value: unknown) => {
    store.set(key, JSON.stringify(value))
  },
  deleteSecret: async (key: string) => {
    store.delete(key)
  },
})

describe('TypedSecretService', () => {
  test('should delegate getSecret to underlying service', async () => {
    const store = new Map([['API_KEY', 'sk-123']])
    const service = new TypedSecretService(createMockSecrets(store), {})
    const result = await service.getSecret('API_KEY')
    assert.strictEqual(result, 'sk-123')
  })

  test('should delegate getSecretJSON to underlying service', async () => {
    const store = new Map([['CONFIG', '{"port":3000}']])
    const service = new TypedSecretService(createMockSecrets(store), {})
    const result = await service.getSecretJSON('CONFIG')
    assert.deepStrictEqual(result, { port: 3000 })
  })

  test('should delegate hasSecret to underlying service', async () => {
    const store = new Map([['EXISTS', 'val']])
    const service = new TypedSecretService(createMockSecrets(store), {})
    assert.strictEqual(await service.hasSecret('EXISTS'), true)
    assert.strictEqual(await service.hasSecret('MISSING'), false)
  })

  test('should delegate setSecretJSON to underlying service', async () => {
    const store = new Map<string, string>()
    const service = new TypedSecretService(createMockSecrets(store), {})
    await service.setSecretJSON('NEW_KEY', { data: 'val' })
    assert.strictEqual(store.get('NEW_KEY'), '{"data":"val"}')
  })

  test('should delegate deleteSecret to underlying service', async () => {
    const store = new Map([['KEY', 'val']])
    const service = new TypedSecretService(createMockSecrets(store), {})
    await service.deleteSecret('KEY')
    assert.strictEqual(store.has('KEY'), false)
  })

  test('should get all status for credentials', async () => {
    const store = new Map([['STRIPE_KEY', 'sk-123']])
    const meta = {
      STRIPE_KEY: { name: 'stripe', displayName: 'Stripe' },
      GITHUB_TOKEN: {
        name: 'github',
        displayName: 'GitHub',
        oauth2: { tokenSecretId: 'GH_TOKEN' },
      },
    }
    const service = new TypedSecretService(createMockSecrets(store), meta)
    const status = await service.getAllStatus()
    assert.strictEqual(status.length, 2)
    const stripeStatus = status.find((s) => s.secretId === 'STRIPE_KEY')!
    assert.strictEqual(stripeStatus.isConfigured, true)
    assert.strictEqual(stripeStatus.displayName, 'Stripe')
    const ghStatus = status.find((s) => s.secretId === 'GITHUB_TOKEN')!
    assert.strictEqual(ghStatus.isConfigured, false)
    assert.deepStrictEqual(ghStatus.oauth2, { tokenSecretId: 'GH_TOKEN' })
  })

  test('should get missing credentials', async () => {
    const store = new Map([['STRIPE_KEY', 'sk-123']])
    const meta = {
      STRIPE_KEY: { name: 'stripe', displayName: 'Stripe' },
      GITHUB_TOKEN: { name: 'github', displayName: 'GitHub' },
    }
    const service = new TypedSecretService(createMockSecrets(store), meta)
    const missing = await service.getMissing()
    assert.strictEqual(missing.length, 1)
    assert.strictEqual(missing[0].secretId, 'GITHUB_TOKEN')
  })
})
