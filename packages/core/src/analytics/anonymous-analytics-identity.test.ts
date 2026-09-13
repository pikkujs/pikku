import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { anonymousAnalyticsIdentity } from './anonymous-analytics-identity.js'

const wireWith = (cookies: Record<string, string> = {}) => {
  const written: Array<{ name: string; value: string; options: any }> = []
  const wire = {
    http: {
      request: { cookie: (name: string) => cookies[name] ?? null },
      response: {
        cookie: (name: string, value: string, options: any) => {
          written.push({ name, value, options })
        },
      },
    },
  } as any
  return { wire, written }
}

describe('anonymousAnalyticsIdentity', () => {
  test('returns the id already on the device', () => {
    const { wire, written } = wireWith({ pikku_aid: 'existing' })

    assert.equal(anonymousAnalyticsIdentity()(wire)?.anonymousId, 'existing')
    assert.equal(written.length, 0)
  })

  test('mints one for a visitor who has none', () => {
    const { wire, written } = wireWith()

    const anonymousId = anonymousAnalyticsIdentity()(wire)?.anonymousId

    assert.equal(typeof anonymousId, 'string')
    assert.equal(written[0]?.value, anonymousId)
  })

  test('is unreadable to scripts by default', () => {
    const { wire, written } = wireWith()
    anonymousAnalyticsIdentity()(wire)

    assert.equal(written[0]?.options.httpOnly, true)
    assert.equal(written[0]?.options.secure, true)
  })

  test('waits for the purpose it was told to require', () => {
    const { wire, written } = wireWith()

    const identity = anonymousAnalyticsIdentity({ requires: ['analytics'] })(wire, {
      consent: { analytics: false },
    })

    assert.equal(identity, undefined)
    assert.equal(written.length, 0)
  })

  test('mints once the purpose is granted', () => {
    const { wire } = wireWith()

    const identity = anonymousAnalyticsIdentity({ requires: ['analytics'] })(wire, {
      consent: { analytics: true },
    })

    assert.equal(typeof identity?.anonymousId, 'string')
  })

  test('resolves nothing on a wire with no browser behind it', () => {
    assert.equal(anonymousAnalyticsIdentity()({} as any), undefined)
  })
})
