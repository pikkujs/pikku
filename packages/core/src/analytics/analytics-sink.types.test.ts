import { test } from 'node:test'
import { defineProvider } from '../provider/define-provider.js'
import { analyticsSinks } from './fan-out-analytics.js'
import type { AnalyticsEventSink } from './analytics.types.js'

type VendorMap = { signedUp: { vendorName: string } }

test('an item provider returns the sink and the events it takes', () => {
  const vendor: AnalyticsEventSink<VendorMap> = {
    write: async () => {},
    setMap: () => {},
  }
  const plain: AnalyticsEventSink = { write: async () => {} }

  defineProvider({
    addTo: analyticsSinks,
    common: () => ({
      sink: vendor,
      map: { signedUp: { vendorName: 'sign_up' } },
    }),
  })
  defineProvider({
    addTo: analyticsSinks,
    common: () => ({ sink: plain, map: { anything: true } }),
  })
})
