import type { Safe } from '../classification/secret-value.js'

export interface EmailTemplateReference {
  name: string
  locale?: string
  data?: Record<string, unknown>
}

/**
 * A file attached to an email, or embedded inline and referenced from the HTML
 * by `contentId`.
 */
export interface EmailAttachment {
  filename: string
  /**
   * Raw bytes, or the content already base64-encoded. A `string` is always
   * read as base64 — never as a plain-text body — so text attachments must be
   * encoded by the caller.
   */
  content: Uint8Array | string
  contentType?: string
  contentId?: string
  disposition?: 'attachment' | 'inline'
}

export interface BaseSendEmailInput {
  to: string | string[]
  from?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string | string[]
  headers?: Record<string, string>
  subject?: string
  attachments?: EmailAttachment[]
}

/** A plain-text email. */
export interface SendTextEmailInput extends BaseSendEmailInput {
  text: string
  html?: never
  template?: never
}

/** An HTML email, with an optional plain-text alternative. */
export interface SendHTMLEmailInput extends BaseSendEmailInput {
  html: string
  text?: string
  template?: never
}

/**
 * An email rendered from a named template compiled by `pikku emails`; the
 * subject comes from the template unless set here.
 */
export interface SendTemplateEmailInput extends BaseSendEmailInput {
  template: EmailTemplateReference
  html?: never
  text?: never
}

/** Exactly one of a text body, an HTML body or a template. */
export type SendEmailInput =
  SendTextEmailInput | SendHTMLEmailInput | SendTemplateEmailInput

/** The provider's id for the sent message, when it returns one. */
export interface SendEmailResult {
  messageId?: string
}

/**
 * Sends email through a provider (Resend, SES, SMTP, or {@link
 * LocalEmailService} in development), provided as the `emailService` singleton
 * service.
 *
 * The input is `Safe<>`-guarded: a `SecretValue` anywhere in it fails to
 * compile, so a vault secret cannot be mailed by accident.
 */
export interface EmailService {
  send<T extends SendEmailInput>(input: Safe<T>): Promise<SendEmailResult>
}
