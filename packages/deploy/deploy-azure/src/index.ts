/**
 * @pikku/deploy-azure — Azure Functions adapter for Pikku.
 *
 * Generates Azure Functions v4 entry points with code-based trigger
 * registration, host.json, and local.settings.json.
 */

import { AzureProviderAdapter } from './adapter.js'
export { AzureProviderAdapter }
export const createAdapter = () => new AzureProviderAdapter()
export { generateInfraManifest } from './infra-manifest.js'
export { generateHostJson, generateLocalSettings } from './host-json.js'
export type {
  AzureInfraManifest,
  AzureUnitManifest,
  AzureQueueResource,
  AzureBlobResource,
  AzureTimerResource,
  AzureWebPubSubResource,
} from './types.js'
