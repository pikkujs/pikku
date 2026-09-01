import type { Safe } from '../classification/secret-value.js'

export interface EmailTemplateReference {
  name: string
  locale?: string
  data?: Record<string, unknown>
}

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

export interface SendTextEmailInput extends BaseSendEmailInput {
  text: string
  html?: never
  template?: never
}

export interface SendHTMLEmailInput extends BaseSendEmailInput {
  html: string
  text?: string
  template?: never
}

export interface SendTemplateEmailInput extends BaseSendEmailInput {
  template: EmailTemplateReference
  html?: never
  text?: never
}

export type SendEmailInput =
  SendTextEmailInput | SendHTMLEmailInput | SendTemplateEmailInput

export interface SendEmailResult {
  messageId?: string
}

export interface EmailService {
  send<T extends SendEmailInput>(input: Safe<T>): Promise<SendEmailResult>
}
