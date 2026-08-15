export const serializeSecretDefinitionTypes = () => {
  return `export { defineSecret } from '@pikku/core/secret'
`
}

export const serializeScopeDefinitionTypes = () => {
  return `export { defineScope } from '@pikku/core/ecosystem/scope'
export { defineSystemRole } from '@pikku/core/ecosystem/role'
`
}

export const serializeVariableDefinitionTypes = () => {
  return `export { defineVariable } from '@pikku/core/ecosystem/variable'
export type { CoreVariable, VariableDefinitionMeta, VariableDefinitionsMeta } from '@pikku/core/ecosystem/variable'
`
}

export const serializeCredentialDefinitionTypes = () => {
  return `export { defineCredential } from '@pikku/core/ecosystem/credential'
export type { CoreCredential, CredentialDefinitionMeta, CredentialDefinitionsMeta } from '@pikku/core/ecosystem/credential'
`
}
