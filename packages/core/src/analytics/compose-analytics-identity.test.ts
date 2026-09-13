import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { composeAnalyticsIdentity } from './compose-analytics-identity.js'

const wire = {} as any

describe('composeAnalyticsIdentity', () => {
  test('merges vendor ids from every resolver', () => {
    const identity = composeAnalyticsIdentity(
      () => ({ vendorIds: { gaClientId: '1.2' } }),
      () => ({ vendorIds: { fbp: 'fb.1.3' } })
    )(wire)

    assert.deepEqual(identity?.vendorIds, { gaClientId: '1.2', fbp: 'fb.1.3' })
  })

  test('hands each resolver what the ones before it produced', () => {
    let seen: unknown
    composeAnalyticsIdentity(
      () => ({ consent: { ads: true } }),
      (_wire, resolved) => {
        seen = resolved?.consent
        return undefined
      }
    )(wire)

    assert.deepEqual(seen, { ads: true })
  })

  test('lets a minted id replace the absent one a reader could not find', () => {
    const identity = composeAnalyticsIdentity(
      () => ({ vendorIds: {} }),
      () => ({ vendorIds: { fbp: 'fb.1.minted' } })
    )(wire)

    assert.equal(identity?.vendorIds?.['fbp'], 'fb.1.minted')
  })

  test('skips a resolver that has nothing to say', () => {
    const identity = composeAnalyticsIdentity(
      () => undefined,
      () => ({ anonymousId: 'a-1' })
    )(wire)

    assert.equal(identity?.anonymousId, 'a-1')
  })

  test('resolves nothing when no resolver did', () => {
    assert.equal(
      composeAnalyticsIdentity(
        () => undefined,
        () => undefined
      )(wire),
      undefined
    )
  })
})
