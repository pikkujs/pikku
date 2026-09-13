import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

import type { AnalyticsEventMeta } from '@pikku/core/analytics'

/**
 * The console's event catalog is built from this file and nothing else: it is
 * the declared surface a client may emit, read at build time rather than
 * counted at runtime. A generator that stops emitting `props` still produces a
 * valid ingest and an empty catalog, which is why the shape is pinned here
 * rather than left to the ingest tests above.
 */
const meta: Record<string, AnalyticsEventMeta> = JSON.parse(
  readFileSync(
    new URL(
      '../.pikku/analytics/pikku-analytics-meta.gen.json',
      import.meta.url
    ),
    'utf-8'
  )
)

describe('the generated analytics meta', () => {
  test('records every declared event, keyed by its name', () => {
    assert.deepEqual(Object.keys(meta).sort(), [
      'checkout_completed',
      'page_viewed',
      'profile_renamed',
    ])
  })

  test('repeats the name inside the entry, so a row survives being iterated', () => {
    for (const [key, event] of Object.entries(meta)) {
      assert.equal(event.name, key)
    }
  })

  test('names the declaring variable and the file it lives in', () => {
    const event = meta.page_viewed!

    assert.equal(event.variable, 'analyticsEvents')
    assert.ok(
      event.file.endsWith('/src/analytics.ts'),
      `expected a path to the declaration, got ${event.file}`
    )
  })

  test('carries every prop as the schema source text the declaration wrote', () => {
    assert.deepEqual(meta.checkout_completed!.props, {
      amount: 'z.number()',
      currency: 'z.string().length(3)',
    })
  })

  test('keeps a validator that is not a bare type, so the catalog shows the constraint', () => {
    assert.equal(meta.page_viewed!.props!.path, 'z.string().max(512)')
  })

  // `name` is the union's discriminator. A props schema declaring its own must
  // still appear in the catalog as a prop, or the console shows an event whose
  // payload it cannot describe.
  test('lists a prop named `name` alongside the discriminator', () => {
    assert.deepEqual(meta.profile_renamed!.props, {
      name: 'z.string().max(120)',
      by: 'z.string()',
    })
  })
})
