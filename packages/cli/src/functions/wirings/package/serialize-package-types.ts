export const serializeSecretDefinitionTypes = () => {
  return `export { defineSecret } from '@pikku/core/secret'
export type { SecretDefinitionsMeta } from '@pikku/core/secret'
export type { CoreSecret, SecretDefinitionMeta } from '@pikku/core/ecosystem/secret'
`
}

export const serializeScopeDefinitionTypes = () => {
  return `export { defineScope } from '@pikku/core/ecosystem/scope'
export type { CoreScopes, CoreScopeNode, FlatScope, ScopeDefinitionMeta, ScopeDefinitionsMeta } from '@pikku/core/ecosystem/scope'
export { defineSystemRole } from '@pikku/core/ecosystem/role'
export type { CoreSystemRole, CoreSystemRoles, SystemRole, SystemRoleDefinitionMeta, SystemRoleDefinitionsMeta } from '@pikku/core/ecosystem/role'
`
}

export const serializeVariableDefinitionTypes = () => {
  return `export { defineVariable } from '@pikku/core/variable'
export type { CoreVariable, VariableDefinitionMeta, VariableDefinitionsMeta } from '@pikku/core/ecosystem/variable'
`
}
