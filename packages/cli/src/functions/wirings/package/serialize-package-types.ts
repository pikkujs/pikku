/**
 * Generates type definitions for credentials with wireCredential
 */
export const serializeCredentialTypes = () => {
  return `/**
 * Credential type definitions for wireCredential
 */

export { wireCredential } from '@pikku/core/credential'
export type { CoreCredential, CredentialMeta, CredentialsMeta } from '@pikku/core/credential'
`
}
