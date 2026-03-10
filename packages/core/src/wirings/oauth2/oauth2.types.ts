/**
 * OAuth2 credential and token types.
 */

/**
 * App credentials for OAuth2 (client ID and secret).
 * These are typically set once and stored in the secret service.
 */
export type OAuth2AppCredential = {
  clientId: string
  clientSecret?: string // Optional for PKCE flows
}

/**
 * OAuth2 token data returned from token endpoint.
 */
export type OAuth2Token = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number // Unix timestamp
  tokenType: string
  scope?: string
}

/**
 * OAuth2-specific configuration that extends a credential.
 * This is stored in SecretDefinitionMeta.oauth2 field.
 */
export type OAuth2Config = {
  /** Where access/refresh tokens are stored */
  tokenSecretId: string
  /** OAuth2 authorization URL */
  authorizationUrl: string
  /** OAuth2 token exchange URL */
  tokenUrl: string
  /** Required scopes */
  scopes: string[]
  /** Use PKCE flow */
  pkce?: boolean
  /** Additional query parameters for authorization URL */
  additionalParams?: Record<string, string>
}
