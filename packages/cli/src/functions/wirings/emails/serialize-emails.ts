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

type EmailTemplateVariables<TName extends EmailTemplateName> =
  TemplateVariableMap[TName]

type RenderEmailInput<TName extends EmailTemplateName> = {
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

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

// Matches the raw {{{ value }}} form before the escaped {{ value }} form, so the
// opt-in escape hatch is never mistaken for a normal substitution.
const TEMPLATE_TOKEN = /\\{\\{\\{\\s*([^{}]+?)\\s*\\}\\}\\}|\\{\\{\\s*([^}]+?)\\s*\\}\\}/g

const PARTIAL_TOKEN = /\\{\\{\\s*>\\s*([a-zA-Z0-9-_/.]+)\\s*\\}\\}/g

const MAX_TEMPLATE_DEPTH = 5

// theme.json and the locale files ship with the templates, so they are treated as
// template-author input: expanded before caller data and allowed to contain their
// own placeholders. Everything else is caller-supplied.
const TRUSTED_ROOTS = ['theme', 't']

function isTrustedKey(key: string): boolean {
  return TRUSTED_ROOTS.includes(String(key.split('.')[0]))
}

function readToken(rawTriple: unknown, rawDouble: unknown) {
  const raw = typeof rawTriple === 'string'
  return { raw, key: String(raw ? rawTriple : rawDouble).trim() }
}

function expandPartials(source: string, depth = 0): string {
  if (depth >= MAX_TEMPLATE_DEPTH) return source
  let found = false
  const expanded = source.replace(PARTIAL_TOKEN, (_match, partialName) => {
    found = true
    const partial =
      EMAIL_PARTIALS[String(partialName).trim() as keyof typeof EMAIL_PARTIALS]
    return typeof partial === 'string' ? partial : ''
  })
  return found ? expandPartials(expanded, depth + 1) : expanded
}

function expandTrusted(
  source: string,
  context: Record<string, unknown>,
  escape: boolean
): string {
  let rendered = source
  for (let i = 0; i < MAX_TEMPLATE_DEPTH; i += 1) {
    let found = false
    const next = rendered.replace(
      TEMPLATE_TOKEN,
      (match, rawTriple, rawDouble) => {
        const { raw, key } = readToken(rawTriple, rawDouble)
        if (!isTrustedKey(key)) return match
        found = true
        const value = getNestedValue(context, key)
        return raw || !escape ? value : escapeHtml(value)
      }
    )
    if (!found || next === rendered) break
    rendered = next
  }
  return rendered
}

// A single substitution pass — the replacement text is never rescanned, so a
// caller-supplied value can never be reinterpreted as a template.
function substitute(
  source: string,
  context: Record<string, unknown>,
  escape: boolean
): string {
  return source.replace(TEMPLATE_TOKEN, (_match, rawTriple, rawDouble) => {
    const { raw, key } = readToken(rawTriple, rawDouble)
    if (key === 'content') {
      return typeof context.content === 'string' ? context.content : ''
    }
    if (key.startsWith('>')) {
      return ''
    }
    const value = getNestedValue(context, key)
    return raw || !escape ? value : escapeHtml(value)
  })
}

function renderTemplate(
  source: string,
  context: Record<string, unknown>,
  escape: boolean
): string {
  const composed = expandTrusted(expandPartials(source), context, escape)
  return substitute(composed, context, escape)
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

  const subject = renderTemplate(template.subject, baseContext, false).trim()

  const htmlBody = renderTemplate(
    template.html,
    {
      ...baseContext,
      subject,
    },
    true
  )

  const html = EMAIL_PARTIALS.layout
    ? renderTemplate(
        EMAIL_PARTIALS.layout,
        {
          ...baseContext,
          subject,
          content: htmlBody,
        },
        true
      )
    : htmlBody

  const text = template.text
    ? renderTemplate(
        template.text,
        {
          ...baseContext,
          subject,
        },
        false
      ).trim()
    : undefined
  const hash = (template.hashes[locale]?.contentHash ??
    '') as RenderedEmail<TName>['hash']

  return {
    name: input.name,
    locale,
    subject,
    html,
    ...(text ? { text } : {}),
    variables: template.variables,
    hash,
  }
}
`
}
