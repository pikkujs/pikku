/**
 * Generates type definitions for gateway wirings
 */
export const serializeGatewayTypes = (
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string
) => {
  return `/**
 * Gateway-specific type definitions for tree-shaking optimization
 */

import { wireGateway as wireGatewayCore } from '@pikku/core/gateway'
import type { CoreGateway, GatewayAdapter, GatewayInboundMessage, GatewayOutboundMessage, GatewayTransportType, WebhookVerificationResult } from '@pikku/core/gateway'
${singletonServicesTypeImport}

${singletonServicesTypeName !== 'SingletonServices' ? `type SingletonServices = ${singletonServicesTypeName}` : ''}

export type { GatewayAdapter, GatewayInboundMessage, GatewayOutboundMessage, GatewayTransportType, WebhookVerificationResult }

/**
 * Builds a {@link GatewayAdapter} from your application's services.
 * The core factory type is handed \`CoreSingletonServices\`; this one receives
 * the services your project actually registered.
 */
export type PikkuGatewayAdapterFactory = (
  services: SingletonServices
) => GatewayAdapter | Promise<GatewayAdapter>

/**
 * Type definition for gateway wirings.
 * Declares a gateway name, its transport and its target pikku function.
 */
export type GatewayWiring = CoreGateway

/**
 * Registers a gateway with the Pikku framework.
 * Runs everywhere — inspector extracts at build time.
 *
 * @param gateway - Gateway definition with name, transport type and function
 *
 * @example
 * \`\`\`typescript
 * wireGateway({
 *   name: 'stripe',
 *   type: 'webhook',
 *   func: handleStripeEvent
 * })
 * \`\`\`
 */
export const wireGateway = (
  gateway: GatewayWiring
) => {
  wireGatewayCore(gateway as any)
}
`
}
