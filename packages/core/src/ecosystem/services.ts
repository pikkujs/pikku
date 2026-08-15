export type {
  AuditDurability,
  AuditEvent,
  AuditEventBatch,
} from '../services/audit-service.js'
export type {
  DeploymentConfig,
  DeploymentService,
  DeploymentServiceConfig,
} from '../services/deployment-service.js'
export { InMemoryAgentRunStateService } from '../services/in-memory-agent-run-state-service.js'
export type { JWTService } from '../services/jwt-service.js'
export { LocalSecretService } from '../services/local-secrets.js'
export { LocalVariablesService } from '../services/local-variables.js'
export { LogLevel } from '../services/logger.js'
export type {
  AgentMeta,
  AgentsMeta,
  EmailTemplateMeta,
  EmailsMeta,
  GroupMeta,
  MCPMeta,
  MetaService,
  MiddlewareDefinitionMeta,
  MiddlewareGroupsMeta,
  MiddlewareInstanceMeta,
  PermissionDefinitionMeta,
  PermissionsGroupsMeta,
  RPCMetaRecord,
  ServiceMeta,
  ServicesMetaRecord,
} from '../services/meta-service.js'
export type {
  ResolvedPersona,
  ScenarioPersonas,
} from '../services/personas-service.js'
export { pikkuWebhookWorkerFunc } from '../services/queue-webhook-service.js'
export type {
  ScheduledTaskInfo,
  ScheduledTaskSummary,
} from '../services/scheduler-service.js'
export type { Role } from '../services/scope-service.js'
export type { SecretService } from '../services/secret-service.js'
export { getStubTracker, spy } from '../services/stub-tracker.js'
export type { CredentialMetaInfo } from '../services/typed-credential-service.js'
export type { CredentialMeta } from '../services/typed-secret-service.js'
export { TypedVariablesService } from '../services/typed-variables-service.js'
export type { VariableMeta } from '../services/typed-variables-service.js'
export {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../services/user-session-service.js'
export type {
  CoverageFunctionMeta,
  CoverageService,
  FunctionCoverageEntry,
  FunctionCoverageReport,
  ScriptCoverage,
} from '../services/v8-coverage-service.js'
export { PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME } from '../services/webhook-service.js'
export type {
  SendWebhookInput,
  SendWebhookResult,
  WebhookAttemptResult,
  WebhookDeliveryRecord,
  WebhookDeliveryWithAttempts,
} from '../services/webhook-service.js'
export type {
  FunctionMeta,
  FunctionsMeta,
  MiddlewareMetadata as MiddlewareMeta,
  PermissionMetadata as PermissionMeta,
} from '../types/core.types.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { Logger } from '../services/logger.js'
export type { StubTracker } from '../services/stub-tracker.js'
export type { SessionService } from '../services/user-session-service.js'
export type {
  WebhookJobData,
  WebhookService,
} from '../services/webhook-service.js'
export type { CoreUserSession } from '../types/core.types.js'
