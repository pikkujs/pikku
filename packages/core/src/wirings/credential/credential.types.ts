import type { OAuth2CredentialConfig } from '../secret/secret.types.js'

export type CoreCredential<T = unknown> = {
  name: string
  displayName: string
  description?: string
  type: 'singleton' | 'wire'
  schema: T
  oauth2?: OAuth2CredentialConfig & {
    appCredentialSecretId: string
  }
}

export type CredentialDefinitionMeta = {
  name: string
  displayName: string
  description?: string
  type: 'singleton' | 'wire'
  schema?: Record<string, unknown> | string
  oauth2?: OAuth2CredentialConfig & {
    appCredentialSecretId: string
  }
  sourceFile?: string
}

export type CredentialDefinitionsMeta = Record<string, CredentialDefinitionMeta>

export type CredentialDefinitions = CredentialDefinitionMeta[]
