import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { CoreSecretlessSingletonServices } from '../types/core.types.js'
import { loggerAnalyticsSink } from './logger-analytics-sink.js'

const servicesLogging = (lines: unknown[]) =>
  ({
    logger: {
      info: (line: unknown) => lines.push(line),
    },
  }) as unknown as CoreSecretlessSingletonServices

describe('loggerAnalyticsSink', () => {
  it('logs one line per event, not one per batch', async () => {
    const lines: unknown[] = []
    await loggerAnalyticsSink(
      servicesLogging(lines),
      [{ name: 'page_viewed' }, { name: 'signed_up' }],
      { userId: null }
    )
    assert.equal(lines.length, 2)
  })

  it('carries the event name, the identity and the props', async () => {
    const lines: unknown[] = []
    await loggerAnalyticsSink(
      servicesLogging(lines),
      [{ name: 'checkout_completed', props: { amount: 12 }, at: 5 }],
      { userId: 'u1' }
    )
    assert.deepEqual(lines[0], {
      amount: 12,
      analytics: 'checkout_completed',
      userId: 'u1',
      at: 5,
    })
  })

  it('records an anonymous visitor as null rather than omitting the field', async () => {
    const lines: unknown[] = []
    await loggerAnalyticsSink(servicesLogging(lines), [{ name: 'signed_up' }], {
      userId: null,
    })
    assert.deepEqual(lines[0], { analytics: 'signed_up', userId: null })
  })

  it('does not let a declared prop clobber a reserved field', async () => {
    const lines: unknown[] = []
    await loggerAnalyticsSink(
      servicesLogging(lines),
      [{ name: 'page_viewed', props: { analytics: 'spoofed', userId: 'u2' } }],
      { userId: null }
    )
    assert.deepEqual(lines[0], { analytics: 'page_viewed', userId: null })
  })
})
