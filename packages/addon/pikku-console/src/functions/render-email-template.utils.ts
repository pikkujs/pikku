export function getNestedValue(source: Record<string, unknown>, path: string): string {
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

export function applyTemplate(
  source: string,
  context: Record<string, unknown>
): string {
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

export function renderTemplate(
  source: string,
  context: Record<string, unknown>
): string {
  let rendered = source
  for (let i = 0; i < 5; i += 1) {
    const next = applyTemplate(rendered, context)
    if (next === rendered) break
    rendered = next
  }
  return rendered
}

export function renderPartial(
  name: string,
  partials: Record<string, string>,
  context: Record<string, unknown>
): string {
  const partial = partials[name]
  return partial ? renderTemplate(partial, context) : ''
}
