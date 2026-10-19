import type {
  GatewayAdapter,
  GatewayInboundMessage,
  GatewayOutboundMessage,
} from '@pikku/core/gateway'
import { wireGateway } from '@pikku/core/gateway'
import { handleChatMessage } from '../functions/gateway/handle-chat-message.function.js'

/**
 * Gateways are for conversational transports — Slack, WhatsApp, a web chat
 * widget. The adapter's job is to turn one platform's messages into the shape
 * every handler sees, and to send a reply back the way it came.
 *
 * That is the whole test of whether something belongs here: is there a sender,
 * and can you answer them? The payment webhook used to be wired as a gateway and
 * failed both — it now lives in `functions/orders/handle-payment-webhook` behind
 * an ordinary HTTP route, which is what a webhook is.
 */

// @snippet start gatewayAdapter
// A gateway adapter normalizes platform-specific payloads into GatewayInboundMessage.
const webChatAdapter: GatewayAdapter = {
  name: 'webchat',
  parse(data: unknown): GatewayInboundMessage | null {
    const msg = data as Record<string, unknown>
    if (!msg.text) return null
    return {
      senderId: String(msg.clientId ?? 'anon'),
      text: String(msg.text),
      raw: data,
    }
  },
  async send(_senderId: string, _message: GatewayOutboundMessage) {
    // Where a real adapter answers the visitor — over the socket for a web chat,
    // via the platform's API for Slack or WhatsApp.
  },
  async init(_onMessage: (msg: GatewayInboundMessage) => Promise<void>) {
    // Where a real adapter subscribes to the platform and calls `onMessage` for
    // each inbound message. Empty here, which is why nothing yet reaches the
    // handler: this is the seam to fill in per platform.
  },
  async close() {},
}
// @snippet end gatewayAdapter

// @snippet start gatewayWebsocket
// WebSocket transport — browser clients connect directly.
// The adapter handles upgrade handshake and binary framing.
wireGateway({
  name: 'webchat',
  type: 'websocket',
  route: '/chat',
  adapter: webChatAdapter,
  func: handleChatMessage,
  auth: false,
})
// @snippet end gatewayWebsocket
