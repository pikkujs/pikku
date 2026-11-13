import { isIpLiteral } from './ip-literal.js'

/**
 * A host pattern split into its parts. `wildcardSuffix` is set for a
 * `*.example.com` pattern and holds `.example.com`; `host` is then empty.
 */
interface ParsedHostPattern {
  host: string
  wildcardSuffix?: string
  port?: string
}

/** Why {@link validateHostPattern} refused a pattern. */
export type HostPatternValidation =
  { valid: true } | { valid: false; reason: string }

const LABEL = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/
const PORT = /^\d{1,5}$/

const normalizeHost = (host: string): string =>
  host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')

/**
 * Splits `host`, `host:port`, `[v6]`, `[v6]:port` or a bare IPv6 literal.
 * A bare IPv6 literal (two or more colons, no brackets) carries no port.
 */
function splitHostPort(
  pattern: string
): { host: string; port?: string } | null {
  if (pattern.startsWith('[')) {
    const close = pattern.indexOf(']')
    if (close === -1) return null
    const host = pattern.slice(1, close)
    const rest = pattern.slice(close + 1)
    if (rest === '') return { host }
    if (!rest.startsWith(':')) return null
    return { host, port: rest.slice(1) }
  }
  const colons = pattern.split(':').length - 1
  if (colons === 0) return { host: pattern }
  if (colons === 1) {
    const [host, port] = pattern.split(':') as [string, string]
    return { host, port }
  }
  return { host: pattern }
}

function parseHostPattern(
  pattern: string
): ParsedHostPattern | { error: string } {
  const raw = pattern.trim().toLowerCase()
  if (raw === '') return { error: 'it is empty' }
  if (raw.includes('://')) {
    return { error: 'it has a scheme; list the host only' }
  }
  if (/[/?#@\s\\]/.test(raw)) {
    return { error: 'it has a path, query or credentials; list the host only' }
  }

  const split = splitHostPort(raw)
  if (!split) return { error: 'it is not a host or host:port' }
  const { host, port } = split
  if (port !== undefined) {
    if (!PORT.test(port) || Number(port) < 1 || Number(port) > 65535) {
      return { error: `'${port}' is not a port between 1 and 65535` }
    }
  }
  if (host === '') return { error: 'it names no host' }

  if (host.includes('*')) {
    if (host === '*') {
      return {
        error: "a bare '*' would allow every host; list the hosts instead",
      }
    }
    if (!host.startsWith('*.') || host.slice(2).includes('*')) {
      return {
        error: "a wildcard is only allowed as a single leading '*.'",
      }
    }
    const suffix = host.slice(2)
    const labels = suffix.split('.')
    if (labels.some((label) => label === '')) {
      return { error: 'it has an empty label' }
    }
    if (labels.length < 2) {
      return {
        error: `'*.${suffix}' would match a whole top-level domain; a wildcard needs at least two labels after it`,
      }
    }
    // The URL parser reads a host whose last label is numeric as IPv4.
    if (/^(\d+|0x[0-9a-f]*)$/.test(labels[labels.length - 1]!)) {
      return { error: 'a wildcard never applies to an IP address' }
    }
    if (!labels.every((label) => LABEL.test(label))) {
      return { error: 'it has a label with characters a host cannot carry' }
    }
    return { host: '', wildcardSuffix: `.${suffix}`, port }
  }

  if (isIpLiteral(host)) return { host: normalizeHost(host), port }

  const labels = host.split('.')
  if (labels.some((label) => label === '')) {
    return { error: 'it has an empty label' }
  }
  if (!labels.every((label) => LABEL.test(label))) {
    return { error: 'it has a label with characters a host cannot carry' }
  }
  return { host, port }
}

/**
 * Checks one allowed-host pattern. A pattern is a host (`api.example.com`),
 * an IP literal (`10.0.0.5`, `[::1]`), either with an optional `:port`, or a
 * single leading wildcard (`*.example.com`) with at least two labels after it.
 *
 * Refused: an empty pattern, a bare `*`, `*.com`, a wildcard anywhere but the
 * front, a wildcard over an IP address, empty labels, and anything carrying a
 * scheme, path, query or credentials.
 */
export function validateHostPattern(pattern: string): HostPatternValidation {
  const parsed = parseHostPattern(pattern)
  return 'error' in parsed
    ? { valid: false, reason: parsed.error }
    : { valid: true }
}

/**
 * The port a URL connects to: its explicit port, or the scheme's default
 * (`443` for `https:`, `80` for `http:`).
 */
export function effectivePort(url: URL): string {
  if (url.port) return url.port
  if (url.protocol === 'https:') return '443'
  if (url.protocol === 'http:') return '80'
  return ''
}

/**
 * Whether `host` (and `port`) is covered by one allowed-host pattern.
 *
 * Matching is case-insensitive and ignores IPv6 brackets and a trailing dot. A
 * pattern without a port matches any port; one with a port matches only that
 * port. `*.example.com` matches any name ending in `.example.com`, at any
 * depth, but not `example.com` itself, and never an IP literal. A pattern
 * {@link validateHostPattern} refuses matches nothing.
 */
export function hostMatches(
  host: string,
  port: string | number | undefined,
  pattern: string
): boolean {
  const parsed = parseHostPattern(pattern)
  if ('error' in parsed) return false
  if (parsed.port !== undefined && parsed.port !== String(port ?? '')) {
    return false
  }
  const h = normalizeHost(host)
  if (parsed.wildcardSuffix !== undefined) {
    if (isIpLiteral(h)) return false
    return (
      h.endsWith(parsed.wildcardSuffix) &&
      h.length > parsed.wildcardSuffix.length
    )
  }
  return h === parsed.host
}
