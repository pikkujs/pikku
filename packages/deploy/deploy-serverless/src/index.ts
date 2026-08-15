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

// Types
export type { ServerlessInfraManifest } from './types.js'
