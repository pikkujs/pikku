type EmailTemplateAssets = {
  html: string
  subject: string
  text: string
  variables: string[]
  hashes: Record<
    string,
    {
      contentHash: string
      htmlHash: string
      subjectHash: string
      textHash: string
    }
  >
}

type SerializeEmailsInput = {
  theme: Record<string, unknown>
  locales: Record<string, Record<string, unknown>>
  partials: Record<string, string>
  templates: Record<string, EmailTemplateAssets>
}

export const serializeEmailsModule = ({
  theme,
  locales,
  partials,
  templates,
}: SerializeEmailsInput) => {
  const serializedTheme = JSON.stringify(theme, null, 2)
  const serializedLocales = JSON.stringify(locales, null, 2)
  const serializedPartials = JSON.stringify(partials, null, 2)
  const serializedTemplates = JSON.stringify(templates, null, 2)

  return `type EmailPrimitive = string | number | boolean | null | undefined
type EmailTemplateValue = EmailPrimitive | Record<string, unknown> | Array<unknown>

const EMAIL_THEME = ${serializedTheme} as const
const EMAIL_LOCALES = ${serializedLocales} as const
const EMAIL_PARTIALS = ${serializedPartials} as const
const EMAIL_TEMPLATES = ${serializedTemplates} as const

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES
export type EmailLocale = keyof typeof EMAIL_LOCALES

type TemplateVariableMap = {
${Object.entries(templates)
  .map(([name, template]) => {
    const variables =
      template.variables.length === 0
        ? 'Record<string, never>'
        : `{
${template.variables
  .map((variable) => `    ${JSON.stringify(variable)}?: EmailTemplateValue`)
  .join('\n')}
  }`
    return `  ${JSON.stringify(name)}: ${variables}`
  })
  .join('\n')}
}

export type EmailTemplateVariables<TName extends EmailTemplateName> =
  TemplateVariableMap[TName]

export type RenderEmailInput<TName extends EmailTemplateName> = {
  name: TName
  locale?: EmailLocale
  data: EmailTemplateVariables<TName>
}

export type RenderedEmail<TName extends EmailTemplateName> = {
  name: TName
  locale: EmailLocale
  subject: string
  html: string
  text?: string
  variables: ReadonlyArray<string>
  hash: (typeof EMAIL_TEMPLATES)[TName]['hashes'][EmailLocale]['contentHash']
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
  return source.replace(/\\{\\{\\s*([^}]+?)\\s*\\}\\}/g, (_match, rawKey) => {
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

function renderPartial(name: string, context: Record<string, unknown>): string {
  const partial = EMAIL_PARTIALS[name as keyof typeof EMAIL_PARTIALS]
  return partial ? renderTemplate(partial, context) : ''
}

export const EMAILS = EMAIL_TEMPLATES

export function renderEmailTemplate<TName extends EmailTemplateName>(
  input: RenderEmailInput<TName>
): RenderedEmail<TName> {
  const locale = (input.locale ?? 'en') as EmailLocale
  const template = EMAIL_TEMPLATES[input.name]
  if (!template) {
    throw new Error(\`Unknown email template: \${String(input.name)}\`)
  }

  const strings = EMAIL_LOCALES[locale]
  if (!strings) {
    throw new Error(\`Unknown email locale: \${String(locale)}\`)
  }

  const data = (input.data ?? {}) as Record<string, unknown>
  const appName =
    (typeof data.appName === 'string' && data.appName) ||
    getNestedValue(EMAIL_THEME as Record<string, unknown>, 'appName')

  const baseContext = {
    ...data,
    locale,
    theme: EMAIL_THEME,
    t: strings,
    appName,
  }

  const subject = renderTemplate(template.subject, baseContext).trim()
  const htmlWithPartials = template.html.replace(
    /\\{\\{\\s*>\\s*([a-zA-Z0-9-_/.]+)\\s*\\}\\}/g,
    (_match, partialName) => \`@@PARTIAL:\${String(partialName).trim()}@@\`
  )

  let htmlBody = renderTemplate(htmlWithPartials, {
    ...baseContext,
    subject,
  })

  const partialMatches = [...htmlBody.matchAll(/@@PARTIAL:([^@]+)@@/g)]
  for (const match of partialMatches) {
    const rendered = renderPartial(match[1], {
      ...baseContext,
      subject,
    })
    htmlBody = htmlBody.replace(match[0], rendered)
  }

  const html = EMAIL_PARTIALS.layout
    ? renderTemplate(EMAIL_PARTIALS.layout, {
        ...baseContext,
        subject,
        content: htmlBody,
      })
    : htmlBody

  const text = template.text
    ? renderTemplate(template.text, {
        ...baseContext,
        subject,
      }).trim()
    : undefined

  return {
    name: input.name,
    locale,
    subject,
    html,
    ...(text ? { text } : {}),
    variables: template.variables,
    hash: template.hashes[locale]?.contentHash ?? '',
  } as RenderedEmail<TName>
}
`
}

