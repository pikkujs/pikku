import {
  NetworkHostNotAllowedError,
  type NetworkRefusalReason,
} from '../errors/errors.js'
import {
  effectivePort,
  hostMatches,
  validateHostPattern,
} from './host-match.js'
import { isIpLiteral, parseIPv4Octets, parseIPv6Groups } from './ip-literal.js'

export { hostMatches, validateHostPattern } from './host-match.js'
export type { HostPatternValidation } from './host-match.js'

/**
 * IPv4 blocks that must never be reachable from user-supplied URLs: private,
 * loopback, link-local (cloud metadata), carrier-grade NAT (Alibaba's
 * `100.100.100.200` metadata endpoint), IETF protocol assignments, benchmarking,
 * 6to4 anycast, the documentation TEST-NETs, multicast and reserved space.
 */
const PRIVATE_IPV4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

const toUint32 = (octets: [number, number, number, number]): number =>
  ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0

const PRIVATE_IPV4_RANGES = PRIVATE_IPV4_BLOCKS.map(([base, prefix]) => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return [(toUint32(parseIPv4Octets(base)!) & mask) >>> 0, mask] as const
})

const isPrivateIPv4 = (octets: [number, number, number, number]): boolean => {
  const addr = toUint32(octets)
  return PRIVATE_IPV4_RANGES.some(
    ([base, mask]) => (addr & mask) >>> 0 === base
  )
}

const embeddedIPv4 = (
  hi: number,
  lo: number
): [number, number, number, number] => [
  (hi >> 8) & 0xff,
  hi & 0xff,
  (lo >> 8) & 0xff,
  lo & 0xff,
]

function isPrivateIPv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]

  if (groups.every((g) => g === 0)) return true // :: unspecified
  if (groups.slice(0, 7).every((g) => g === 0) && g7 === 1) return true // ::1

  // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible ::/96
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
    if (g5 === 0xffff || g5 === 0) return isPrivateIPv4(embeddedIPv4(g6, g7))
  }
  // NAT64 well-known prefix 64:ff9b::/96
  if (
    g0 === 0x64 &&
    g1 === 0xff9b &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0
  )
    return isPrivateIPv4(embeddedIPv4(g6, g7))
  // 6to4 2002::/16 carries the IPv4 address in the next 32 bits
  if (g0 === 0x2002) return isPrivateIPv4(embeddedIPv4(g1, g2))
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true // discard-only 100::/64
  if ((g0 & 0xffc0) === 0xfe80) return true // link-local fe80::/10
  if ((g0 & 0xfe00) === 0xfc00) return true // unique-local fc00::/7
  if ((g0 & 0xffc0) === 0xfec0) return true // deprecated site-local fec0::/10
  if ((g0 & 0xff00) === 0xff00) return true // multicast ff00::/8
  return false
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
    const groups = parseIPv6Groups(host)
    return groups ? isPrivateIPv6(groups) : false
  }

  const v4 = parseIPv4Octets(host)
  return v4 ? isPrivateIPv4(v4) : false
}

/** Resolves a hostname to the IP addresses it points at. */
export type HostResolver = (hostname: string) => Promise<string[]>

let defaultHostResolver: HostResolver | undefined

/**
 * Installs the resolver {@link safeFetch} uses when a call passes no
 * `resolveHost` of its own.
 *
 * Core cannot resolve DNS itself — Workers has no DNS API — so without a
 * resolver the guard is literal-only and a public name pointing at
 * `169.254.169.254` passes. Node runtimes install
 * `nodeHostResolver` from `@pikku/core/node-host-resolver` at startup.
 */
export function setDefaultHostResolver(resolver: HostResolver | undefined) {
  defaultHostResolver = resolver
}

/** Restrictions {@link safeFetch} and {@link assertFetchableUrl} apply to each URL they visit. */
export interface SafeFetchOptions {
  /**
   * When set, the host of every hop must match one of these patterns (see
   * {@link hostMatches}: `api.example.com`, `api.example.com:8443`,
   * `*.example.com`). When omitted, any host is permitted. Either way a
   * private or internal address is refused unless it is in `privateHosts`.
   */
  allowedHosts?: string[]
  /**
   * Hosts that may be, or resolve to, a private or internal address. The
   * private-address and DNS checks are skipped only for a host matching one of
   * these; listing a host in `allowedHosts` alone does not.
   */
  privateHosts?: string[]
  /**
   * Decides which hosts may be reached over plain `http:`. When given, an
   * `http:` URL whose host it returns `false` for is refused. When omitted,
   * `http:` is accepted for any host.
   */
  allowHttp?: (host: string) => boolean
  /** The `fetch` each hop is sent through. Defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Who is fetching, named in the refusal so the fix is findable. */
  caller?: { addon?: string; package?: string }
  /** Maximum redirect hops to follow (each re-validated). Defaults to 3. */
  maxRedirects?: number
  /**
   * Resolves a hostname so a *public* name pointing at a private address is
   * refused. Defaults to whatever {@link setDefaultHostResolver} installed;
   * pass `null` to opt a call out of resolution entirely.
   */
  resolveHost?: HostResolver | null
}

interface HopRefusal {
  reason: NetworkRefusalReason
  explanation: string
}

const matchesAny = (url: URL, patterns: string[] | undefined): boolean =>
  !!patterns?.some((pattern) =>
    hostMatches(url.hostname, effectivePort(url), pattern)
  )

function assertValidPatterns(
  option: 'allowedHosts' | 'privateHosts',
  patterns: string[] | undefined
): void {
  for (const pattern of patterns ?? []) {
    const result = validateHostPattern(pattern)
    if (!result.valid) {
      throw new TypeError(
        `${option} entry '${pattern}' is not a valid host pattern: ${result.reason}`
      )
    }
  }
}

/** The checks that need no DNS: scheme, the allowlist, and private literals. */
function literalRefusal(
  url: URL,
  options: SafeFetchOptions
): HopRefusal | undefined {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      reason: 'scheme',
      explanation: `non-HTTP(S) URL scheme ${url.protocol}`,
    }
  }
  if (
    url.protocol === 'http:' &&
    options.allowHttp &&
    !options.allowHttp(url.hostname)
  ) {
    return {
      reason: 'scheme',
      explanation: 'plain http: is not allowed for this host; use https:',
    }
  }
  if (options.allowedHosts && !matchesAny(url, options.allowedHosts)) {
    return {
      reason: 'not-declared',
      explanation:
        'the host is not in the allowlist. Add it to allowedHosts if this is intended.',
    }
  }
  if (!matchesAny(url, options.privateHosts) && isPrivateHost(url.hostname)) {
    return {
      reason: 'private-address',
      explanation:
        'it is a private/internal host. Add it to privateHosts if this is intended.',
    }
  }
  return undefined
}

/**
 * Refuses a hostname that resolves to an internal address, unless the host is
 * in `privateHosts`.
 *
 * Resolution happens once per hop and the connection is not pinned to the
 * address checked, so a rebind between this check and the socket connecting is
 * still possible; catching that needs a runtime-level connect hook.
 */
async function resolvedRefusal(
  url: URL,
  options: SafeFetchOptions
): Promise<HopRefusal | undefined> {
  if (matchesAny(url, options.privateHosts)) return undefined
  const resolver =
    options.resolveHost === null
      ? undefined
      : (options.resolveHost ?? defaultHostResolver)
  if (!resolver || isIpLiteral(url.hostname)) return undefined

  const addresses = await resolver(url.hostname)
  if (addresses.length === 0) {
    return {
      reason: 'private-address',
      explanation: 'it resolved to no addresses',
    }
  }
  const privateAddress = addresses.find((address) => isPrivateHost(address))
  if (privateAddress) {
    return {
      reason: 'private-address',
      explanation: `it resolves to ${privateAddress}, a private/internal host. Add it to privateHosts if this is intended.`,
    }
  }
  return undefined
}

function refuse(
  url: URL,
  refusal: HopRefusal,
  options: SafeFetchOptions,
  redirectedFrom?: URL
): never {
  const owner = {
    addon: options.caller?.addon,
    package: options.caller?.package,
  }
  if (redirectedFrom) {
    throw new NetworkHostNotAllowedError(
      { ...owner, host: url.hostname, reason: 'redirect' },
      `redirected from '${redirectedFrom.hostname}', and ${refusal.explanation}`
    )
  }
  throw new NetworkHostNotAllowedError(
    { ...owner, host: url.hostname, reason: refusal.reason },
    refusal.explanation
  )
}

/**
 * Synchronous SSRF guard for a single URL: only `http:`/`https:` is accepted
 * (and `http:` only where `allowHttp` agrees), the host must match
 * `allowedHosts` when given, and it must not be a private, loopback or
 * link-local literal ({@link isPrivateHost}) unless it matches `privateHosts`.
 *
 * It does not resolve DNS, so a public name pointing at an internal address
 * passes; {@link safeFetch} adds that check per hop.
 *
 * @param url - The URL to check.
 * @param options - `allowedHosts`, `privateHosts`, `allowHttp` and `caller` are read here.
 * @returns The parsed URL.
 * @throws TypeError for an unparseable URL or an invalid host pattern;
 * NetworkHostNotAllowedError for a refused scheme or host.
 */
export function assertFetchableUrl(
  url: string,
  options: SafeFetchOptions = {}
): URL {
  assertValidPatterns('allowedHosts', options.allowedHosts)
  assertValidPatterns('privateHosts', options.privateHosts)
  const parsed = new URL(url)
  const refusal = literalRefusal(parsed, options)
  if (refusal) refuse(parsed, refusal, options)
  return parsed
}

async function assertHopAllowed(
  url: URL,
  options: SafeFetchOptions,
  redirectedFrom?: URL
): Promise<void> {
  const refusal =
    literalRefusal(url, options) ?? (await resolvedRefusal(url, options))
  if (refusal) refuse(url, refusal, options, redirectedFrom)
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
 * `fetch` with SSRF protection on the initial URL and every redirect hop. Each
 * hop is checked for its scheme, against `allowedHosts`, and for a private
 * address (literal or resolved) unless it matches `privateHosts`.
 * `Authorization` and `Cookie` are dropped when a redirect crosses origin.
 * When a redirect cannot be followed (no `Location`, or the hop budget is
 * spent) the raw redirect response is returned for the caller to handle by
 * status.
 *
 * @throws NetworkHostNotAllowedError when a hop is refused; `reason` is
 * `'redirect'` when the refused hop came from a redirect.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3
  const send = options.fetch ?? globalThis.fetch
  const initial = assertFetchableUrl(url, options)
  await assertHopAllowed(initial, options)
  let currentUrl = initial
  let currentInit = init

  for (let hop = 0; ; hop++) {
    const response = await send(currentUrl.toString(), {
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
    const next = new URL(location, currentUrl)
    try {
      await assertHopAllowed(next, options, currentUrl)
    } finally {
      await response.body?.cancel()
    }
    let nextInit = redirectInit(response.status, currentInit)
    if (next.origin !== currentUrl.origin) {
      nextInit = stripCredentialHeaders(nextInit)
    }
    currentInit = nextInit
    currentUrl = next
  }
}
