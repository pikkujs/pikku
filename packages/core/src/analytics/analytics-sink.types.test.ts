import { test } from 'node:test'
import { createAnalyticsSinks } from './fan-out-analytics.js'
import type { AnalyticsEventSink } from './analytics.types.js'

type VendorMap = { signedUp: { vendorName: string } }

test('the map type is inferred from the sink and checked at registration', () => {
  const vendor: AnalyticsEventSink<VendorMap> = {
    write: async () => {},
    setMap: () => {},
  }
  const plain: AnalyticsEventSink = { write: async () => {} }
  const sinks = createAnalyticsSinks()

  sinks.add(vendor, { signedUp: { vendorName: 'sign_up' } })
  sinks.add(plain, { anything: true })

  // Never called: each line below is refused by the compiler, which is the assertion.
  const refused = () => {
    // @ts-expect-error the map is required: a sink with no map would receive nothing
    sinks.add(plain)

    // @ts-expect-error the map must be the shape the sink declared
    sinks.add(vendor, { signedUp: { vendorName: 3 } })

    // @ts-expect-error a map missing an event the sink's map type names
    sinks.add(vendor, {})
  }
  void refused
})
