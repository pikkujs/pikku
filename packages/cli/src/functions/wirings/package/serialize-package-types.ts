export const serializeSecretDefinitionTypes = () => {
  return `export { defineSecret } from '@pikku/core/secret'
export type { CoreSecret, SecretDefinitionMeta, SecretDefinitionsMeta } from '@pikku/core/secret'
`
}

export const serializeScopeDefinitionTypes = () => {
  return `export { defineScope } from '@pikku/core/scope'
export type { CoreScopes, CoreScopeNode, FlatScope, ScopeDefinitionMeta, ScopeDefinitionsMeta } from '@pikku/core/scope'
`
}

export const serializeVariableDefinitionTypes = () => {
  return `export { defineVariable } from '@pikku/core/variable'
export type { CoreVariable, VariableDefinitionMeta, VariableDefinitionsMeta } from '@pikku/core/variable'
`
}
