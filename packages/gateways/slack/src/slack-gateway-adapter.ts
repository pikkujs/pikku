import type {
  GatewayAdapter,
  GatewayInboundMessage,
  GatewayOutboundMessage,
  WebhookVerificationResult,
} from '@pikku/core/gateway'
import { WebClient } from '@slack/web-api'

/**
 * Slack event payload types
 */
interface SlackUrlVerification {
  type: 'url_verification'
  challenge: string
  token: string
}

interface SlackEventCallback {
  type: 'event_callback'
  team_id: string
  event: SlackEvent
  event_id: string
  event_time: number
}

interface SlackEvent {
  type: string
  user?: string
  text?: string
  channel?: string
  ts?: string
  thread_ts?: string
  bot_id?: string
  files?: SlackFile[]
  subtype?: string
}

interface SlackFile {
  id: string
  name: string
  mimetype: string
  url_private: string
}

/**
 * Resolves a bot token for a given Slack team/workspace.
 * Implement this to look up tokens from your database.
 */
export type TokenResolver = (teamId: string) => Promise<string | null>

export interface SlackGatewayAdapterOptions {
  /**
   * Resolve a bot token for a team ID.
   * Called on every incoming event to get the right token for that workspace.
   */
  tokenResolver: TokenResolver
  /** Slack signing secret for verifying request signatures */
  signingSecret?: string
}

/**
 * Pikku GatewayAdapter implementation for Slack.
 *
 * Single adapter handles all workspaces — uses a tokenResolver
 * to look up the bot token per team_id from each event payload.
 *
 * Handles:
 * - Slack url_verification challenge (via verifyWebhook)
 * - Parsing Slack event_callback payloads into GatewayInboundMessage
 * - Sending responses via Slack Web API (chat.postMessage)
 * - Thread-aware messaging (replies in the same thread)
 * - File/attachment support
 */
export class SlackGatewayAdapter implements GatewayAdapter {
  name = 'slack'

  private clientCache = new Map<string, WebClient>()

  constructor(private options: SlackGatewayAdapterOptions) {}

  /**
   * Get or create a WebClient for a specific team's bot token.
   */
  private async getClient(teamId: string): Promise<WebClient> {
    const cached = this.clientCache.get(teamId)
    if (cached) return cached

    const token = await this.options.tokenResolver(teamId)
    if (!token) {
      throw new Error(`No bot token found for team ${teamId}`)
    }

    const client = new WebClient(token)
    this.clientCache.set(teamId, client)
    return client
  }

  /** Invalidate the cached client for a team (e.g. after token rotation) */
  invalidateClient(teamId: string): void {
    this.clientCache.delete(teamId)
  }

  /**
   * Handle Slack's url_verification challenge.
   * Slack POSTs { type: 'url_verification', challenge: '...' } and expects the challenge back.
   */
  verifyWebhook(data: unknown): WebhookVerificationResult {
    const payload = data as Record<string, unknown>
    if (payload?.type === 'url_verification') {
      return {
        verified: true,
        response: {
          challenge: (payload as unknown as SlackUrlVerification).challenge,
        },
      }
    }
    return { verified: false }
  }

  /**
   * Parse a Slack event_callback into a normalized GatewayInboundMessage.
   * Returns null for events we should ignore (bot messages, subtypes, etc.)
   */
  parse(data: unknown): GatewayInboundMessage | null {
    const payload = data as Record<string, unknown>

    // Only handle event_callback
    if (payload?.type !== 'event_callback') {
      return null
    }

    const eventPayload = payload as unknown as SlackEventCallback
    const event = eventPayload.event

    // Only handle message events (and app_mention)
    if (event.type !== 'message' && event.type !== 'app_mention') {
      return null
    }

    // Ignore bot messages to prevent loops
    if (event.bot_id || event.subtype === 'bot_message') {
      return null
    }

    // Ignore message subtypes (edits, deletes, etc.) except for thread_broadcast
    if (event.subtype && event.subtype !== 'thread_broadcast') {
      return null
    }

    if (!event.user || !event.text) {
      return null
    }

    const text = event.text

    // Parse attachments from Slack files
    const attachments = event.files?.map((file) => ({
      type: file.mimetype,
      url: file.url_private,
      mimeType: file.mimetype,
      filename: file.name,
    }))

    return {
      senderId: event.user,
      text,
      raw: data,
      attachments: attachments?.length ? attachments : undefined,
      metadata: {
        teamId: eventPayload.team_id,
        channelId: event.channel,
        threadTs: event.thread_ts || event.ts,
        messageTs: event.ts,
        eventType: event.type,
      },
    }
  }

  /**
   * Send a message back to Slack via the Web API.
   * The senderId is the Slack user ID, but we need channel/thread from metadata.
   * Use createBoundSend() in your handler for proper channel context.
   */
  async send(
    _senderId: string,
    _message: GatewayOutboundMessage
  ): Promise<void> {
    // The generic send() doesn't have channel context.
    // Handlers should use createBoundSend() or SlackGatewayHelper instead.
    // This is called by the gateway runner for auto-send, so we need
    // to handle it gracefully.
  }

  /**
   * Create a send function bound to a specific team, channel, and thread.
   * This is the preferred way to send messages — used by the gateway handler.
   */
  createBoundSend(
    teamId: string,
    channelId: string,
    threadTs?: string
  ): (message: GatewayOutboundMessage) => Promise<void> {
    return async (message: GatewayOutboundMessage) => {
      const client = await this.getClient(teamId)
      const options: Record<string, unknown> = {
        channel: channelId,
        thread_ts: threadTs,
      }

      if (message.text) {
        options.text = message.text
      }

      if (message.richContent?.blocks) {
        options.blocks = message.richContent.blocks
      }

      await client.chat.postMessage(options as any)
    }
  }

  async init(_onMessage: (data: unknown) => Promise<void>): Promise<void> {
    // No-op for webhook mode — Slack POSTs to us
  }

  async close(): Promise<void> {
    this.clientCache.clear()
  }

  /** Get a WebClient for a specific team (for advanced use) */
  async getClientForTeam(teamId: string): Promise<WebClient> {
    return this.getClient(teamId)
  }
}
