import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (errors: string[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string) => {
      errors.push(message)
    },
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  }) as unknown as InspectorLogger

const inspectSources = async (sources: Record<string, string>) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-analytics-'))
  const files: string[] = []
  for (const [name, source] of Object.entries(sources)) {
    const file = join(rootDir, name)
    await writeFile(file, source)
    files.push(file)
  }
  const errors: string[] = []
  try {
    const state = await inspect(makeLogger(errors), files, { rootDir })
    return { state, errors, files }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const declaration = (
  variable = 'analyticsEvents',
  events: string[] = ['page_viewed']
) =>
  `import { defineAnalyticsEvents } from '@pikku/core/analytics'\n` +
  `export const ${variable} = defineAnalyticsEvents({ ` +
  events.map((event) => `${event}: {} as never`).join(', ') +
  ` })\n`

describe('addAnalytics', () => {
  // The CLI generates an ingest that imports each declaration by name and
  // unions the keys, so where it is, what it is called and which names it
  // declares is the whole of what has to be found.
  test('records the file, the exported name and the event names', async () => {
    const { state, files } = await inspectSources({
      'analytics.ts': declaration('usage', ['page_viewed', 'todo_created']),
    })

    assert.deepEqual(state.analytics, [
      {
        file: files[0]!,
        variable: 'usage',
        events: ['page_viewed', 'todo_created'],
      },
    ])
  })

  test('leaves analytics unset when nothing declares it', async () => {
    const { state } = await inspectSources({
      'other.ts': `export const notAnalytics = { page_viewed: {} }\n`,
    })

    assert.equal(state.analytics, undefined)
  })

  // A feature module declares its own events beside its own functions, and the
  // generator unions them.
  test('collects declarations from several modules', async () => {
    const { state, errors } = await inspectSources({
      'analytics.ts': declaration('appEvents', ['page_viewed']),
      'billing-analytics.ts': declaration('billingEvents', ['checkout_completed']),
    })

    assert.deepEqual(errors, [])
    assert.deepEqual(
      state.analytics?.flatMap((declaration) => declaration.events).sort(),
      ['checkout_completed', 'page_viewed']
    )
  })

  // One of the two schemas would silently lose.
  test('refuses the same event name in two declarations', async () => {
    const { errors } = await inspectSources({
      'analytics.ts': declaration('appEvents', ['page_viewed']),
      'more-analytics.ts': declaration('extraEvents', ['page_viewed']),
    })

    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /declared twice/)
  })

  test('refuses a declaration that is not an object literal', async () => {
    const { errors, state } = await inspectSources({
      'analytics.ts':
        `import { defineAnalyticsEvents } from '@pikku/core/analytics'\n` +
        `const events = {} as never\n` +
        `export const analyticsEvents = defineAnalyticsEvents(events)\n`,
    })

    assert.equal(state.analytics, undefined)
    assert.match(errors[0]!, /object literal/)
  })

  test('refuses a declaration with no events', async () => {
    const { errors, state } = await inspectSources({
      'analytics.ts':
        `import { defineAnalyticsEvents } from '@pikku/core/analytics'\n` +
        `export const analyticsEvents = defineAnalyticsEvents({})\n`,
    })

    assert.equal(state.analytics, undefined)
    assert.match(errors[0]!, /declares no events/)
  })
})
