import type {
  GatewayAdapter,
  GatewayInboundMessage,
  GatewayOutboundMessage,
  WebhookVerificationResult,
} from '@pikku/core/gateway'

/**
 * Mock gateway adapter for testing all three transport types.
 * Handles both object and string (JSON) data inputs.
 */
export class MockGatewayAdapter implements GatewayAdapter {
  name = 'mock'
  sentMessages: Array<{ senderId: string; message: GatewayOutboundMessage }> =
    []

  parse(data: unknown): GatewayInboundMessage | null {
    // Handle string data (e.g., from WebSocket messages)
    const d =
      typeof data === 'string' ? tryParseJSON(data) : ((data as any) ?? null)
    if (!d || !d.text) return null
    return {
      senderId: d.senderId ?? 'unknown',
      text: d.text,
      raw: data,
    }
  }

  async send(senderId: string, message: GatewayOutboundMessage): Promise<void> {
    this.sentMessages.push({ senderId, message })
  }

  verifyWebhook(data: unknown): WebhookVerificationResult {
    const d = data as Record<string, any>
    // picoquery parses `hub.mode=subscribe` into `{ hub: { mode: 'subscribe' } }`
    // Support both flat and nested formats
    const mode = d?.hub?.mode ?? d?.['hub.mode']
    const token = d?.hub?.verify_token ?? d?.['hub.verify_token']
    const challenge = d?.hub?.challenge ?? d?.['hub.challenge']
    if (mode === 'subscribe' && token === 'test-token') {
      return { verified: true, response: challenge }
    }
    return { verified: false }
  }

  async init(onMessage: (data: unknown) => Promise<void>): Promise<void> {
    // Mock: store onMessage for manual invocation in tests
    this._onMessage = onMessage
  }

  async close(): Promise<void> {
    this._onMessage = undefined
  }

  /** Simulate an incoming message (for listener tests) */
  async simulateMessage(data: unknown): Promise<void> {
    if (this._onMessage) {
      await this._onMessage(data)
    }
  }

  clear() {
    this.sentMessages = []
  }

  private _onMessage?: (data: unknown) => Promise<void>
}

function tryParseJSON(str: string): any {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}
