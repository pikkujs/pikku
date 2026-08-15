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
  return `export { defineVariable } from '@pikku/core/variable'
`
}
