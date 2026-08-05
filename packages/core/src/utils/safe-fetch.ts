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

/**
 * Expands an IPv6 literal into its eight 16-bit groups, handling `::` elision
 * and a trailing dotted-quad. `null` when not a well-formed IPv6 literal.
 */
function parseIPv6Groups(host: string): number[] | null {
  const zoneless = host.split('%')[0]!
  const halves = zoneless.split('::')
  if (halves.length > 2) return null

  const parseSide = (side: string): number[] | null => {
    if (side === '') return []
    const parts = side.split(':')
    const groups: number[] = []
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      if (i === parts.length - 1 && part.includes('.')) {
        const v4 = parseIPv4Octets(part)
        if (!v4) return null
        groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3])
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null
      groups.push(parseInt(part, 16))
    }
    return groups
  }

  const head = parseSide(halves[0]!)
  if (head === null) return null

  if (halves.length === 1) {
    return head.length === 8 ? head : null
  }

  const tail = parseSide(halves[1]!)
  if (tail === null) return null
  if (head.length + tail.length > 7) return null
  return [...head, ...new Array(8 - head.length - tail.length).fill(0), ...tail]
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

export interface SafeFetchOptions {
  /**
   * When set, the host of every hop must appear in this allowlist. When omitted,
   * any host that is not {@link isPrivateHost} is permitted.
   */
  allowedHosts?: string[]
  /** Maximum redirect hops to follow (each re-validated). Defaults to 3. */
  maxRedirects?: number
  /**
   * Resolves a hostname so a *public* name pointing at a private address is
   * refused. Defaults to whatever {@link setDefaultHostResolver} installed;
   * pass `null` to opt a call out of resolution entirely.
   */
  resolveHost?: HostResolver | null
}

/** Whether a hostname is already an IP literal, which the sync check covers. */
function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (host.includes(':')) return parseIPv6Groups(host.toLowerCase()) !== null
  return parseIPv4Octets(host) !== null
}

/**
 * Rejects a hostname that resolves to an internal address.
 *
 * Resolution happens once per hop and the connection is not pinned to the
 * address checked, so a rebind between this check and the socket connecting is
 * still possible; catching that needs a runtime-level connect hook.
 */
async function assertResolvedHostAllowed(
  hostname: string,
  options: SafeFetchOptions
): Promise<void> {
  if (options.allowedHosts) return
  const resolver =
    options.resolveHost === null
      ? undefined
      : (options.resolveHost ?? defaultHostResolver)
  if (!resolver || isIpLiteral(hostname)) return

  const addresses = await resolver(hostname)
  if (addresses.length === 0) {
    throw new Error(`Refusing to fetch: '${hostname}' resolved to no addresses`)
  }
  for (const address of addresses) {
    if (isPrivateHost(address)) {
      throw new Error(
        `Refusing to fetch from a private/internal host: '${hostname}' resolves to ${address}`
      )
    }
  }
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
  const initial = assertFetchableUrl(url, options)
  await assertResolvedHostAllowed(initial.hostname, options)
  let currentUrl = initial.toString()
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
    const next = assertFetchableUrl(
      new URL(location, currentUrl).toString(),
      options
    )
    await assertResolvedHostAllowed(next.hostname, options)
    const nextUrl = next.toString()
    await response.body?.cancel()
    let nextInit = redirectInit(response.status, currentInit)
    if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
      nextInit = stripCredentialHeaders(nextInit)
    }
    currentInit = nextInit
    currentUrl = nextUrl
  }
}
