import type { CredentialService } from '@pikku/core/services'
import type { BetterAuthInstance } from './define-auth.js'

export interface BetterAuthCredentialServiceOptions {
  /**
   * Resolves the better-auth instance. Lazy by necessity: the auth factory is
   * built from singleton services, and this service is one of them, so it
   * cannot hold the instance at construction time.
   */
  getAuth: () => Promise<BetterAuthInstance>
  /**
   * Credential names whose tokens better-auth owns. The credential name is the
   * better-auth providerId. Generated as `CREDENTIAL_OAUTH2_NAMES`.
   */
  oauth2Names: Iterable<string>
  /**
   * Handles every credential better-auth does not own: API keys, HMAC signers,
   * and any `type: 'singleton'` credential (better-auth's account table is
   * keyed by userId, so platform-level tokens have nothing to link to).
   */
  fallback: CredentialService
}

/**
 * Reads OAuth2 credentials out of better-auth's `account` table, so a token is
 * refreshed on read rather than served stale. Everything else falls through to
 * `fallback`.
 */
export class BetterAuthCredentialService implements CredentialService {
  private readonly getAuth: () => Promise<BetterAuthInstance>
  private readonly oauth2Names: Set<string>
  private readonly fallback: CredentialService

  constructor(options: BetterAuthCredentialServiceOptions) {
    this.getAuth = options.getAuth
    this.oauth2Names = new Set(options.oauth2Names)
    this.fallback = options.fallback
  }

  private ownsOAuth2(name: string, userId?: string): userId is string {
    return this.oauth2Names.has(name) && userId !== undefined
  }

  async get<T = unknown>(name: string, userId?: string): Promise<T | null> {
    if (!this.ownsOAuth2(name, userId)) {
      return this.fallback.get<T>(name, userId)
    }
    return (await this.readToken(name, userId)) as T | null
  }

  /**
   * Returns null when the user has not linked the provider — an unlinked
   * account is a normal state that callers handle (MissingCredentialError,
   * the connect card), not an error.
   */
  private async readToken(
    providerId: string,
    userId: string
  ): Promise<{ accessToken: string } | null> {
    const auth = await this.getAuth()
    const result = await auth.api.getAccessToken({
      body: { providerId, userId },
    })
    if (!result?.accessToken) {
      return null
    }
    return { accessToken: result.accessToken }
  }

  async set(name: string, value: unknown, userId?: string): Promise<void> {
    if (this.ownsOAuth2(name, userId)) {
      throw new Error(
        `Cannot set OAuth2 credential '${name}' directly — better-auth owns its tokens. Link the account via the OAuth flow instead.`
      )
    }
    return this.fallback.set(name, value, userId)
  }

  async delete(name: string, userId?: string): Promise<void> {
    if (this.ownsOAuth2(name, userId)) {
      throw new Error(
        `Cannot delete OAuth2 credential '${name}' server-side — better-auth's unlink endpoint acts on the caller's session. Call authClient.unlinkAccount({ providerId: '${name}' }) from the client.`
      )
    }
    return this.fallback.delete(name, userId)
  }

  async has(name: string, userId?: string): Promise<boolean> {
    if (!this.ownsOAuth2(name, userId)) {
      return this.fallback.has(name, userId)
    }
    const linked = await this.linkedProviders(userId)
    return linked.has(name)
  }

  private async linkedProviders(userId: string): Promise<Set<string>> {
    const auth = await this.getAuth()
    const accounts = await auth.api.listUserAccounts({ body: { userId } })
    const providers = new Set<string>()
    for (const account of (accounts ?? []) as Array<{ providerId?: string }>) {
      if (account.providerId) {
        providers.add(account.providerId)
      }
    }
    return providers
  }

  /**
   * Only linked providers are fetched — an unlinked one has no token and would
   * cost a round trip to learn that. Tokens resolve concurrently because each
   * one may trigger a refresh against the provider.
   */
  async getAll(userId: string): Promise<Record<string, unknown>> {
    const [fallbackCredentials, linked] = await Promise.all([
      this.fallback.getAll(userId),
      this.linkedProviders(userId),
    ])

    const wanted = [...this.oauth2Names].filter((name) => linked.has(name))
    const tokens = await Promise.all(
      wanted.map(async (name) => [name, await this.readToken(name, userId)] as const)
    )

    const result: Record<string, unknown> = { ...fallbackCredentials }
    for (const [name, token] of tokens) {
      if (token) {
        result[name] = token
      }
    }
    return result
  }

  async getUsersWithCredential(name: string): Promise<string[]> {
    if (!this.oauth2Names.has(name)) {
      return this.fallback.getUsersWithCredential(name)
    }
    throw new Error(
      `Cannot list users for OAuth2 credential '${name}' — better-auth exposes no reverse account lookup.`
    )
  }

  async getAllUsers(): Promise<string[]> {
    return this.fallback.getAllUsers()
  }
}
