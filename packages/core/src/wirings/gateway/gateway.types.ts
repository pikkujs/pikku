import type {
  CommonWireMeta,
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
  CoreSingletonServices,
} from '../../types/core.types.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type { PikkuHTTPRequest } from '../http/http.types.js'

export interface GatewayAttachment {
  type: string
  url?: string
  data?: ArrayBuffer | Uint8Array
  mimeType?: string
  filename?: string
}

export interface GatewayInboundMessage {
  /** Platform-specific: a phone number, a Slack user id, and so on. */
  senderId: string
  text: string
  raw: unknown
  attachments?: GatewayAttachment[]
  metadata?: Record<string, unknown>
}

export interface GatewayOutboundMessage {
  text?: string
  richContent?: Record<string, unknown>
  attachments?: GatewayAttachment[]
}

export type WebhookVerificationResult =
  | { verified: true; response: unknown }
  | { verified: false }

export interface GatewayAdapter {
  name: string
  /** Return null to ignore the event, e.g. a delivery receipt. */
  parse(data: unknown): GatewayInboundMessage | null
  send(senderId: string, message: GatewayOutboundMessage): Promise<void>
  /** Called by GatewayService.start(); must call onMessage per incoming event. */
  init(onMessage: (data: unknown) => Promise<void>): Promise<void>
  close(): Promise<void>
  /** Receives the GET query params, or the POST body when called from the POST handler. */
  verifyWebhook?(
    data: unknown,
    request?: PikkuHTTPRequest
  ): WebhookVerificationResult | Promise<WebhookVerificationResult>
}

export type GatewayAdapterFactory = (
  services: CoreSingletonServices
) => GatewayAdapter | Promise<GatewayAdapter>

export interface PikkuGateway {
  gatewayName: string
  senderId: string
  platform: string
  send(msg: GatewayOutboundMessage): Promise<void>
}

/** 'webhook' the platform POSTs to us, 'websocket' the client connects to us, 'listener' no route at all. */
export type GatewayTransportType = 'webhook' | 'websocket' | 'listener'

export type CoreGateway<
  PikkuFunctionConfig = CorePikkuFunctionConfig<any, any>,
  PikkuMiddleware extends CorePikkuMiddleware = CorePikkuMiddleware,
> = Partial<
  Pick<CommonWireMeta, 'title' | 'summary' | 'description' | 'errors'>
> & {
  name: string
  type: GatewayTransportType
  /** Required for 'webhook' and 'websocket'; unused for 'listener'. */
  route?: string
  platform?: string
  adapter: GatewayAdapter | GatewayAdapterFactory
  func: PikkuFunctionConfig
  middleware?: CorePikkuMiddlewareGroup<any, any>
  tags?: string[]
  /** Unset lets the handler's own `auth` govern; gateway handlers are sessionless by default. */
  auth?: boolean
}

export type GatewayMeta = CommonWireMeta & {
  name: string
  type: GatewayTransportType
  route?: string
  platform?: string
  auth?: boolean
  gateway: true
}

export type GatewaysMeta = Record<string, GatewayMeta>
