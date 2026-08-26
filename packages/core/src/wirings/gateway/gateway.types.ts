import type {
  CommonWireMeta,
  CoreSingletonServices,
} from '../../types/core.types.js'
import type {
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
} from '../../middleware/middleware.types.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type { PikkuHTTPRequest } from '../http/http.types.js'

export interface GatewayAttachment {
  type: string
  url?: string
  data?: ArrayBuffer | Uint8Array
  mimeType?: string
  filename?: string
}

/**
 * One message arriving from a gateway, normalised: who sent it, in which
 * conversation, and what they said.
 */
export interface GatewayInboundMessage {
  /** Platform-specific: a phone number, a Slack user id, and so on. */
  senderId: string
  /** What they said, as plain text, with the provider's markup stripped. */
  text: string
  /** The provider's own event, untouched, for anything this shape drops. */
  raw: unknown
  /** Files and media that came with the message. */
  attachments?: GatewayAttachment[]
  /** Anything else the adapter wants to carry through to the wiring. */
  metadata?: Record<string, unknown>
}

/**
 * One message to send back through a gateway — plain text, or the provider's
 * own rich content.
 */
export interface GatewayOutboundMessage {
  /** The reply as plain text. Every provider can render this. */
  text?: string
  /** The provider's own rich payload, e.g. Slack blocks. Passed through as-is. */
  richContent?: Record<string, unknown>
  /** Files and media to send alongside. */
  attachments?: GatewayAttachment[]
}

/**
 * What a gateway's `verifyWebhook` returns — verified, with the response the
 * provider expects back, or not.
 */
export type WebhookVerificationResult =
  | {
      /** True when the request really came from the provider. */
      verified: true
      /** What to echo back, e.g. Meta's hub.challenge. */
      response: unknown
    }
  | {
      /** False when the signature or challenge did not check out. */
      verified: false
    }

/**
 * What a gateway integration implements: parse an incoming event into a
 * message, send one back, and open and close the connection.
 */
export interface GatewayAdapter {
  /** Identifies the gateway in wirings and logs, e.g. `'slack'`. */
  name: string
  /** Return null to ignore the event, e.g. a delivery receipt. */
  parse(data: unknown): GatewayInboundMessage | null
  /** Deliver a reply back to the sender the message came from. */
  send(senderId: string, message: GatewayOutboundMessage): Promise<void>
  /** Called by GatewayService.start(); must call onMessage per incoming event. */
  init(onMessage: (data: unknown) => Promise<void>): Promise<void>
  /** Called by GatewayService.stop(); release the connection init() opened. */
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
  /** Unique across the project. It is how the gateway is addressed in `pikku meta` and in logs. */
  name: string
  /** How the platform reaches us: a `webhook` it posts to, a `websocket` it holds open, or a `listener` we open outward. */
  type: GatewayTransportType
  /** Required for 'webhook' and 'websocket'; unused for 'listener'. */
  route?: string
  /** Which service this speaks to — slack, whatsapp, discord. It selects the adapter's dialect, not the transport. */
  platform?: string
  /** Translates between the platform's message format and pikku's. A factory is called with services, for an adapter that needs a token or a client. */
  adapter: GatewayAdapter | GatewayAdapterFactory
  /** The function to run per inbound message. It receives the normalised message, not the platform's raw payload. */
  func: PikkuFunctionConfig
  /** Wraps every inbound message: signature verification, tracing, rate limiting. */
  middleware?: CorePikkuMiddlewareGroup<any, any>
  /** Filters this gateway in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
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
