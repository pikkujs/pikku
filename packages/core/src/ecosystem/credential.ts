export type { CredentialDefinitions } from '../wirings/credential/credential.types.js'
export { validateAndBuildCredentialDefinitionsMeta } from '../wirings/credential/validate-credential-definitions.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { SchemaRefLike } from '../types/core.types.js'
export type { CredentialDefinitionsMeta } from '../wirings/credential/credential.types.js'
