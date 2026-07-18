import { describe, test } from 'node:test'
import assert from 'node:assert'
import { TypedSecretService } from './typed-secret-service.js'

const createMockSecrets = (store: Map<string, string> = new Map()) => ({
  getSecret: async <T = string>(key: string): Promise<T> => {
    const val = store.get(key)
    if (!val) throw new Error(`Not found: ${key}`)
    try {
      return JSON.parse(val) as T
    } catch {
      return val as unknown as T
    }
  },
  hasSecret: async (key: string) => store.has(key),
  setSecret: async (key: string, value: unknown) => {
    store.set(key, JSON.stringify(value))
  },
  deleteSecret: async (key: string) => {
    store.delete(key)
  },
})

describe('TypedSecretService', () => {
  test('should delegate getSecret to underlying service', async () => {
    const store = new Map([['API_KEY', '"sk-123"']])
    const service = new TypedSecretService(createMockSecrets(store), {})
    const result = await service.getSecret('API_KEY')
    assert.strictEqual(result, 'sk-123')
  })

  test('should delegate getSecret with type to underlying service', async () => {
    const store = new Map([['CONFIG', '{"port":3000}']])
    const service = new TypedSecretService(createMockSecrets(store), {})
    const result = await service.getSecret<{ port: number }>('CONFIG')
    assert.deepStrictEqual(result, { port: 3000 })
  })

  test('should delegate hasSecret to underlying service', async () => {
    const store = new Map([['EXISTS', '"val"']])
    const service = new TypedSecretService(createMockSecrets(store), {})
    assert.strictEqual(await service.hasSecret('EXISTS'), true)
    assert.strictEqual(await service.hasSecret('MISSING'), false)
  })

  test('should delegate setSecret to underlying service', async () => {
    const store = new Map<string, string>()
    const service = new TypedSecretService(createMockSecrets(store), {})
    await service.setSecret('NEW_KEY', { data: 'val' })
    assert.strictEqual(store.get('NEW_KEY'), '{"data":"val"}')
  })

  test('should delegate deleteSecret to underlying service', async () => {
    const store = new Map([['KEY', '"val"']])
    const service = new TypedSecretService(createMockSecrets(store), {})
    await service.deleteSecret('KEY')
    assert.strictEqual(store.has('KEY'), false)
  })

  test('should get all status for credentials', async () => {
    const store = new Map([['STRIPE_KEY', '"sk-123"']])
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

  test('should cache getSecret and not re-hit the underlying service', async () => {
    let calls = 0
    const inner = {
      getSecret: async <T = string>(key: string): Promise<T> => {
        calls++
        return `v-${key}` as unknown as T
      },
      hasSecret: async () => true,
      setSecret: async () => {},
      deleteSecret: async () => {},
    }
    const service = new TypedSecretService(inner, {})
    assert.strictEqual(await service.getSecret('K'), 'v-K')
    assert.strictEqual(await service.getSecret('K'), 'v-K')
    assert.strictEqual(calls, 1)
  })

  test('should invalidate the cache on setSecret and deleteSecret', async () => {
    const store = new Map([['K', '"a"']])
    const service = new TypedSecretService(createMockSecrets(store), {})
    assert.strictEqual(await service.getSecret('K'), 'a')
    await service.setSecret('K', 'b')
    assert.strictEqual(await service.getSecret('K'), 'b')
    await service.deleteSecret('K')
    await assert.rejects(() => service.getSecret('K'))
  })

  test('should not cache a getSecret miss', async () => {
    const store = new Map<string, string>()
    const service = new TypedSecretService(createMockSecrets(store), {})
    await assert.rejects(() => service.getSecret('K'))
    store.set('K', '"now-here"')
    assert.strictEqual(await service.getSecret('K'), 'now-here')
  })

  test('should get missing credentials', async () => {
    const store = new Map([['STRIPE_KEY', '"sk-123"']])
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
