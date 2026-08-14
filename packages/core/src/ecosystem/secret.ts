export type {
  CoreSecret,
  OAuth2CredentialConfig,
  SecretDefinitionMeta,
  SecretDefinitions,
} from '../wirings/secret/secret.types.js'
export { validateAndBuildSecretDefinitionsMeta } from '../wirings/secret/validate-secret-definitions.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { SchemaRefLike } from '../types/core.types.js'
export type { SecretDefinitionsMeta } from '../wirings/secret/secret.types.js'
