export const serializeSecretDefinitionTypes = () => {
  return `export { defineSecret } from '@pikku/core/secret'
`
}

export const serializeScopeDefinitionTypes = () => {
  return `export { defineScope } from '@pikku/core/scope'
export { defineSystemRole } from '@pikku/core/role'
export { defineFeatureFlags } from '@pikku/core/flag'
`
}

export const serializeVariableDefinitionTypes = () => {
  return `export { defineVariable } from '@pikku/core/variable'
`
}

export const serializeAnalyticsDefinitionTypes = () => {
  return `export { defineAnalyticsEvents, LoggerAnalyticsService, flattenAnalyticsEvent } from '@pikku/core/analytics'
export type {
  AnalyticsClientContext,
  AnalyticsEventBase,
  AnalyticsEventDefinitions,
  AnalyticsEventPropsSchema,
  AnalyticsIdentity,
  AnalyticsLog,
  AnalyticsRecord,
  AnalyticsService,
} from '@pikku/core/analytics'
`
}
