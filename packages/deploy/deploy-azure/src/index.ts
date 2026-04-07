/**
 * @pikku/deploy-azure — Azure Functions adapter for Pikku.
 *
 * Generates Azure Functions v4 entry points with code-based trigger
 * registration, host.json, and local.settings.json.
 */

export { AzureProviderAdapter } from './adapter.js'
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
