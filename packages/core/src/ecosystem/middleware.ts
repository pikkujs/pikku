export { addGlobalMiddleware, runMiddleware } from '../middleware-runner.js'
export { authAPIKey } from '../middleware/auth-apikey.js'
export { authCookie } from '../middleware/auth-cookie.js'
export { cors } from '../middleware/cors.js'
export { pikkuRemoteAuthMiddleware } from '../middleware/remote-auth.js'
export { telemetryInner, telemetryOuter } from '../middleware/telemetry.js'
export { addGlobalPermission } from '../permissions.js'
export { pikkuMiddleware } from '../types/core.types.js'
export type { MiddlewarePriority } from '../types/core.types.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type {
  CorePermissionGroup,
  CorePikkuPermission,
} from '../function/functions.types.js'
export type { LogLevel } from '../services/logger.js'
export type { WebhookServiceConfig } from '../services/webhook-service.js'
export type { RelativeTimeInput } from '../time-utils.js'
export type {
  CorePikkuMiddleware,
  CorePikkuMiddlewareConfig,
  CorePikkuMiddlewareFactory,
  CoreSingletonServices,
  CoreUserSession,
  PostgresConfig,
} from '../types/core.types.js'
export type { WorkflowServiceConfig } from '../wirings/workflow/workflow.types.js'
