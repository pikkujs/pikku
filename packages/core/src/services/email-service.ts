export interface EmailTemplateReference {
  name: string
  locale?: string
  data?: Record<string, unknown>
}

export interface BaseSendEmailInput {
  to: string | string[]
  from?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string | string[]
  headers?: Record<string, string>
  subject?: string
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
  | SendTextEmailInput
  | SendHTMLEmailInput
  | SendTemplateEmailInput

export interface SendEmailResult {
  messageId?: string
}

export interface EmailService {
  send(input: SendEmailInput): Promise<SendEmailResult>
}
