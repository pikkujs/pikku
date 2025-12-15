/**
 * Credential types for declaring secrets required by packages or applications.
 * wireCredential is metadata-only - no runtime behavior.
 * The CLI extracts this via AST and generates JSON metadata.
 */

/**
 * Configuration for wireCredential.
 * Declares credentials/secrets required by a package or application.
 * Uses Zod for schema definition - converted to JSON Schema at build time.
 */
export type CoreCredential<T = unknown> = {
  /** Unique identifier for this credential */
  name: string
  /** Human-readable name for UI display */
  displayName: string
  /** Optional description for UI */
  description?: string
  /** Key used with SecretService.getSecret() to retrieve the credential */
  secretId: string
  /** Zod schema defining the structure of the credential */
  schema: T
}

/**
 * Metadata generated for each credential.
 * Schema is converted from Zod to JSON Schema at build time.
 */
export type CredentialMeta = {
  name: string
  displayName: string
  description?: string
  secretId: string
  /** JSON Schema (converted from Zod at build time) or zodLookup reference name */
  schema: Record<string, unknown> | string
}

/**
 * Record of all credential metadata, keyed by credential name.
 */
export type CredentialsMeta = Record<string, CredentialMeta>

/**
 * No-op function for wireCredential.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing.
 *
 * @example
 * ```typescript
 * import { z } from 'zod'
 *
 * const slackCredentials = z.object({
 *   botToken: z.string().describe('Bot OAuth token'),
 *   signingSecret: z.string().describe('Request signing secret')
 * })
 *
 * wireCredential({
 *   name: 'slack',
 *   displayName: 'Slack Credentials',
 *   secretId: 'SLACK_CREDENTIALS',
 *   schema: slackCredentials
 * })
 * ```
 */
export const wireCredential = <T>(_config: CoreCredential<T>): void => {
  // No-op - metadata only, extracted by CLI via AST
}
