import { z } from 'zod'
import { createAnalytics } from '@pikku/react'
import {
  defineAnalyticsEvents,
  composeAnalyticsIdentity,
  cookieAnalyticsIdentity,
  anonymousAnalyticsIdentity,
  fanOutAnalytics,
  mintCookie,
  randomDigits,
  LoggerAnalyticsService,
} from '#pikku/analytics'
import type {
  AnalyticsIdentityResolver,
  AnalyticsLog,
  AnalyticsRecord,
  AnalyticsService,
} from '#pikku/analytics'
import type { Logger } from '@pikku/core/services'
import type { AnalyticsEvent } from '../analytics/registry.js'

// @snippet start analyticsEvents
export const shopAnalyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({
    path: z.string().max(512),
  }),
  signed_up: z.object({}),
  checkout_completed: z.object({
    amount: z.number(),
    currency: z.string().length(3),
  }),
})
// @snippet end analyticsEvents

// @snippet start recordAnalyticsEvent
// `analytics` is the AnalyticsLog every function gets on its services
export const recordCheckout = async (
  analytics: AnalyticsLog<AnalyticsEvent>,
  totalCents: number
) => {
  await analytics.record({
    name: 'checkout_completed',
    amount: totalCents / 100,
    currency: 'GBP',
  })
}
// @snippet end recordAnalyticsEvent

// @snippet start createAnalyticsClient
const hasAnalyticsConsent = () => document.cookie.includes('shop_consent_analytics=1')

export const shopAnalytics = createAnalytics<AnalyticsEvent>({
  endpoint: '/analytics',
  enabled: () => hasAnalyticsConsent(),
})

shopAnalytics.event('page_viewed', { path: location.pathname })
// @snippet end createAnalyticsClient

// @snippet start cookieAnalyticsIdentity
export const consentFromCookies = cookieAnalyticsIdentity({
  vendorIds: { gaClientId: '_ga' },
  consent: { analytics: 'shop_consent_analytics' },
})
// @snippet end cookieAnalyticsIdentity

// @snippet start anonymousAnalyticsIdentity
export const anonymousVisitorId = anonymousAnalyticsIdentity({
  requires: ['analytics'],
})
// @snippet end anonymousAnalyticsIdentity

const FIRST_PARTY_YEAR = {
  maxAge: 60 * 60 * 24 * 365,
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
}

// @snippet start mintVendorCookie
export const mintGaClientId: AnalyticsIdentityResolver = (wire, resolved) => {
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

// @snippet start analyticsService
// One method, always a batch. A single event is a batch of one.
export class AdPlatformAnalyticsService implements AnalyticsService {
  async write(batch: AnalyticsRecord[]): Promise<void> {
    void batch
  }
}
// @snippet end analyticsService

// @snippet start analyticsServices
// Return these from your services factory next to `logger` and the rest
export const analyticsServices = () => ({
  analyticsService: new AdPlatformAnalyticsService(),
  analyticsIdentity: shopAnalyticsIdentity,
})
// @snippet end analyticsServices

// @snippet start fanOutAnalytics
export const fanOutShopAnalytics = (logger: Logger) =>
  fanOutAnalytics([
    new LoggerAnalyticsService(logger),
    {
      service: new AdPlatformAnalyticsService(),
      accepts: (record) => record.name === 'checkout_completed',
    },
  ])
// @snippet end fanOutAnalytics
