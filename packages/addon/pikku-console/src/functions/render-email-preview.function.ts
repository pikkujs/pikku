import { pikkuSessionlessFunc } from '#pikku'
import { NotFoundError } from '@pikku/core'
import type { EmailTemplateMeta } from '@pikku/core/services'

type EmailPrimitive = string | number | boolean | null | undefined
type EmailTemplateValue = EmailPrimitive | Record<string, unknown> | Array<unknown>

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

function getNestedValue(source: Record<string, unknown>, path: string): string {
  const segments = path.split('.')
  let current: unknown = source
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return ''
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' || typeof current === 'number'
    ? String(current)
    : ''
}

function applyTemplate(source: string, context: Record<string, unknown>): string {
  return source.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey).trim()
    if (key === 'content') {
      return typeof context.content === 'string' ? context.content : ''
    }
    if (key.startsWith('>')) {
      return ''
    }
    return getNestedValue(context, key)
  })
}

function renderTemplate(source: string, context: Record<string, unknown>): string {
  let rendered = source
  for (let i = 0; i < 5; i += 1) {
    const next = applyTemplate(rendered, context)
    if (next === rendered) break
    rendered = next
  }
  return rendered
}

function renderPartial(
  name: string,
  partials: Record<string, string>,
  context: Record<string, unknown>
): string {
  const partial = partials[name]
  return partial ? renderTemplate(partial, context) : ''
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
