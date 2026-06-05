import { pikkuSessionlessFunc } from '#pikku'
import { NotFoundError } from '@pikku/core'
import type { EmailTemplateMeta } from '@pikku/core/services'
import {
  getNestedValue,
  renderTemplate,
  renderPartial,
} from './render-email-template.utils.js'

type EmailPrimitive = string | number | boolean | null | undefined
type EmailTemplateValue =
  | EmailPrimitive
  | Record<string, unknown>
  | Array<unknown>

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
  variables: string[]
  hash: string
  missing: string[]
}

export const renderEmailPreview = pikkuSessionlessFunc<
  RenderEmailPreviewInput,
  RenderEmailPreviewOutput
>({
  title: 'Render Email Preview',
  description:
    'Renders an email template preview from emailTemplatesDir using a locale and variable payload.',
  expose: true,
  auth: false,
  func: async ({ metaService }, input) => {
    const emailsMeta = await metaService.getEmailMeta()
    const templateMeta = emailsMeta.templates[input.templateName] as
      | EmailTemplateMeta
      | undefined

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

    const subject = renderTemplate(assets.subject, baseContext).trim()
    const htmlWithPartials = assets.html.replace(
      /\{\{\s*>\s*([a-zA-Z0-9-_/.]+)\s*\}\}/g,
      (_match, partialName) => `@@PARTIAL:${String(partialName).trim()}@@`
    )

    let htmlBody = renderTemplate(htmlWithPartials, {
      ...baseContext,
      subject,
    })

    const partialMatches = [...htmlBody.matchAll(/@@PARTIAL:([^@]+)@@/g)]
    for (const match of partialMatches) {
      if (!match[1]) continue
      const rendered = renderPartial(match[1], assets.partials, {
        ...baseContext,
        subject,
      })
      htmlBody = htmlBody.replace(match[0], rendered)
    }

    const html = assets.layout
      ? renderTemplate(assets.layout, {
          ...baseContext,
          subject,
          content: htmlBody,
        })
      : htmlBody

    const text = assets.text
      ? renderTemplate(assets.text, {
          ...baseContext,
          subject,
        }).trim()
      : undefined

    return {
      name: input.templateName,
      locale,
      subject,
      html,
      ...(text ? { text } : {}),
      variables: templateMeta.variables,
      hash: templateMeta.locales[locale]?.contentHash ?? '',
      missing: assets.missing,
    }
  },
})
