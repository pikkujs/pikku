import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

import type { AnalyticsEventMeta } from '@pikku/core/analytics'

import { createScriptContent, ingestText } from './script-content.js'

const content = createScriptContent(
  fileURLToPath(new URL('../.pikku-runtime/script-content', import.meta.url))
)
const readGenerated = async (relative: string) =>
  ingestText(content, fileURLToPath(new URL(relative, import.meta.url)))

/**
 * The console's event catalog is built from this file and nothing else: it is
 * the declared surface a client may emit, read at build time rather than
 * counted at runtime. A generator that stops emitting `props` still produces a
 * valid ingest and an empty catalog, which is why the shape is pinned here
 * rather than left to the ingest tests above.
 */
const meta: Record<string, AnalyticsEventMeta> = JSON.parse(
  await readGenerated('../.pikku/analytics/pikku-analytics-meta.gen.json')
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

const functions: Record<string, { tags?: string[] }> = JSON.parse(
  await readGenerated(
    '../.pikku/function/pikku-functions-meta-verbose.gen.json'
  )
)

describe('the scaffolded ingest', () => {
  test("is tagged as pikku's own, so the console lists it as built-in", () => {
    assert.deepEqual(functions.analyticsIngest?.tags, ['pikku', 'analytics'])
  })
})
