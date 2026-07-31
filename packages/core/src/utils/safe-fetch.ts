/**
 * Parses the textual IPv4 encodings `fetch`/`undici` accept — a dotted quad
 * whose octets may be decimal, octal (`0177`) or hex (`0x7f`), or the whole
 * address as a single 32-bit integer. `null` when not an IPv4 literal.
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
 * Whether a hostname is an obvious internal target. Best-effort literal
 * matching only: it cannot catch a public hostname that *resolves* to a
 * private IP.
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

/** The only 3xx statuses followed; every other 3xx is returned to the caller. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function stripCredentialHeaders(init: RequestInit): RequestInit {
  if (!init.headers) return init
  const headers = new Headers(init.headers)
  headers.delete('authorization')
  headers.delete('cookie')
  return { ...init, headers }
}

/**
 * The WHATWG method/body transform for a redirect: `303` (and `301`/`302` on
 * a `POST`) becomes a bodyless `GET`; `307`/`308` preserve method and body.
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
 * `fetch` with SSRF protection on the initial URL and every redirect hop.
 * When a redirect cannot be followed (no `Location`, or the hop budget is
 * spent) the raw redirect response is returned for the caller to handle by
 * status.
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
