/**
 * The renderer behind a generated `pikku-emails.gen.ts`.
 *
 * The generated module supplies the assets — theme, locale strings, partials and
 * the templates themselves — and a typed wrapper over `renderEmail`. Everything
 * here is the same for every application, which is why it lives in core rather
 * than in the string the CLI writes: this is HTML escaping, and code inside a
 * template literal is never compiled, never linted, and testable only by
 * matching the text it emits.
 */

export interface EmailTemplateHashes {
  contentHash: string
  htmlHash: string
  subjectHash: string
  textHash: string
}

export interface EmailTemplateAssets {
  html: string
  subject: string
  text: string
  variables: ReadonlyArray<string>
  hashes: Record<string, EmailTemplateHashes>
}

export interface EmailAssets {
  theme: Record<string, unknown>
  locales: Record<string, Record<string, unknown>>
  partials: Record<string, string>
  templates: Record<string, EmailTemplateAssets>
}

export interface RenderEmailRequest {
  name: string
  locale?: string
  data?: Record<string, unknown>
}

export interface RenderedEmailResult {
  locale: string
  subject: string
  html: string
  text?: string
  variables: ReadonlyArray<string>
  hash: string
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)

// Matches the raw {{{ value }}} form before the escaped {{ value }} form, so the
// opt-in escape hatch is never mistaken for a normal substitution.
const TEMPLATE_TOKEN = /\{\{\{\s*([^{}]+?)\s*\}\}\}|\{\{\s*([^}]+?)\s*\}\}/g

const PARTIAL_TOKEN = /\{\{\s*>\s*([a-zA-Z0-9-_/.]+)\s*\}\}/g

const MAX_TEMPLATE_DEPTH = 5

// theme.json and the locale files ship with the templates, so they are treated as
// template-author input: expanded before caller data and allowed to contain their
// own placeholders. Everything else is caller-supplied.
const TRUSTED_ROOTS = ['theme', 't']

const isTrustedKey = (key: string): boolean =>
  TRUSTED_ROOTS.includes(String(key.split('.')[0]))

const getNestedValue = (
  source: Record<string, unknown>,
  path: string
): string => {
  const segments = path.split('.')
  let current: unknown = source
  for (const segment of segments) {
    // `hasOwn`, not `in`: `in` walks the prototype chain, so a path is answered
    // by what an object inherits rather than only by what it carries. Nothing
    // inherited reaches the output today — every step past a prototype hit lands
    // on a function, which is neither traversed nor written — so this closes the
    // lookup rather than fixing a value that escapes through it.
    if (
      !current ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, segment)
    ) {
      return ''
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' || typeof current === 'number'
    ? String(current)
    : ''
}

const readToken = (rawTriple: unknown, rawDouble: unknown) => {
  const raw = typeof rawTriple === 'string'
  return { raw, key: String(raw ? rawTriple : rawDouble).trim() }
}

const expandPartials = (
  source: string,
  partials: Record<string, string>,
  depth = 0
): string => {
  if (depth >= MAX_TEMPLATE_DEPTH) return source
  let found = false
  const expanded = source.replace(PARTIAL_TOKEN, (_match, partialName) => {
    found = true
    const partial = partials[String(partialName).trim()]
    return typeof partial === 'string' ? partial : ''
  })
  return found ? expandPartials(expanded, partials, depth + 1) : expanded
}

const expandTrusted = (
  source: string,
  context: Record<string, unknown>,
  escape: boolean
): string => {
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
const substitute = (
  source: string,
  context: Record<string, unknown>,
  escape: boolean,
  slot?: string
): string =>
  source.replace(TEMPLATE_TOKEN, (_match, rawTriple, rawDouble) => {
    const { raw, key } = readToken(rawTriple, rawDouble)
    // `content` is the layout's slot for the body that was already rendered and
    // escaped, so it is the one value written in raw. Only the layout gets it:
    // honouring it everywhere would let a caller pass `data.content` into a
    // template that happens to name it and have it emitted unescaped.
    if (slot !== undefined && key === slot) {
      return typeof context[slot] === 'string' ? (context[slot] as string) : ''
    }
    if (key.startsWith('>')) {
      return ''
    }
    const value = getNestedValue(context, key)
    return raw || !escape ? value : escapeHtml(value)
  })

const renderTemplate = (
  source: string,
  partials: Record<string, string>,
  context: Record<string, unknown>,
  escape: boolean,
  slot?: string
): string => {
  const composed = expandTrusted(
    expandPartials(source, partials),
    context,
    escape
  )
  return substitute(composed, context, escape, slot)
}

export const renderEmail = (
  { theme, locales, partials, templates }: EmailAssets,
  { name, locale: requestedLocale, data }: RenderEmailRequest
): RenderedEmailResult => {
  const locale = requestedLocale ?? 'en'
  const template = templates[name]
  if (!template) {
    throw new Error(`Unknown email template: ${name}`)
  }

  const strings = locales[locale]
  if (!strings) {
    throw new Error(`Unknown email locale: ${locale}`)
  }

  const values = data ?? {}
  const appName =
    (typeof values.appName === 'string' && values.appName) ||
    getNestedValue(theme, 'appName')

  const baseContext = {
    ...values,
    locale,
    theme,
    t: strings,
    appName,
  }

  const subject = renderTemplate(
    template.subject,
    partials,
    baseContext,
    false
  ).trim()

  const htmlBody = renderTemplate(
    template.html,
    partials,
    { ...baseContext, subject },
    true
  )

  const html = partials.layout
    ? renderTemplate(
        partials.layout,
        partials,
        { ...baseContext, subject, content: htmlBody },
        true,
        'content'
      )
    : htmlBody

  const text = template.text
    ? renderTemplate(
        template.text,
        partials,
        { ...baseContext, subject },
        false
      ).trim()
    : undefined

  return {
    locale,
    subject,
    html,
    ...(text ? { text } : {}),
    variables: template.variables,
    hash: template.hashes[locale]?.contentHash ?? '',
  }
}
