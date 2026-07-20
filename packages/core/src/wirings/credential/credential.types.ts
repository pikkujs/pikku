import type { OAuth2CredentialConfig } from '../secret/secret.types.js'

export type CoreCredential<T = unknown> = {
  name: string
  displayName: string
  description?: string
  type: 'singleton' | 'wire'
  schema: T
  /**
   * Link to documentation explaining how to obtain this value — a provider's
   * API-key page, a setup guide, an internal runbook. Surfaced by consoles and
   * deploy UIs so a user facing a missing value has somewhere to go instead of
   * an opaque identifier.
   */
  docsUrl?: string
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
  /**
   * Link to documentation explaining how to obtain this value — a provider's
   * API-key page, a setup guide, an internal runbook. Surfaced by consoles and
   * deploy UIs so a user facing a missing value has somewhere to go instead of
   * an opaque identifier.
   */
  docsUrl?: string
  oauth2?: OAuth2CredentialConfig & {
    appCredentialSecretId: string
  }
  sourceFile?: string
}

export type CredentialDefinitionsMeta = Record<string, CredentialDefinitionMeta>

export type CredentialDefinitions = CredentialDefinitionMeta[]
