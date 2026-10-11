export { KyselyChannelStore } from './kysely-channel-store.js'
export { KyselyEventHubStore } from './kysely-eventhub-store.js'
export { KyselyWorkflowService } from './kysely-workflow-service.js'
export { KyselyWorkflowRunService } from './kysely-workflow-run-service.js'
export { KyselyWorkflowMirror } from './kysely-workflow-mirror.js'
export { KyselyDeploymentService } from './kysely-deployment-service.js'
export { KyselyAgentStorageService } from './kysely-agent-storage-service.js'
export { KyselyAgentRunService } from './kysely-agent-run-service.js'
export { KyselyAgentRunStateService } from './kysely-agent-run-state-service.js'
export { KyselySecretService } from './kysely-secret-service.js'
export { KyselyCredentialService } from './kysely-credential-service.js'
export { KyselySessionStore } from './kysely-session-store.js'
export { KyselyScopeService } from './kysely-scope-service.js'
export { KyselyFeatureFlagStore } from './kysely-feature-flag-store.js'
export type { KyselyFeatureFlagStoreOptions } from './kysely-feature-flag-store.js'
export { KyselyWebhookService } from './kysely-webhook-service.js'
export { KyselyTriggerSourceStore } from './kysely-trigger-source-store.js'
export { KyselyLeaseService } from './kysely-lease-service.js'
export { KyselyIncomingWebhookService } from './kysely-incoming-webhook-service.js'
export {
  createAuditedKysely,
  type CreateAuditedKyselyOptions,
} from './create-audited-kysely.js'
export { KyselyAuditService } from './kysely-audit-service.js'
export { KyselyAnalyticsService } from './kysely-analytics-service.js'
export { KyselyVirtualUserRunStore } from './kysely-virtual-user-run-store.js'
export { KyselyVirtualUserScheduleStore } from './kysely-virtual-user-schedule-store.js'

// Re-exported so a generated file that constructs the services above opens and
// types its database with the same copy of kysely those services were built
// against, rather than a second copy the project may resolve on its own.
export { CamelCasePlugin, Kysely, MysqlDialect, PostgresDialect } from 'kysely'

export {
  SerializePlugin,
  BaseSerializePlugin,
  type Serializer,
  type Deserializer,
} from './serialize-plugin.js'
export {
  createCoercionPlugin,
  type ColumnKind,
  type CoercionMap,
  type CreateCoercionPluginOptions,
} from './coercion-plugin.js'
export {
  createClassificationPlugin,
  type CreateClassificationPluginOptions,
} from './classification-plugin.js'
export {
  ClassificationCrypto,
  DEFAULT_KEY_ID,
  isColumnEnvelope,
  parseColumnEnvelope,
  type ClassificationCryptoOptions,
  type ColumnEnvelope,
  type KEKResolver,
  type ResolvedKEK,
} from './classification-crypto.js'
export {
  agentSchema,
  analyticsSchema,
  auditSchema,
  channelSchema,
  credentialSchema,
  deploymentSchema,
  flagSchema,
  incomingWebhookSchema,
  leaseSchema,
  scopeSchema,
  secretSchema,
  sessionSchema,
  triggerSourceSchema,
  virtualUserScheduleSchema,
  virtualUserSchema,
  webhookSchema,
  workflowSchema,
  pikkuSchemas,
  requiredPikkuSchemas,
  applyPikkuSchemas,
  compilePikkuSchemas,
  requirePikkuSchema,
  resolveRequirements,
  withUserTable,
  type PikkuSchema,
  type RequiredTypes,
  type UnmetRequirement,
  type SchemaStatementFactory,
} from './schema/index.js'

export type { KyselyPikkuDB } from './kysely-tables.js'
export type { WorkflowRunService } from '@pikku/core/workflow'
export type { AgentRunService, AgentRunRow } from '@pikku/core/agent'
export type {
  VirtualUserRunStore,
  VirtualUserRunRecord,
  VirtualUserScheduleStore,
  VirtualUserScheduleRecord,
} from '@pikku/core/virtual-user'
