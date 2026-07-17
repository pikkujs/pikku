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
 * better-auth signals an unlinked account by throwing an APIError whose
 * `body.code` is ACCOUNT_NOT_FOUND. Matched on the code rather than the
 * message, which is display text and free to change.
 */
const isAccountNotFound = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { body?: { code?: string } }).body?.code === 'ACCOUNT_NOT_FOUND'

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

  /**
   * A credential is better-auth's only when it is oauth2 AND scoped to a user.
   * `type: 'singleton'` has no userId, and better-auth's account table is keyed
   * by one — so platform-level tokens stay with the fallback.
   */
  private ownsOAuth2(name: string, userId?: string): userId is string {
    return this.oauth2Names.has(name) && !!userId
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
    let result: { accessToken?: string } | undefined
    try {
      result = await auth.api.getAccessToken({ body: { providerId, userId } })
    } catch (error) {
      // better-auth throws ACCOUNT_NOT_FOUND rather than returning empty. Only
      // that one means "not linked" — anything else (a failed refresh, a
      // misconfigured provider) is a real error and must not read as null.
      if (!isAccountNotFound(error)) {
        throw error
      }
      return null
    }
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
    return (await this.readToken(name, userId)) !== null
  }

  /**
   * Reading every declared oauth2 credential is the only way to learn which are
   * linked: `listUserAccounts` is session-bound (it ignores a userId and throws
   * UNAUTHORIZED when called server-side), whereas `getAccessToken` takes one.
   * They resolve concurrently since each may refresh against its provider.
   */
  async getAll(userId: string): Promise<Record<string, unknown>> {
    // Never reach for better-auth when there is nothing for it to own: an app
    // with no oauth2 credentials must not have every credential read fail just
    // because an auth instance cannot be resolved.
    if (this.oauth2Names.size === 0 || !userId) {
      return this.fallback.getAll(userId)
    }

    const [fallbackCredentials, tokens] = await Promise.all([
      this.fallback.getAll(userId),
      Promise.all(
        [...this.oauth2Names].map(
          async (name) => [name, await this.readToken(name, userId)] as const
        )
      ),
    ])

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
