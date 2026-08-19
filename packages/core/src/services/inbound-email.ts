export interface InboundEmailAddress {
  address: string
  name?: string
}

export interface InboundEmailAttachment {
  filename?: string
  contentType: string
  size: number
  contentId?: string
  inline: boolean
  /** base64 */
  content: string
}

/**
 * One received message, in the shape every inbound source produces.
 *
 * The source parses MIME and hands over a whole message. Nothing is persisted
 * on the way, so a handler that ignores an attachment costs nothing and a
 * hosted source never accumulates a corpus of tenant mail. The price is a size
 * ceiling: a source refuses a message larger than it will hold in memory, and
 * refuses it temporarily so the sender retries rather than bounces.
 *
 * Mailbox operations (mark as read, move, delete) are deliberately absent.
 * They exist on IMAP and Gmail and mean nothing to a source handed a single
 * message that never sees the mailbox it came from, so they stay in the
 * source's own package and a read-only handler runs against any of them.
 */
export interface InboundEmail {
  /** The `wireTriggerSource` that produced this, for a handler wired to more than one. */
  source: string
  messageId: string
  receivedAt: string
  mailbox?: string
  from: InboundEmailAddress
  to: InboundEmailAddress[]
  cc?: InboundEmailAddress[]
  replyTo?: InboundEmailAddress[]
  subject?: string
  sentAt?: string
  /** Carry these into the reply; a reply is always a new send, never a mutation of this message. */
  inReplyTo?: string
  references?: string[]
  headers: Record<string, string>
  text?: string
  html?: string
  attachments: InboundEmailAttachment[]
}
