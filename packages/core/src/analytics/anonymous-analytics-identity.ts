import type { SerializeOptions } from 'cookie'
import type { AnalyticsIdentityResolver } from './analytics.types.js'
import { mintCookie } from './mint-cookie.js'

const TWO_YEARS_SECONDS = 63_072_000

const DEFAULT_COOKIE: SerializeOptions = {
  path: '/',
  maxAge: TWO_YEARS_SECONDS,
  sameSite: 'lax',
  httpOnly: true,
  secure: true,
}

export interface AnonymousAnalyticsIdentityOptions {
  /** Cookie name. Defaults to `pikku_aid`. */
  name?: string
  /**
   * Consent purposes required before the cookie is written. Storing an
   * analytics id on someone's device is the act consent governs, so this is
   * usually set — and left unset only where the deployment meets a regulator's
   * exemption for strictly necessary audience measurement.
   */
  requires?: string[]
  cookie?: SerializeOptions
}

/**
 * Mints a device-scoped id for visitors who have no session yet.
 *
 * `httpOnly` by default, which is the honest reading of what this is for: no
 * browser script needs it, and a cookie scripts cannot touch is both harder to
 * misuse and not subject to the seven-day cap browsers place on script-set
 * ones. An app that wants a vendor SDK to read it must opt out deliberately.
 */
export const anonymousAnalyticsIdentity = (
  options: AnonymousAnalyticsIdentityOptions = {}
): AnalyticsIdentityResolver => {
  return (wire, resolved) => {
    const anonymousId = mintCookie(
      wire,
      options.name ?? 'pikku_aid',
      {
        cookie: { ...DEFAULT_COOKIE, ...options.cookie },
        requires: options.requires,
        consent: resolved?.consent,
      },
      () => crypto.randomUUID()
    )

    return anonymousId === undefined ? undefined : { anonymousId }
  }
}
