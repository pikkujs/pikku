import type { OAuth2CredentialConfig } from '../secret/secret.types.js'

export type CoreCredential<T = unknown> = {
  /** How the credential is asked for in code. Generated into `CredentialsMap`, so it is what `credentials.get` autocompletes. */
  name: string
  /** The name shown to whoever has to supply the value, who is often not the person who wrote this. */
  displayName: string
  /** What the credential is for and where to obtain one. */
  description?: string
  /** `singleton` is one value for the whole deployment; `wire` is one per user, supplied by them and stored against their account. */
  type: 'singleton' | 'wire'
  /** The shape of the value, validated when it is supplied rather than when it is first used. */
  schema: T
  /** Where to go to create one, shown next to the field asking for it. */
  docsUrl?: string
  /** Makes this an OAuth connection rather than a value pasted in: the user is sent to the provider and the tokens are stored for them. */
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
  docsUrl?: string
  oauth2?: OAuth2CredentialConfig & {
    appCredentialSecretId: string
  }
  sourceFile?: string
}

export type CredentialDefinitionsMeta = Record<string, CredentialDefinitionMeta>

export type CredentialDefinitions = CredentialDefinitionMeta[]
