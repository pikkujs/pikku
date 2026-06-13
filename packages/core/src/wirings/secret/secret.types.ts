export type CoreSecret<T = unknown> = {
  name: string
  displayName: string
  description?: string
  secretId: string
  schema: T
  /**
   * Optional rotation cadence for this secret, e.g. '1d', '30day', '1w'.
   * Stored in the generated secrets metadata so consumers can tell when a
   * secret was last updated and whether it is due for rotation.
   */
  rotationPeriod?: string
}

export type OAuth2CredentialConfig = {
  tokenSecretId: string
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  pkce?: boolean
  additionalParams?: Record<string, string>
}

export type SecretDefinitionMeta = {
  name: string
  displayName: string
  description?: string
  secretId: string
  schema?: Record<string, unknown> | string
  oauth2?: OAuth2CredentialConfig
  rotationPeriod?: string
  sourceFile?: string
}

export type SecretDefinitionsMeta = Record<string, SecretDefinitionMeta>

export type SecretDefinitions = SecretDefinitionMeta[]

export const wireSecret = <T>(_config: CoreSecret<T>): void => {}
