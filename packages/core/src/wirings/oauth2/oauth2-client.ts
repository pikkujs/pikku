import { OAuth2Token, OAuth2AppCredential } from './oauth2.types.js'
import { OAuth2CredentialConfig } from '../credential/credential.types.js'
import { SecretService } from '../../services/secret-service.js'

/**
 * OAuth2 client that acts as a service.
 * Created once in createSingletonServices, handles token caching and refresh internally.
 * Functions use it directly via oauth.request().
 *
 * @example
 * ```typescript
 * // In services.ts
 * export const createSingletonServices = async (config, { secrets }) => {
 *   return {
 *     slackOAuth: new OAuth2Client(
 *       { tokenSecretId: 'SLACK_TOKENS', authorizationUrl: '...', tokenUrl: '...', scopes: [] },
 *       'SLACK_APP_CREDS',
 *       secrets
 *     ),
 *   }
 * }
 *
 * // In function
 * export const postMessage = pikkuFunc(async ({ slackOAuth }, { channel, text }) => {
 *   const response = await slackOAuth.request('https://slack.com/api/chat.postMessage', {
 *     method: 'POST',
 *     body: JSON.stringify({ channel, text }),
 *   })
 *   return response.json()
 * })
 * ```
 */
export class OAuth2Client {
  private cachedToken: OAuth2Token | null = null
  private cachedAppCredential: OAuth2AppCredential | null = null
  private refreshPromise: Promise<OAuth2Token> | null = null

  constructor(
    private oauth2Config: OAuth2CredentialConfig,
    private appCredentialSecretId: string,
    private secrets: SecretService
  ) {}

  /**
   * Make an authenticated request. Handles token caching and 401 refresh.
   */
  async request(url: string, options?: RequestInit): Promise<Response> {
    const token = await this.getAccessToken()

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`,
      },
    })

    // Auto-retry on 401 after refresh
    if (response.status === 401) {
      const newToken = await this.refreshAndGetToken()
      return fetch(url, {
        ...options,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${newToken}`,
        },
      })
    }

    return response
  }

  /**
   * Get cached token or load from secrets.
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if valid
    if (this.cachedToken) {
      if (this.isTokenValid(this.cachedToken)) {
        return this.cachedToken.accessToken
      }
      // Token expired, try to refresh
      if (this.cachedToken.refreshToken) {
        return this.refreshAndGetToken()
      }
    }

    // Load from secrets
    const token = await this.secrets.getSecretJSON<OAuth2Token>(
      this.oauth2Config.tokenSecretId
    )
    this.cachedToken = token
    return token.accessToken
  }

  /**
   * Refresh token and update cache.
   * Uses a promise lock to prevent concurrent refresh attempts.
   */
  private async refreshAndGetToken(): Promise<string> {
    // If already refreshing, wait for that to complete
    if (this.refreshPromise) {
      const token = await this.refreshPromise
      return token.accessToken
    }

    // Start refresh
    this.refreshPromise = this.doRefreshToken()

    try {
      const token = await this.refreshPromise
      this.cachedToken = token
      return token.accessToken
    } finally {
      this.refreshPromise = null
    }
  }

  /**
   * Perform the actual token refresh.
   */
  private async doRefreshToken(): Promise<OAuth2Token> {
    if (!this.cachedToken?.refreshToken) {
      throw new Error('No refresh token available')
    }

    const appCredential = await this.getAppCredential()

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.cachedToken.refreshToken,
      client_id: appCredential.clientId,
    })

    if (appCredential.clientSecret) {
      params.set('client_secret', appCredential.clientSecret)
    }

    const response = await fetch(this.oauth2Config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`)
    }

    const data = await response.json()

    const token: OAuth2Token = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.cachedToken.refreshToken,
      expiresAt: data.expires_in
        ? Date.now() + data.expires_in * 1000
        : undefined,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    }

    return token
  }

  /**
   * Check if token is valid (not expired).
   */
  private isTokenValid(token: OAuth2Token): boolean {
    if (!token.expiresAt) {
      return true // No expiry info, assume valid
    }
    // Add 60 second buffer to account for clock skew
    return token.expiresAt > Date.now() + 60000
  }

  /**
   * Get app credentials (cached).
   */
  private async getAppCredential(): Promise<OAuth2AppCredential> {
    if (this.cachedAppCredential) {
      return this.cachedAppCredential
    }
    this.cachedAppCredential =
      await this.secrets.getSecretJSON<OAuth2AppCredential>(
        this.appCredentialSecretId
      )
    return this.cachedAppCredential
  }

  // ========================================
  // CLI-only methods (for pikku oauth connect)
  // ========================================

  /**
   * Generate OAuth2 authorization URL.
   * Used by CLI during `pikku oauth connect`.
   */
  async getAuthorizationUrl(
    state: string,
    redirectUri: string
  ): Promise<string> {
    const appCredential = await this.getAppCredential()

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: appCredential.clientId,
      redirect_uri: redirectUri,
      scope: this.oauth2Config.scopes.join(' '),
      state,
    })

    // Add PKCE if enabled
    // Note: code_verifier should be stored and passed to exchangeCode
    // For now, PKCE implementation is simplified

    // Add any additional params
    if (this.oauth2Config.additionalParams) {
      for (const [key, value] of Object.entries(
        this.oauth2Config.additionalParams
      )) {
        params.set(key, value)
      }
    }

    return `${this.oauth2Config.authorizationUrl}?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens.
   * Used by CLI during `pikku oauth connect`.
   */
  async exchangeCode(code: string, redirectUri: string): Promise<OAuth2Token> {
    const appCredential = await this.getAppCredential()

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: appCredential.clientId,
    })

    if (appCredential.clientSecret) {
      params.set('client_secret', appCredential.clientSecret)
    }

    const response = await fetch(this.oauth2Config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`)
    }

    const data = await response.json()

    const token: OAuth2Token = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? Date.now() + data.expires_in * 1000
        : undefined,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    }

    // Cache the token
    this.cachedToken = token

    return token
  }
}
