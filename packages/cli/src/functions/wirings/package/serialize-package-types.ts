export const serializeSecretDefinitionTypes = () => {
  return `export { wireSecret } from '@pikku/core/secret'
export type { CoreSecret, SecretDefinitionMeta, SecretDefinitionsMeta } from '@pikku/core/secret'
`
}

export const serializeVariableDefinitionTypes = () => {
  return `export { wireVariable } from '@pikku/core/variable'
export type { CoreVariable, VariableDefinitionMeta, VariableDefinitionsMeta } from '@pikku/core/variable'
`
}
