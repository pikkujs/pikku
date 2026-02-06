export const serializeSecretDefinitionTypes = () => {
  return `export { wireSecret } from '@pikku/core/secret'
export type { CoreSecret, SecretDefinitionMeta, SecretDefinitionsMeta } from '@pikku/core/secret'
`
}
