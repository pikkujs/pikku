export const serializeSecretDefinitionTypes = () => {
  return `export { defineSecret } from '@pikku/core/secret'
`
}

export const serializeCredentialDefinitionTypes = () => {
  return `export { defineCredential } from '@pikku/core/credential'
`
}

export const serializeScopeDefinitionTypes = () => {
  return `export { defineScope } from '@pikku/core/scope'
export { defineSystemRole } from '@pikku/core/role'
`
}

export const serializeVariableDefinitionTypes = () => {
  return `export { defineVariable } from '@pikku/core/variable'
`
}
