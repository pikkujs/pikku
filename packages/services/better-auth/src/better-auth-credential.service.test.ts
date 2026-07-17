import { test, describe } from 'node:test'
import assert from 'node:assert'
import type { CredentialService } from '@pikku/core/services'
import { BetterAuthCredentialService } from './better-auth-credential.service.js'

class FakeFallback implements CredentialService {
  public store = new Map<string, unknown>()
  public calls: string[] = []

  private key(name: string, userId?: string) {
    return `${name}::${userId ?? ''}`
  }
  async get<T>(name: string, userId?: string): Promise<T | null> {
    this.calls.push(`get:${name}`)
    return (this.store.get(this.key(name, userId)) as T) ?? null
  }
  async set(name: string, value: unknown, userId?: string): Promise<void> {
    this.calls.push(`set:${name}`)
    this.store.set(this.key(name, userId), value)
  }
  async delete(name: string, userId?: string): Promise<void> {
    this.calls.push(`delete:${name}`)
    this.store.delete(this.key(name, userId))
  }
  async has(name: string, userId?: string): Promise<boolean> {
    this.calls.push(`has:${name}`)
    return this.store.has(this.key(name, userId))
  }
  async getAll(userId: string): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of this.store) {
      const [name, user] = key.split('::')
      if (user === userId) out[name!] = value
    }
    return out
  }
  async getUsersWithCredential(): Promise<string[]> {
    return ['fallback-user']
  }
  async getAllUsers(): Promise<string[]> {
    return ['fallback-user']
  }
}

const makeAuth = (options: {
  tokens?: Record<string, string>
  linked?: string[]
  onGetAccessToken?: (body: any) => void
}) => ({
  handler: async () => new Response(),
  api: {
    getAccessToken: async ({ body }: any) => {
      options.onGetAccessToken?.(body)
      const token = options.tokens?.[body.providerId]
      return token ? { accessToken: token } : {}
    },
    listUserAccounts: async () =>
      (options.linked ?? []).map((providerId) => ({ providerId })),
  },
})

const build = (auth: any, fallback: CredentialService) =>
  new BetterAuthCredentialService({
    getAuth: async () => auth as any,
    oauth2Names: ['google-docs', 'youtube'],
    fallback,
  })

describe('BetterAuthCredentialService', () => {
  test('reads an oauth2 token out of better-auth', async () => {
    const fallback = new FakeFallback()
    const service = build(
      makeAuth({ tokens: { 'google-docs': 'tok-1' }, linked: ['google-docs'] }),
      fallback
    )
    const result = await service.get('google-docs', 'user-1')
    assert.deepStrictEqual(result, { accessToken: 'tok-1' })
    assert.deepStrictEqual(fallback.calls, [], 'must not touch the fallback')
  })

  test('passes providerId and userId through to better-auth', async () => {
    const seen: any[] = []
    const service = build(
      makeAuth({
        tokens: { youtube: 't' },
        linked: ['youtube'],
        onGetAccessToken: (body) => seen.push(body),
      }),
      new FakeFallback()
    )
    await service.get('youtube', 'user-9')
    assert.deepStrictEqual(seen, [{ providerId: 'youtube', userId: 'user-9' }])
  })

  test('an unlinked provider is null, not an error', async () => {
    const service = build(makeAuth({ linked: [] }), new FakeFallback())
    assert.strictEqual(await service.get('google-docs', 'user-1'), null)
  })

  test('non-oauth2 credentials fall through to the fallback', async () => {
    const fallback = new FakeFallback()
    await fallback.set('stripe', { apiKey: 'sk_1' }, 'user-1')
    const service = build(makeAuth({}), fallback)
    assert.deepStrictEqual(await service.get('stripe', 'user-1'), {
      apiKey: 'sk_1',
    })
  })

  test('a singleton oauth2 credential (no userId) uses the fallback', async () => {
    const fallback = new FakeFallback()
    await fallback.set('google-docs', { accessToken: 'platform' }, undefined)
    const service = build(makeAuth({ tokens: { 'google-docs': 'user-tok' } }), fallback)
    assert.deepStrictEqual(await service.get('google-docs'), {
      accessToken: 'platform',
    })
  })

  test('setting an oauth2 credential is refused', async () => {
    const service = build(makeAuth({}), new FakeFallback())
    await assert.rejects(
      () => service.set('google-docs', { accessToken: 'x' }, 'user-1'),
      /better-auth owns its tokens/
    )
  })

  test('deleting an oauth2 credential points at the client unlink', async () => {
    const service = build(makeAuth({}), new FakeFallback())
    await assert.rejects(
      () => service.delete('youtube', 'user-1'),
      /unlinkAccount/
    )
  })

  test('set and delete still work for non-oauth2 credentials', async () => {
    const fallback = new FakeFallback()
    const service = build(makeAuth({}), fallback)
    await service.set('stripe', { apiKey: 'sk' }, 'user-1')
    assert.strictEqual(await service.has('stripe', 'user-1'), true)
    await service.delete('stripe', 'user-1')
    assert.strictEqual(await service.has('stripe', 'user-1'), false)
  })

  test('has() reflects whether the account is linked', async () => {
    const service = build(makeAuth({ linked: ['youtube'] }), new FakeFallback())
    assert.strictEqual(await service.has('youtube', 'user-1'), true)
    assert.strictEqual(await service.has('google-docs', 'user-1'), false)
  })

  test('getAll merges fallback credentials with linked tokens', async () => {
    const fallback = new FakeFallback()
    await fallback.set('stripe', { apiKey: 'sk' }, 'user-1')
    const service = build(
      makeAuth({
        tokens: { 'google-docs': 'tok', youtube: 'yt' },
        linked: ['google-docs'],
      }),
      fallback
    )
    const all = await service.getAll('user-1')
    assert.deepStrictEqual(all, {
      stripe: { apiKey: 'sk' },
      'google-docs': { accessToken: 'tok' },
    })
  })

  test('getAll does not fetch tokens for unlinked providers', async () => {
    const fetched: any[] = []
    const service = build(
      makeAuth({
        tokens: { 'google-docs': 'tok', youtube: 'yt' },
        linked: ['google-docs'],
        onGetAccessToken: (body) => fetched.push(body.providerId),
      }),
      new FakeFallback()
    )
    await service.getAll('user-1')
    assert.deepStrictEqual(fetched, ['google-docs'])
  })
})
