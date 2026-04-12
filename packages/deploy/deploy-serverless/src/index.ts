/**
 * @pikku/deploy-serverless — Serverless Framework adapter for Pikku.
 *
 * Generates serverless.yml and Lambda entry points for deploying
 * Pikku projects to AWS via the Serverless Framework.
 */

// Provider adapter
import { ServerlessProviderAdapter } from './adapter.js'
export { ServerlessProviderAdapter }
export const createAdapter = () => new ServerlessProviderAdapter()

// serverless.yml generator
export { generateServerlessYml } from './serverless-yml.js'

// Infrastructure manifest
export { generateInfraManifest } from './infra-manifest.js'

// Types
export type {
  ServerlessInfraManifest,
  ServerlessUnitManifest,
  SQSQueueResource,
  S3BucketResource,
  EventBridgeRuleResource,
  WebSocketApiResource,
} from './types.js'
