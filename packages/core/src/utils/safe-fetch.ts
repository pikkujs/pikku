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
 * Whether a hostname is an obvious internal/private target (loopback, private
 * IPv4 ranges, link-local incl. the cloud metadata endpoint, or private IPv6).
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd'))
    return true
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
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
 * `fetch` with SSRF protection. The initial URL and every redirect target are
 * validated with {@link assertFetchableUrl}. Redirects are followed manually
 * (`redirect: 'manual'`) so an unsafe `Location` can never be followed into the
 * internal network; when a redirect cannot or should not be followed (no
 * `Location`, or the hop budget is exhausted) the raw redirect response is
 * returned for the caller to handle by status.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3
  let currentUrl = assertFetchableUrl(url, options).toString()

  for (let hop = 0; ; hop++) {
    const response = await fetch(currentUrl, { ...init, redirect: 'manual' })
    if (response.status < 300 || response.status >= 400) {
      return response
    }
    const location = response.headers.get('location')
    if (!location || hop >= maxRedirects) {
      return response
    }
    currentUrl = assertFetchableUrl(
      new URL(location, currentUrl).toString(),
      options
    ).toString()
  }
}
