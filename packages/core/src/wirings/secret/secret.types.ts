export type CoreSecret<T = unknown> = {
  name: string
  displayName: string
  description?: string
  secretId: string
  schema: T
  /** Required by default: this says absence is a supported state, and `getSecret` resolves `undefined` rather than throwing. */
  optional?: boolean
  /** Where a user goes to obtain this value, surfaced beside a missing one. */
  docsUrl?: string
  /** Rotation cadence as a duration string, e.g. `'1d'`, `'30day'`, `'1w'`. */
  rotationPeriod?: string
  /**
   * Hosts this secret may be sent to, e.g. `['api.notion.com']` or
   * `'*.notion.com'`. Omitted means unrestricted unless
   * `config.secrets.requireAllowedHosts` is set.
   */
  allowedHosts?: string[]
}

export type OAuth2CredentialConfig = {
  /** Where access/refresh tokens are stored */
  tokenSecretId: string
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  pkce?: boolean
  /** Appended to the authorization URL's query string. */
  additionalParams?: Record<string, string>
}

export type SecretDefinitionMeta = {
  name: string
  displayName: string
  description?: string
  secretId: string
  schema?: Record<string, unknown> | string
  optional?: boolean
  docsUrl?: string
  oauth2?: OAuth2CredentialConfig
  rotationPeriod?: string
  /**
   * Hosts this secret may be sent to, e.g. `['api.notion.com']` or
   * `'*.notion.com'`. Omitted means unrestricted unless
   * `config.secrets.requireAllowedHosts` is set.
   */
  allowedHosts?: string[]
  sourceFile?: string
}

export type SecretDefinitionsMeta = Record<string, SecretDefinitionMeta>

export type SecretDefinitions = SecretDefinitionMeta[]

export const defineSecret = <T>(_config: CoreSecret<T>): void => {}
