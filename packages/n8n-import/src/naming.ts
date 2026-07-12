/**
 * Identifier + RPC-name helpers. n8n node names are free text (spaces, quotes,
 * emoji, punctuation), so everything that becomes a TS identifier or graph node
 * id is sanitized here.
 */

const RESERVED = new Set([
  'default',
  'function',
  'return',
  'const',
  'let',
  'var',
  'class',
  'new',
  'delete',
  'switch',
  'case',
  'import',
  'export',
])

/** Split a free-text string into word tokens (alphanumeric runs). */
function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
}

export function toCamelCase(input: string): string {
  const parts = words(input)
  if (parts.length === 0) return 'node'
  return parts
    .map((w, i) =>
      i === 0
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join('')
}

export function toPascalCase(input: string): string {
  const camel = toCamelCase(input)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/** A safe kebab-case token, e.g. "Slack — Marketing" -> "slack-marketing". */
export function toKebabCase(input: string): string {
  const parts = words(input)
  if (parts.length === 0) return 'default'
  return parts.map((w) => w.toLowerCase()).join('-')
}

/** A safe camelCase identifier that never starts with a digit or a reserved word. */
export function sanitizeIdentifier(input: string): string {
  let id = toCamelCase(input)
  if (/^[0-9]/.test(id)) id = `n${id}`
  if (RESERVED.has(id)) id = `${id}Node`
  return id
}

/**
 * Make a human-readable name safe to emit as a JS string literal / object key.
 * A workflow's `name` becomes a key in Pikku's generated workflow map (emitted
 * single-quoted), so quote characters (`'` `"` `` ` ``), backslashes, and
 * control characters would break the generated code — strip them. Unicode
 * (accents, emoji) is valid in a string and kept; whitespace is collapsed.
 */
export function sanitizeDisplayName(input: string): string {
  return (
    input
      .replace(/['"`\\]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Last dotted segment of an n8n type, e.g. "n8n-nodes-base.gmailTool" -> "gmailTool". */
export function typeShort(type: string): string {
  const seg = type.split('.').pop() ?? type
  return seg
}

/** RPC name for an integration node: `<typeShortCamel>__<nodeNameCamel>`. */
export function integrationRpcName(type: string, nodeName: string): string {
  return `${toCamelCase(typeShort(type))}__${toCamelCase(nodeName)}`
}

/** RPC name for a Code node: `codeStub<PascalNodeName>`. */
export function codeRpcName(nodeName: string): string {
  return `codeStub${toPascalCase(nodeName)}`
}

/** RPC name for a vector-store retrieval node: `vectorStub__<nodeNameCamel>`. */
export function vectorRpcName(nodeName: string): string {
  return `vectorStub__${toCamelCase(nodeName)}`
}

/** Ensure names are unique by suffixing collisions with an incrementing index. */
export function dedupe(name: string, seen: Set<string>): string {
  if (!seen.has(name)) {
    seen.add(name)
    return name
  }
  let i = 2
  while (seen.has(`${name}${i}`)) i++
  const out = `${name}${i}`
  seen.add(out)
  return out
}
