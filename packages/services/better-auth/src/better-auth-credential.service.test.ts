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

/** Mirrors better-auth's APIError: an unlinked account THROWS, it is not empty. */
const accountNotFound = () =>
  Object.assign(new Error('Account not found'), {
    status: 'BAD_REQUEST',
    body: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
  })

/**
 * Deliberately exposes ONLY getAccessToken: `listUserAccounts` is session-bound
 * and throws UNAUTHORIZED when called server-side with a userId, so a fake of it
 * could only ever lie. A token here means the account is linked.
 */
const makeAuth = (options: {
  tokens?: Record<string, string>
  onGetAccessToken?: (body: any) => void
  throwOnGetAccessToken?: unknown
  accounts?: Array<{ id: string; providerId: string; userId: string }>
  onDeleteAccount?: (id: string) => void
}) => ({
  handler: async () => new Response(),
  $context: Promise.resolve({
    internalAdapter: {
      findAccounts: async (userId: string) =>
        (options.accounts ?? []).filter((a) => a.userId === userId),
      deleteAccount: async (id: string) => options.onDeleteAccount?.(id),
    },
  }),
  api: {
    getAccessToken: async ({ body }: any) => {
      options.onGetAccessToken?.(body)
      if (options.throwOnGetAccessToken) {
        throw options.throwOnGetAccessToken
      }
      const token = options.tokens?.[body.providerId]
      if (!token) {
        throw accountNotFound()
      }
      return { accessToken: token }
    },
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
      makeAuth({ tokens: { 'google-docs': 'tok-1' } }),
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
        onGetAccessToken: (body) => seen.push(body),
      }),
      new FakeFallback()
    )
    await service.get('youtube', 'user-9')
    assert.deepStrictEqual(seen, [{ providerId: 'youtube', userId: 'user-9' }])
  })

  test('an unlinked provider is null, not an error', async () => {
    const service = build(makeAuth({}), new FakeFallback())
    assert.strictEqual(await service.get('google-docs', 'user-1'), null)
  })

  // A failed refresh or a misconfigured provider must not be indistinguishable
  // from "the user hasn't connected yet" — that would silently show a connect
  // button for an account that is already linked but broken.
  test('an error other than ACCOUNT_NOT_FOUND propagates', async () => {
    const service = build(
      makeAuth({
        throwOnGetAccessToken: Object.assign(new Error('refresh failed'), {
          body: { code: 'PROVIDER_NOT_SUPPORTED' },
        }),
      }),
      new FakeFallback()
    )
    await assert.rejects(
      () => service.get('google-docs', 'user-1'),
      /refresh failed/
    )
  })

  test('non-oauth2 credentials fall through to the fallback', async () => {
    const fallback = new FakeFallback()
    await fallback.set('stripe', { apiKey: 'sk_1' }, 'user-1')
    const service = build(makeAuth({}), fallback)
    assert.deepStrictEqual(await service.get('stripe', 'user-1'), {
      apiKey: 'sk_1',
    })
  })

  // A wire credential is the caller's, so with no caller there is no account to
  // read — it must not silently resolve someone else's token.
  test('a wire oauth2 credential without a userId uses the fallback', async () => {
    const fallback = new FakeFallback()
    await fallback.set('google-docs', { accessToken: 'seeded' }, undefined)
    const service = build(
      makeAuth({ tokens: { 'google-docs': 'user-tok' } }),
      fallback
    )
    assert.deepStrictEqual(await service.get('google-docs'), {
      accessToken: 'seeded',
    })
  })

  const buildWithSingleton = (auth: any, fallback: CredentialService) =>
    new BetterAuthCredentialService({
      getAuth: async () => auth as any,
      oauth2Names: ['company-slack', 'youtube'],
      singletonOAuth2Names: ['company-slack'],
      platformUserId: 'platform-user',
      fallback,
    })

  test('a singleton credential resolves against the platform user', async () => {
    const seen: any[] = []
    const service = buildWithSingleton(
      makeAuth({
        tokens: { 'company-slack': 'platform-tok' },
        onGetAccessToken: (body) => seen.push(body),
      }),
      new FakeFallback()
    )
    assert.deepStrictEqual(await service.get('company-slack'), {
      accessToken: 'platform-tok',
    })
    assert.deepStrictEqual(seen, [
      { providerId: 'company-slack', userId: 'platform-user' },
    ])
  })

  // The platform's token is the same token for everyone: a caller's own id must
  // never be used to look it up, or each user would see their own empty account.
  test('a singleton ignores the calling user and stays platform-owned', async () => {
    const seen: any[] = []
    const service = buildWithSingleton(
      makeAuth({
        tokens: { 'company-slack': 'platform-tok' },
        onGetAccessToken: (body) => seen.push(body.userId),
      }),
      new FakeFallback()
    )
    await service.get('company-slack', 'user-7')
    assert.deepStrictEqual(seen, ['platform-user'])
  })

  test('getAll reads a singleton from the platform user, not the caller', async () => {
    const service = buildWithSingleton(
      makeAuth({ tokens: { 'company-slack': 'platform-tok', youtube: 'yt' } }),
      new FakeFallback()
    )
    assert.deepStrictEqual(await service.getAll('user-7'), {
      'company-slack': { accessToken: 'platform-tok' },
      youtube: { accessToken: 'yt' },
    })
  })

  test('setting an oauth2 credential is refused', async () => {
    const service = build(makeAuth({}), new FakeFallback())
    await assert.rejects(
      () => service.set('google-docs', { accessToken: 'x' }, 'user-1'),
      /better-auth owns its tokens/
    )
  })

  // Server-side revoke is the admin's path (console:credentialDelete) and the
  // only possible path for a platform credential, whose owner never has a
  // session for better-auth's own unlink endpoint to act on.
  test('deleting an oauth2 credential removes that user\'s account row', async () => {
    const deleted: string[] = []
    const service = build(
      makeAuth({
        accounts: [
          { id: 'acc-1', providerId: 'youtube', userId: 'user-1' },
          // Same provider, different user, and a different provider for the
          // same user: neither may be touched.
          { id: 'acc-2', providerId: 'youtube', userId: 'user-2' },
          { id: 'acc-3', providerId: 'google-docs', userId: 'user-1' },
        ],
        onDeleteAccount: (id) => deleted.push(id),
      }),
      new FakeFallback()
    )
    await service.delete('youtube', 'user-1')
    assert.deepStrictEqual(deleted, ['acc-1'])
  })

  test('deleting an unlinked oauth2 credential is a no-op', async () => {
    const deleted: string[] = []
    const service = build(
      makeAuth({ accounts: [], onDeleteAccount: (id) => deleted.push(id) }),
      new FakeFallback()
    )
    await service.delete('youtube', 'user-1')
    assert.deepStrictEqual(deleted, [])
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
    const service = build(makeAuth({ tokens: { youtube: 'yt' } }), new FakeFallback())
    assert.strictEqual(await service.has('youtube', 'user-1'), true)
    assert.strictEqual(await service.has('google-docs', 'user-1'), false)
  })

  test('getAll merges fallback credentials with linked tokens', async () => {
    const fallback = new FakeFallback()
    await fallback.set('stripe', { apiKey: 'sk' }, 'user-1')
    const service = build(
      makeAuth({ tokens: { 'google-docs': 'tok' } }),
      fallback
    )
    const all = await service.getAll('user-1')
    assert.deepStrictEqual(all, {
      stripe: { apiKey: 'sk' },
      'google-docs': { accessToken: 'tok' },
    })
  })

  // An app with no oauth2 credentials must never touch better-auth: resolving
  // an auth instance that does not exist would fail every credential read.
  test('getAll never resolves auth when no oauth2 credentials are declared', async () => {
    const fallback = new FakeFallback()
    await fallback.set('stripe', { apiKey: 'sk' }, 'user-1')
    const service = new BetterAuthCredentialService({
      getAuth: async () => {
        throw new Error('auth must not be resolved')
      },
      oauth2Names: [],
      fallback,
    })
    assert.deepStrictEqual(await service.getAll('user-1'), {
      stripe: { apiKey: 'sk' },
    })
  })

  test('getAll never resolves auth without a userId', async () => {
    const service = new BetterAuthCredentialService({
      getAuth: async () => {
        throw new Error('auth must not be resolved')
      },
      oauth2Names: ['google-docs'],
      fallback: new FakeFallback(),
    })
    assert.deepStrictEqual(await service.getAll(''), {})
  })

  // credential-agent.feature seeds `user-oauth` with no userId; that must keep
  // working through the fallback rather than being claimed by better-auth.
  test('a platform-level write of an oauth2 credential is allowed', async () => {
    const fallback = new FakeFallback()
    const service = build(makeAuth({}), fallback)
    await service.set('google-docs', { accessToken: 'seeded' })
    assert.deepStrictEqual(await service.get('google-docs'), {
      accessToken: 'seeded',
    })
  })

  // Only linked providers land in the result; an unlinked one is read (that is
  // how we learn it is unlinked) but must not appear as an empty credential.
  test('getAll omits unlinked providers', async () => {
    const service = build(
      makeAuth({ tokens: { 'google-docs': 'tok' } }),
      new FakeFallback()
    )
    assert.deepStrictEqual(await service.getAll('user-1'), {
      'google-docs': { accessToken: 'tok' },
    })
  })
})
