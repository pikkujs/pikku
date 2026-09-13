import type { SerializeOptions } from 'cookie'
import type { CoreUserSession, PikkuWire } from '../types/core.types.js'

type AnyWire = PikkuWire<any, any, any, CoreUserSession>

const minted = new WeakMap<object, Map<string, string>>()

export interface MintCookieOptions {
  /** Cookie attributes. Long-lived and first-party is the usual shape. */
  cookie: SerializeOptions
  /**
   * Purposes that must all be `true` before anything is written. Writing the
   * cookie IS the act consent governs, so a minter that runs before the banner
   * is answered has already done the thing the send gate was meant to prevent.
   */
  requires?: string[]
  consent?: Record<string, boolean>
  /**
   * Replace the cookie already on the device rather than returning it.
   *
   * For the case where the request itself carries something newer than what is
   * stored — Meta's `_fbc` derives from the `fbclid` on the current URL, and
   * keeping an older click would attribute the conversion to the wrong ad.
   */
  overwrite?: boolean
}

const permitted = (
  requires: string[] | undefined,
  consent: Record<string, boolean> | undefined
): boolean => {
  if (!requires || requires.length === 0) return true
  return requires.every((purpose) => consent?.[purpose] === true)
}

/**
 * Reads a first-party cookie, creating and setting it when absent.
 *
 * This is how an app tracks a visitor with no vendor SDK on the page: the
 * identifiers GA4 and Meta key on are ordinary first-party cookies in a
 * documented format, and nothing requires a browser script to be the one that
 * writes them. It is the mechanism behind server-side tagging, and the reason
 * pikku can offer it as a wired service rather than a second container to run.
 *
 * Minted once per wire, not once per call. The resolver runs for every event,
 * and a second mint within one request would hand the same visitor two
 * identities — which reads downstream as two people rather than as a bug.
 *
 * Writes nothing on a wire with no HTTP response, and nothing once the response
 * has been sent; a cron task and a queue worker have no browser to store it,
 * and a stream's headers are long gone. Both return undefined rather than
 * pretending.
 */
export const mintCookie = (
  wire: AnyWire,
  name: string,
  options: MintCookieOptions,
  mint: () => string
): string | undefined => {
  const existing = options.overwrite
    ? null
    : wire.http?.request?.cookie(name)
  if (existing) return existing

  const cache = minted.get(wire) ?? new Map<string, string>()
  const already = cache.get(name)
  if (already) return already

  const response = wire.http?.response
  if (!response) return undefined
  if (!permitted(options.requires, options.consent)) return undefined

  const value = mint()
  response.cookie(name, value, options.cookie)
  cache.set(name, value)
  minted.set(wire, cache)
  return value
}

/** Cryptographically random digits, the shape both vendor formats use. */
export const randomDigits = (length: number): string => {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let digits = ''
  for (const byte of bytes) {
    digits += String(byte % 10)
  }
  return digits
}
