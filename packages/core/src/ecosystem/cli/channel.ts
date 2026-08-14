export { handleRawCLI } from '../../wirings/cli/channel/cli-raw-channel-runner.js'
export type { RawCLIFrame } from '../../wirings/cli/channel/cli-raw-channel-runner.js'
export { executeRawCLIViaChannel } from '../../wirings/cli/channel/cli-raw-client-runner.js'
export type { CorePikkuCLIClientRender } from '../../wirings/cli/channel/cli-raw-client-runner.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { LogLevel } from '../../services/logger.js'
export type { WebhookServiceConfig } from '../../services/webhook-service.js'
export type {
  CoreSingletonServices,
  CoreUserSession,
  CreateWireServices,
  PostgresConfig,
} from '../../types/core.types.js'
export type {
  ApprovalRequester,
  Capabilities,
} from '../../wirings/channel/channel-rpc.types.js'
export type { PikkuChannel } from '../../wirings/channel/channel.types.js'
export type { RawCLIResult } from '../../wirings/cli/channel/cli-raw-channel-runner.js'
export type { WorkflowServiceConfig } from '../../wirings/workflow/workflow.types.js'
