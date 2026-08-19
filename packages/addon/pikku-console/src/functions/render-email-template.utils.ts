const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Matches the raw `{{{ value }}}` form before the escaped `{{ value }}` form, so
 * the opt-in escape hatch is never mistaken for a normal substitution.
 */
const TEMPLATE_TOKEN = /\{\{\{\s*([^{}]+?)\s*\}\}\}|\{\{\s*([^}]+?)\s*\}\}/g

const PARTIAL_TOKEN = /\{\{\s*>\s*([a-zA-Z0-9-_/.]+)\s*\}\}/g

const MAX_TEMPLATE_DEPTH = 5

/**
 * theme.json and the locale files ship with the templates, so they are treated
 * as template-author input: expanded before caller data and allowed to contain
 * their own placeholders. Everything else is caller-supplied.
 */
const TRUSTED_ROOTS = ['theme', 't']

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

export function getNestedValue(
  source: Record<string, unknown>,
  path: string
): string {
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

function isTrustedKey(key: string): boolean {
  return TRUSTED_ROOTS.includes(String(key.split('.')[0]))
}

function readToken(rawTriple: unknown, rawDouble: unknown) {
  const raw = typeof rawTriple === 'string'
  return { raw, key: String(raw ? rawTriple : rawDouble).trim() }
}

export function expandPartials(
  source: string,
  partials: Record<string, string>,
  depth = 0
): string {
  if (depth >= MAX_TEMPLATE_DEPTH) return source
  let found = false
  const expanded = source.replace(PARTIAL_TOKEN, (_match, partialName) => {
    found = true
    const partial = partials[String(partialName).trim()]
    return typeof partial === 'string' ? partial : ''
  })
  return found ? expandPartials(expanded, partials, depth + 1) : expanded
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

/**
 * A single substitution pass — the replacement text is never rescanned, so a
 * caller-supplied value can never be reinterpreted as a template.
 */
export function substitute(
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

export function renderTemplate(
  source: string,
  context: Record<string, unknown>,
  partials: Record<string, string>,
  escape: boolean
): string {
  const composed = expandTrusted(
    expandPartials(source, partials),
    context,
    escape
  )
  return substitute(composed, context, escape)
}
