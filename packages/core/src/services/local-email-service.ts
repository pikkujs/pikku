import type {
  EmailService,
  SendEmailInput,
  SendEmailResult,
} from './email-service.js'

export class LocalEmailService implements EmailService {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const payload: Record<string, unknown> = {
      type: 'email',
      message: 'this email was sent',
      to: input.to,
      from: input.from ?? null,
      cc: input.cc ?? null,
      bcc: input.bcc ?? null,
      replyTo: input.replyTo ?? null,
      subject: input.subject ?? null,
    }

    if ('template' in input && input.template) {
      payload.template = input.template
    }
    if ('html' in input && typeof input.html === 'string') {
      payload.htmlLength = input.html.length
      payload.textLength = input.text?.length ?? null
    }
    if ('text' in input && typeof input.text === 'string') {
      payload.textLength = input.text.length
    }
    if (input.attachments?.length) {
      payload.attachments = input.attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType ?? null,
        contentId: attachment.contentId ?? null,
        disposition: attachment.disposition ?? 'attachment',
        contentLength: attachment.content.length,
      }))
    }

    console.info(JSON.stringify(payload))
    return {}
  }
}
