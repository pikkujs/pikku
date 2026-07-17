import type {
  CommonWireMeta,
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
  CoreSingletonServices,
} from '../../types/core.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePermissionGroup,
  CorePikkuPermission,
} from '../../function/functions.types.js'
import type { PikkuHTTPRequest } from '../http/http.types.js'

/**
 * Attachment in gateway messages (images, files, etc.)
 */
export interface GatewayAttachment {
  type: string
  url?: string
  data?: ArrayBuffer | Uint8Array
  mimeType?: string
  filename?: string
}

/**
 * Normalized inbound message from any platform
 */
export interface GatewayInboundMessage {
  /** Platform-specific sender identifier (phone number, Slack user ID, etc.) */
  senderId: string
  /** Message text content */
  text: string
  /** Original platform-specific payload */
  raw: unknown
  /** Optional file/media attachments */
  attachments?: GatewayAttachment[]
  /** Optional platform-specific metadata */
  metadata?: Record<string, unknown>
}

/**
 * Outbound message to send back via the platform
 */
export interface GatewayOutboundMessage {
  /** Plain text response */
  text?: string
  /** Platform-specific rich content (Slack blocks, WhatsApp templates, etc.) */
  richContent?: Record<string, unknown>
  /** Optional file/media attachments */
  attachments?: GatewayAttachment[]
}

/**
 * Result of webhook verification (e.g., WhatsApp GET challenge, Slack url_verification)
 */
export type WebhookVerificationResult =
  | { verified: true; response: unknown }
  | { verified: false }

/**
 * Gateway adapter interface — implemented by platform-specific addon packages.
 *
 * Two responsibilities:
 * 1. Parse incoming platform-specific format into normalized GatewayInboundMessage
 * 2. Send outgoing GatewayOutboundMessage via the platform's API
 */
export interface GatewayAdapter {
  /** Platform name (e.g., 'whatsapp', 'slack', 'telegram') */
  name: string
  /** Parse platform-specific payload into normalized message. Return null to ignore (e.g., delivery receipts). */
  parse(data: unknown): GatewayInboundMessage | null
  /** Send a message to a specific sender via the platform's API */
  send(senderId: string, message: GatewayOutboundMessage): Promise<void>
  /** Initialize the adapter (connect to platform, start listening).
   *  Called by GatewayService.start() — the adapter should call onMessage for each incoming event. */
  init(onMessage: (data: unknown) => Promise<void>): Promise<void>
  /** Tear down the adapter (disconnect, release resources). */
  close(): Promise<void>
  /** Handle webhook verification challenges (only for webhook type).
   *  Receives the data (body or query params) and the Pikku HTTP request for additional inspection. */
  verifyWebhook?(
    data: unknown,
    request?: PikkuHTTPRequest
  ): WebhookVerificationResult | Promise<WebhookVerificationResult>
}

/**
 * Factory that builds a GatewayAdapter from singleton services.
 *
 * Real platform adapters (WhatsApp Cloud API, Slack, …) need secrets or
 * services that only exist after boot, while `wireGateway` runs at module
 * load. Pass a factory instead of an instance and it is resolved lazily on
 * the first inbound request (webhook/websocket) or on gateway start
 * (listener), then cached for the lifetime of the gateway.
 */
export type GatewayAdapterFactory = (
  services: CoreSingletonServices
) => GatewayAdapter | Promise<GatewayAdapter>

/**
 * The gateway wire object available on wire.gateway inside handler functions and middleware
 */
export interface PikkuGateway {
  /** Name of this gateway instance */
  gatewayName: string
  /** Platform-specific sender identifier */
  senderId: string
  /** Platform name from adapter.name */
  platform: string
  /** Send a proactive message to the sender */
  send(msg: GatewayOutboundMessage): Promise<void>
}

/**
 * Gateway transport type:
 * - 'webhook': Platform POSTs to us (WhatsApp Cloud API, Slack Events API, Telegram webhooks)
 * - 'websocket': Client connects via WebSocket (WebChat, browser widget)
 * - 'listener': Standalone event loop, no route (Baileys, Signal CLI, Matrix sync)
 */
export type GatewayTransportType = 'webhook' | 'websocket' | 'listener'

/**
 * Core gateway configuration for wireGateway()
 */
export type CoreGateway<
  PikkuFunctionConfig = CorePikkuFunctionConfig<any, any>,
  PikkuPermission extends CorePikkuPermission = CorePikkuPermission,
  PikkuMiddleware extends CorePikkuMiddleware = CorePikkuMiddleware,
> = Partial<
  Pick<CommonWireMeta, 'title' | 'summary' | 'description' | 'errors'>
> & {
  /** Unique name for this gateway */
  name: string
  /** Transport type */
  type: GatewayTransportType
  /** HTTP route for webhook/websocket types */
  route?: string
  platform?: string
  /** The gateway adapter (parse inbound, send outbound), or a factory
   *  resolved lazily from singleton services (for adapters needing secrets) */
  adapter: GatewayAdapter | GatewayAdapterFactory
  /** The handler function that processes parsed messages */
  func: PikkuFunctionConfig
  /** Optional middleware chain (e.g., auth) */
  middleware?: CorePikkuMiddlewareGroup<any, any>
  /** Optional permissions */
  permissions?: CorePermissionGroup | PikkuPermission[]
  /** Optional tags for categorization */
  tags?: string[]
  /** Whether authentication is required (default: true) */
  auth?: boolean
}

/**
 * Metadata for a registered gateway, stored in state
 */
export type GatewayMeta = CommonWireMeta & {
  name: string
  type: GatewayTransportType
  route?: string
  platform?: string
  auth?: boolean
  gateway: true
}

/**
 * All gateway metadata keyed by name
 */
export type GatewaysMeta = Record<string, GatewayMeta>
