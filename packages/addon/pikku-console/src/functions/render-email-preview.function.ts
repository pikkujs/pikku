import { pikkuFunc } from '#pikku/addon/function'
import { NotFoundError } from '#pikku/addon/error'
import type { EmailTemplateMeta } from '@pikku/core/services'
import {
  getNestedValue,
  renderTemplate,
} from './render-email-template.utils.js'

type EmailPrimitive = string | number | boolean | null | undefined
type EmailTemplateValue =
  EmailPrimitive | Record<string, unknown> | Array<unknown>

export interface RenderEmailPreviewInput {
  templateName: string
  locale?: string
  data?: Record<string, EmailTemplateValue>
}

export interface RenderEmailPreviewOutput {
  name: string
  locale: string
  subject: string
  html: string
  text?: string
  /** Raw, un-rendered template HTML source (templates/<name>.html) — what the editor edits. */
  source: string
  variables: string[]
  hash: string
  missing: string[]
}

export const renderEmailPreview = pikkuFunc<
  RenderEmailPreviewInput,
  RenderEmailPreviewOutput
>({
  title: 'Render Email Preview',
  description:
    'Renders an email template preview from emailTemplatesDir using a locale and variable payload.',
  expose: true,
  scopes: ['pikku:console:emails:read'],
  func: async ({ metaService }, input) => {
    const emailsMeta = await metaService.getEmailMeta()
    const templateMeta = emailsMeta.templates[input.templateName] as
      EmailTemplateMeta | undefined

    if (!templateMeta) {
      throw new NotFoundError(`Unknown email template: ${input.templateName}`)
    }

    const locale = input.locale ?? Object.keys(templateMeta.locales)[0] ?? 'en'

    const assets = await metaService.getEmailTemplateAssets(
      input.templateName,
      locale
    )

    const data = (input.data ?? {}) as Record<string, unknown>
    const appName =
      (typeof data.appName === 'string' && data.appName) ||
      getNestedValue(assets.theme, 'appName')

    const baseContext = {
      ...data,
      locale,
      theme: assets.theme,
      t: assets.strings,
      appName,
    }

    const subject = renderTemplate(
      assets.subject,
      baseContext,
      assets.partials,
      false
    ).trim()

    const htmlBody = renderTemplate(
      assets.html,
      {
        ...baseContext,
        subject,
      },
      assets.partials,
      true
    )

    const html = assets.layout
      ? renderTemplate(
          assets.layout,
          {
            ...baseContext,
            subject,
            content: htmlBody,
          },
          assets.partials,
          true
        )
      : htmlBody

    const text = assets.text
      ? renderTemplate(
          assets.text,
          {
            ...baseContext,
            subject,
          },
          assets.partials,
          false
        ).trim()
      : undefined

    return {
      name: input.templateName,
      locale,
      subject,
      html,
      ...(text ? { text } : {}),
      source: assets.html,
      variables: templateMeta.variables,
      hash: templateMeta.locales[locale]?.contentHash ?? '',
      missing: assets.missing,
    }
  },
})
