export type CoreSecret<T = unknown> = {
  name: string
  displayName: string
  description?: string
  secretId: string
  schema: T
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
  sourceFile?: string
}

export type SecretDefinitionsMeta = Record<string, SecretDefinitionMeta>

export type SecretDefinitions = SecretDefinitionMeta[]

export const wireSecret = <T>(_config: CoreSecret<T>): void => {}
