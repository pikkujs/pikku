import type { AnalyticsIdentityResolver } from './analytics.types.js'

export interface CookieAnalyticsIdentityOptions {
  /** Identity key to read it from, e.g. `{ gaClientId: '_ga' }`. */
  vendorIds?: Record<string, string>
  /**
   * Consent purpose to the cookie that grants it. The purpose is true only when
   * the cookie is present and is not a recognised denial (`'0'`, `'false'`,
   * `'denied'`), so a consent tool that writes a refusal rather than deleting
   * the cookie is read as a refusal.
   */
  consent?: Record<string, string>
}

const DENIALS = new Set(['0', 'false', 'denied', 'deny', 'no'])

/**
 * Reads the browser-originated half of the identity off first-party cookies.
 *
 * Covers the common case only. A consent tool that packs every purpose into one
 * encoded blob needs its own resolver — which is why the resolver is a function
 * and this is a helper rather than the mechanism.
 *
 * Resolves nothing off an HTTP wire, which is correct: a cron task and a queue
 * worker have no browser behind them, so any vendor id they produced would be
 * invented.
 */
export const cookieAnalyticsIdentity = (
  options: CookieAnalyticsIdentityOptions
): AnalyticsIdentityResolver => {
  return (wire) => {
    const request = wire.http?.request
    if (!request) return undefined

    const vendorIds: Record<string, string> = {}
    for (const [key, cookieName] of Object.entries(options.vendorIds ?? {})) {
      const value = request.cookie(cookieName)
      if (value) {
        vendorIds[key] = value
      }
    }

    const consent: Record<string, boolean> = {}
    for (const [purpose, cookieName] of Object.entries(options.consent ?? {})) {
      const value = request.cookie(cookieName)
      if (value !== null) {
        consent[purpose] = !DENIALS.has(value.toLowerCase())
      }
    }

    return {
      ...(Object.keys(vendorIds).length === 0 ? {} : { vendorIds }),
      ...(Object.keys(consent).length === 0 ? {} : { consent }),
    }
  }
}
