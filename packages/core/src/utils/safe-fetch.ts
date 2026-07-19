/**
 * SSRF-aware fetch helpers.
 *
 * `@pikku/core` runs in edge runtimes (Cloudflare Workers) with no Node `dns`,
 * so we cannot resolve hostnames to check for private targets. We reject the
 * obvious internal literals and, crucially, re-validate every redirect hop —
 * a public URL that 302s to `169.254.169.254` is the common bypass. This does
 * NOT defend against a public hostname that itself resolves to a private IP
 * (DNS rebinding), which is out of reach without DNS resolution.
 */

/**
 * Parse the many textual encodings of an IPv4 address that `fetch`/`undici`
 * (and `inet_aton`-style parsers) accept — a dotted quad whose octets may be
 * decimal, octal (`0177`) or hex (`0x7f`), or the whole address as a single
 * 32-bit integer (decimal `2130706433`, hex `0x7f000001`). Returns the four
 * octets, or `null` when the host is not a numeric IPv4 literal.
 */
function parseIPv4Octets(
  host: string
): [number, number, number, number] | null {
  const toInt = (part: string): number | null => {
    let n: number
    if (/^0x[0-9a-f]+$/.test(part)) n = parseInt(part, 16)
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8)
    else if (/^\d+$/.test(part)) n = parseInt(part, 10)
    else return null
    return Number.isInteger(n) ? n : null
  }

  if (!host.includes('.')) {
    const n = toInt(host)
    if (n === null || n < 0 || n > 0xffffffff) return null
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
  }

  const parts = host.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    const n = toInt(part)
    if (n === null || n < 0 || n > 0xff) return null
    octets.push(n)
  }
  return octets as [number, number, number, number]
}

/**
 * Whether a hostname is an obvious internal/private target (loopback, private
 * IPv4 ranges, link-local incl. the cloud metadata endpoint, or private IPv6).
 *
 * Alias/encoded forms that resolve to the same targets are also rejected: a
 * trailing-dot FQDN (`localhost.`), the `*.localhost` reserved name, IPv4-mapped
 * IPv6 (`::ffff:127.0.0.1`), and octal/decimal/hex-encoded IPv4. This is
 * best-effort literal matching only — it cannot catch a public hostname that
 * *resolves* to a private IP (DNS rebinding), which needs DNS resolution
 * unavailable in edge runtimes.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
  if (host === '' || host === 'localhost' || host.endsWith('.localhost'))
    return true

  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true
    const mappedV4 = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mappedV4) return isPrivateHost(mappedV4[1]!)
    const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (mappedHex) {
      const hi = parseInt(mappedHex[1]!, 16)
      const lo = parseInt(mappedHex[2]!, 16)
      return isPrivateHost(
        `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
      )
    }
    if (/^fe[89ab]/.test(host)) return true // link-local fe80::/10
    if (host.startsWith('fc') || host.startsWith('fd')) return true // unique-local fc00::/7
    return false
  }

  const v4 = parseIPv4Octets(host)
  if (v4) {
    const [a, b] = v4
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 169 && b === 254) return true // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  return false
}

export interface SafeFetchOptions {
  /**
   * When set, the host of every hop must appear in this allowlist. When omitted,
   * any host that is not {@link isPrivateHost} is permitted.
   */
  allowedHosts?: string[]
  /** Maximum redirect hops to follow (each re-validated). Defaults to 3. */
  maxRedirects?: number
}

/**
 * Parse and validate a URL for outbound fetching: only http(s), and — unless an
 * `allowedHosts` allowlist is supplied — not an obvious private/internal host.
 * Returns the parsed URL or throws.
 */
export function assertFetchableUrl(
  url: string,
  options: SafeFetchOptions = {}
): URL {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Refusing to fetch non-HTTP(S) URL: ${parsed.protocol}`)
  }
  if (options.allowedHosts) {
    if (!options.allowedHosts.includes(parsed.hostname)) {
      throw new Error(`URL host is not in the allowlist: ${parsed.hostname}`)
    }
  } else if (isPrivateHost(parsed.hostname)) {
    throw new Error(
      `Refusing to fetch from a private/internal host: ${parsed.hostname}`
    )
  }
  return parsed
}

/**
 * The only 3xx statuses that request a redirect be followed. `300` (Multiple
 * Choices), `304` (Not Modified), `305` (Use Proxy) and `306` are returned to
 * the caller as-is rather than followed.
 */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * Drop credential-bearing headers (`Authorization`, `Cookie`) so they are not
 * replayed to a different origin across a redirect.
 */
function stripCredentialHeaders(init: RequestInit): RequestInit {
  if (!init.headers) return init
  const headers = new Headers(init.headers)
  headers.delete('authorization')
  headers.delete('cookie')
  return { ...init, headers }
}

/**
 * Apply the WHATWG-fetch method/body transform for a redirect: a `303` (and a
 * `301`/`302` on a `POST`) becomes a bodyless `GET`; `307`/`308` preserve the
 * original method and body. When the method changes to `GET` the request body
 * and its `Content-*` headers are dropped.
 */
function redirectInit(status: number, init: RequestInit): RequestInit {
  const method = (init.method ?? 'GET').toUpperCase()
  const toGet =
    (status === 303 && method !== 'GET' && method !== 'HEAD') ||
    ((status === 301 || status === 302) && method === 'POST')
  if (!toGet) return init
  const headers = new Headers(init.headers)
  headers.delete('content-length')
  headers.delete('content-type')
  return { ...init, method: 'GET', body: undefined, headers }
}

/**
 * `fetch` with SSRF protection. The initial URL and every redirect target are
 * validated with {@link assertFetchableUrl}. Redirects are followed manually
 * (`redirect: 'manual'`) so an unsafe `Location` can never be followed into the
 * internal network; only the redirect statuses in {@link REDIRECT_STATUSES} are
 * followed, and the method/body are transformed per {@link redirectInit}. Each
 * intermediate redirect response body is cancelled before the next hop so it is
 * not left dangling. When a redirect cannot or should not be followed (no
 * `Location`, or the hop budget is exhausted) the raw redirect response is
 * returned for the caller to handle by status. Credential headers
 * (`Authorization`, `Cookie`) are stripped whenever a redirect crosses origin,
 * so they never leak to a redirected host.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3
  let currentUrl = assertFetchableUrl(url, options).toString()
  let currentInit = init

  for (let hop = 0; ; hop++) {
    const response = await fetch(currentUrl, {
      ...currentInit,
      redirect: 'manual',
    })
    if (!REDIRECT_STATUSES.has(response.status)) {
      return response
    }
    const location = response.headers.get('location')
    if (!location || hop >= maxRedirects) {
      return response
    }
    const nextUrl = assertFetchableUrl(
      new URL(location, currentUrl).toString(),
      options
    ).toString()
    await response.body?.cancel()
    let nextInit = redirectInit(response.status, currentInit)
    if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
      nextInit = stripCredentialHeaders(nextInit)
    }
    currentInit = nextInit
    currentUrl = nextUrl
  }
}
