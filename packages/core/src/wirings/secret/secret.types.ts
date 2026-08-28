export type CoreSecret<T = unknown> = {
  /** The key code reads it by: `secrets.getSecret('NAME')`. SCREAMING_SNAKE_CASE. */
  name: string
  /** How the secret is labelled wherever a person is asked to supply it. */
  displayName: string
  /** What this secret is for, shown beside the field someone has to fill in. */
  description?: string
  /** The id under the backing store, which is where the value actually lives. */
  secretId: string
  /**
   * The shape of the value, as a schema. This is what types `getSecret`'s
   * result — pass the schema itself, not an instance of it.
   */
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

/**
 * Declares a secret this project needs, with the shape of its value. The CLI
 * collects every declaration into `CredentialsMap`, which is what makes
 * `secrets.getSecret('NAME')` return the right type instead of `unknown`.
 *
 * @example snippet: secrets
 */
export const defineSecret = <T>(_config: CoreSecret<T>): void => {}
