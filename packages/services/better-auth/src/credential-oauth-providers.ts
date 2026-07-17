import type { OAuth2CredentialConfig } from '@pikku/core/secret'

export type CredentialOAuth2Configs = Record<
  string,
  OAuth2CredentialConfig & {
    appCredentialSecretId: string
    type?: 'singleton' | 'wire'
  }
>

/** The subset of better-auth's genericOAuth provider config that a credential maps onto. */
export interface CredentialOAuthProvider {
  providerId: string
  clientId: string
  clientSecret?: string
  authorizationUrl: string
  tokenUrl: string
  scopes?: string[]
  pkce?: boolean
  authorizationUrlParams?: Record<string, string>
  /**
   * 'singleton' credentials belong to the platform, not to whoever connects
   * them, so their account hangs off the reserved platform user instead.
   */
  type?: 'singleton' | 'wire'
}

export interface CredentialOAuthApp {
  clientId: string
  clientSecret?: string
}

export interface CredentialOAuthSecretReader {
  getSecret<T = unknown>(secretId: string): Promise<T>
}

/**
 * Turns `wireCredential({ oauth2 })` declarations into better-auth genericOAuth
 * providers, one per credential, with the credential name as the providerId.
 *
 * One provider per credential rather than reusing better-auth's social
 * providers: accounts are keyed by (providerId, userId), so an addon sharing
 * `google` with the app's login provider would collide on a single account row
 * despite needing different scopes.
 *
 * Pass the generated `CREDENTIAL_OAUTH2_CONFIGS`:
 *
 * ```ts
 * genericOAuth({
 *   config: await credentialOAuthProviders(CREDENTIAL_OAUTH2_CONFIGS, services.secrets),
 * })
 * ```
 */
export const credentialOAuthProviders = async (
  configs: CredentialOAuth2Configs,
  secrets: CredentialOAuthSecretReader
): Promise<CredentialOAuthProvider[]> =>
  Promise.all(
    Object.entries(configs).map(async ([providerId, config]) => {
      const app = await secrets.getSecret<CredentialOAuthApp>(
        config.appCredentialSecretId
      )
      if (!app?.clientId) {
        throw new Error(
          `OAuth2 credential '${providerId}' has no clientId — secret '${config.appCredentialSecretId}' is missing or malformed.`
        )
      }
      return {
        providerId,
        clientId: app.clientId,
        clientSecret: app.clientSecret,
        authorizationUrl: config.authorizationUrl,
        tokenUrl: config.tokenUrl,
        scopes: config.scopes,
        pkce: config.pkce,
        // Provider-specific flags that decide whether a refresh token is issued
        // at all (access_type=offline, duration=permanent).
        authorizationUrlParams: config.additionalParams,
        type: config.type,
      }
    })
  )
