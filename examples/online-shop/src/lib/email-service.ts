import {
  LocalEmailService,
  type EmailService,
  type SendEmailInput,
  type SendEmailResult,
} from '@pikku/core/services'
import {
  renderEmailTemplate,
  type EmailTemplateName,
} from '../../.pikku/email/pikku-emails.gen.js'

type GeneratedTemplateEmailServiceOptions = {
  delegate?: EmailService
  defaultLocale?: string
}

export class GeneratedTemplateEmailService implements EmailService {
  private readonly delegate: EmailService
  private readonly defaultLocale: string

  constructor(options: GeneratedTemplateEmailServiceOptions = {}) {
    this.delegate = options.delegate ?? new LocalEmailService()
    this.defaultLocale = options.defaultLocale ?? 'en'
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!('template' in input) || !input.template) {
      return this.delegate.send(input)
    }

    const rendered = renderEmailTemplate({
      name: input.template.name as EmailTemplateName,
      locale: (input.template.locale ?? this.defaultLocale) as Parameters<
        typeof renderEmailTemplate
      >[0]['locale'],
      data: input.template.data ?? {},
    })

    return this.delegate.send({
      to: input.to,
      from: input.from,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      headers: {
        ...(input.headers ?? {}),
        'x-pikku-email-template': String(input.template.name),
        'x-pikku-email-hash': rendered.hash,
      },
      subject: rendered.subject,
      html: rendered.html,
      ...(rendered.text ? { text: rendered.text } : {}),
    })
  }
}
