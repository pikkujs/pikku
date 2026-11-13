/**
 * Parses the textual IPv4 encodings `fetch`/`undici` accept — a dotted quad
 * whose octets may be decimal, octal (`0177`) or hex (`0x7f`), or the whole
 * address as a single 32-bit integer. `null` when not an IPv4 literal.
 */
export function parseIPv4Octets(
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
 * Expands an IPv6 literal into its eight 16-bit groups, handling `::` elision
 * and a trailing dotted-quad. `null` when not a well-formed IPv6 literal.
 */
export function parseIPv6Groups(host: string): number[] | null {
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

/** Whether a hostname is already an IP literal, which the sync check covers. */
export function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (host.includes(':')) return parseIPv6Groups(host.toLowerCase()) !== null
  return parseIPv4Octets(host) !== null
}
