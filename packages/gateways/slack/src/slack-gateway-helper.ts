import type {
  GatewayInboundMessage,
  GatewayOutboundMessage,
} from '@pikku/core/gateway'
import type { SlackGatewayAdapter } from './slack-gateway-adapter.js'

/**
 * Metadata stored on parsed Slack messages.
 */
export interface SlackMessageMetadata {
  teamId: string
  channelId: string
  threadTs: string
  messageTs: string
  eventType: string
}

/**
 * Helper for working with Slack gateway messages inside handler functions.
 *
 * Usage in a gateway handler:
 * ```ts
 * const handler = {
 *   func: async (services, data, wire) => {
 *     const slack = new SlackGatewayHelper(data, adapter)
 *     await slack.sendText('Thinking...')
 *     return slack.reply('Here is the answer!')
 *   }
 * }
 * ```
 */
export class SlackGatewayHelper {
  readonly metadata: SlackMessageMetadata
  private sendFn: (message: GatewayOutboundMessage) => Promise<void>

  constructor(message: GatewayInboundMessage, adapter: SlackGatewayAdapter) {
    this.metadata = message.metadata as unknown as SlackMessageMetadata
    this.sendFn = adapter.createBoundSend(
      this.metadata.teamId,
      this.metadata.channelId,
      this.metadata.threadTs
    )
  }

  /**
   * Send a message to the same channel and thread.
   */
  async send(message: GatewayOutboundMessage): Promise<void> {
    await this.sendFn(message)
  }

  /**
   * Send a text reply. Convenience wrapper around send().
   */
  async sendText(text: string): Promise<void> {
    await this.send({ text })
  }

  /**
   * Create a GatewayOutboundMessage with text.
   * Use as a return value from the handler func for auto-send.
   */
  reply(text: string): GatewayOutboundMessage {
    return { text }
  }

  /**
   * Create a GatewayOutboundMessage with Slack Blocks.
   */
  replyBlocks(blocks: unknown[]): GatewayOutboundMessage {
    return { richContent: { blocks } }
  }

  /** The Slack channel ID */
  get channelId(): string {
    return this.metadata.channelId
  }

  /** The thread timestamp (for replying in-thread) */
  get threadTs(): string {
    return this.metadata.threadTs
  }

  /** The Slack team/workspace ID */
  get teamId(): string {
    return this.metadata.teamId
  }
}
