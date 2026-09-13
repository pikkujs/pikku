import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { cookieAnalyticsIdentity } from './cookie-analytics-identity.js'

const wireWith = (cookies: Record<string, string>) =>
  ({
    http: { request: { cookie: (name: string) => cookies[name] ?? null } },
  }) as any

describe('cookieAnalyticsIdentity', () => {
  test('lifts vendor ids off first-party cookies', () => {
    const identity = cookieAnalyticsIdentity({
      vendorIds: { gaClientId: '_ga', fbp: '_fbp' },
    })(wireWith({ _ga: 'GA1.1.123', _fbp: 'fb.1.456' }))

    assert.deepEqual(identity?.vendorIds, {
      gaClientId: 'GA1.1.123',
      fbp: 'fb.1.456',
    })
  })

  test('omits an id whose cookie is absent rather than sending an empty one', () => {
    const identity = cookieAnalyticsIdentity({
      vendorIds: { gaClientId: '_ga', fbp: '_fbp' },
    })(wireWith({ _ga: 'GA1.1.123' }))

    assert.deepEqual(identity?.vendorIds, { gaClientId: 'GA1.1.123' })
  })

  test('reads a written refusal as a refusal, not as consent', () => {
    const identity = cookieAnalyticsIdentity({
      consent: { marketing: 'consent_marketing' },
    })(wireWith({ consent_marketing: 'denied' }))

    assert.equal(identity?.consent?.['marketing'], false)
  })

  test('grants a purpose whose cookie is present and not a denial', () => {
    const identity = cookieAnalyticsIdentity({
      consent: { analytics: 'consent_analytics' },
    })(wireWith({ consent_analytics: '1' }))

    assert.equal(identity?.consent?.['analytics'], true)
  })

  test('leaves an unanswered purpose absent, not false', () => {
    const identity = cookieAnalyticsIdentity({
      consent: { analytics: 'consent_analytics' },
    })(wireWith({}))

    assert.equal(identity?.consent, undefined)
  })

  test('resolves nothing off a wire with no browser behind it', () => {
    const identity = cookieAnalyticsIdentity({
      vendorIds: { gaClientId: '_ga' },
    })({} as any)

    assert.equal(identity, undefined)
  })
})
