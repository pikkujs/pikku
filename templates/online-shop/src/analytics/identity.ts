import {
  anonymousAnalyticsIdentity,
  composeAnalyticsIdentity,
  cookieAnalyticsIdentity,
  mintCookie,
  randomDigits,
  type AnalyticsIdentityResolver,
} from '#pikku/analytics'

const FIRST_PARTY_YEAR = {
  maxAge: 60 * 60 * 24 * 365,
  path: '/',
  sameSite: 'lax',
} as const

/**
 * Mints the `_ga`-shaped vendor cookie server-side, so a visitor with no vendor
 * script on the page still carries the id the destination keys on.
 */
// @snippet start mintVendorCookie
const mintGaClientId: AnalyticsIdentityResolver = (wire, resolved) => {
  const gaClientId = mintCookie(
    wire,
    '_ga',
    {
      cookie: FIRST_PARTY_YEAR,
      requires: ['analytics'],
      consent: resolved?.consent,
    },
    () => `GA1.1.${randomDigits(10)}.${Math.floor(Date.now() / 1000)}`
  )
  return gaClientId === undefined ? undefined : { vendorIds: { gaClientId } }
}
// @snippet end mintVendorCookie

// @snippet start analyticsIdentity
export const shopAnalyticsIdentity = composeAnalyticsIdentity(
  cookieAnalyticsIdentity({
    vendorIds: { gaClientId: '_ga' },
    consent: { analytics: 'shop_consent_analytics' },
  }),
  anonymousAnalyticsIdentity({ requires: ['analytics'] }),
  mintGaClientId
)
// @snippet end analyticsIdentity
