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
      'billing-analytics.ts': declaration('billingEvents', [
        'checkout_completed',
      ]),
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

  // The import is the project's to name, and a harness or a codemod renaming
  // it is not a reason to stop finding the declaration.
  test('finds the call through an aliased import', async () => {
    const { state, errors } = await inspectSources({
      'analytics.ts':
        `import { defineAnalyticsEvents as declare } from '@pikku/core/analytics'\n` +
        `export const analyticsEvents = declare({ page_viewed: {} as never })\n`,
    })

    assert.deepEqual(errors, [])
    assert.deepEqual(
      state.analytics?.map((declaration) => declaration.events),
      [['page_viewed']]
    )
  })

  // `{ page_viewed }` is the same declaration as `{ page_viewed: page_viewed }`,
  // and dropping it emitted an ingest missing the event.
  test('collects an event written in shorthand', async () => {
    const { state, errors } = await inspectSources({
      'analytics.ts':
        `import { defineAnalyticsEvents } from '@pikku/core/analytics'\n` +
        `const page_viewed = {} as never\n` +
        `export const analyticsEvents = defineAnalyticsEvents({ page_viewed, todo_created: {} as never })\n`,
    })

    assert.deepEqual(errors, [])
    assert.deepEqual(
      state.analytics?.map((declaration) => declaration.events),
      [['page_viewed', 'todo_created']]
    )
  })

  // The generated ingest imports the declaration by name, so recording one the
  // module keeps to itself emits a module that cannot compile.
  test('refuses a declaration the module does not export', async () => {
    const { state, errors } = await inspectSources({
      'analytics.ts':
        `import { defineAnalyticsEvents } from '@pikku/core/analytics'\n` +
        `const analyticsEvents = defineAnalyticsEvents({ page_viewed: {} as never })\n` +
        `export const used = () => analyticsEvents\n`,
    })

    assert.equal(state.analytics, undefined)
    assert.match(errors[0]!, /does not export/)
  })

  // `export { analyticsEvents as usage }` is the name the import has to say.
  test('records the name the module exports it under', async () => {
    const { state } = await inspectSources({
      'analytics.ts':
        `import { defineAnalyticsEvents } from '@pikku/core/analytics'\n` +
        `const analyticsEvents = defineAnalyticsEvents({ page_viewed: {} as never })\n` +
        `export { analyticsEvents as usage }\n`,
    })

    assert.equal(state.analytics?.[0]!.variable, 'usage')
  })

  // The mirror of the alias case: matching on the callee's text alone misses a
  // renamed import, and matching on the resolved symbol's name alone claims a
  // local helper that merely shares the name.
  // What a project actually writes: the definer is re-exported through the
  // generated leaf, so the specifier the inspector meets is `#pikku/analytics`
  // and not core's own path.
  test('finds the declaration through the generated leaf', async () => {
    const { state } = await inspectSources({
      'analytics.ts':
        "import { defineAnalyticsEvents } from '#pikku/analytics'\n" +
        'export const analyticsEvents = defineAnalyticsEvents({ page_viewed: {} as never })\n',
    })

    assert.equal(state.analytics?.[0]?.variable, 'analyticsEvents')
    assert.deepEqual(state.analytics?.[0]?.events, ['page_viewed'])
  })

  test('leaves a same-named local helper alone', async () => {
    const { state } = await inspectSources({
      'analytics.ts':
        'const defineAnalyticsEvents = (events: Record<string, unknown>) => events\n' +
        'export const analyticsEvents = defineAnalyticsEvents({ page_viewed: {} })\n',
    })

    assert.equal(state.analytics, undefined)
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
