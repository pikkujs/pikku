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

const declaration = (variable = 'analytics') =>
  `import { pikkuAnalytics } from '@pikku/core/analytics'\n` +
  `export const ${variable} = pikkuAnalytics({ events: {} as never })\n`

describe('addAnalytics', () => {
  // The CLI generates an ingest that imports this declaration by name, so
  // where it is and what it is called is the whole of what has to be found.
  test('records the file and the exported name', async () => {
    const { state, files } = await inspectSources({
      'analytics.ts': declaration('usage'),
    })

    assert.deepEqual(state.analytics, {
      file: files[0]!,
      variable: 'usage',
    })
  })

  test('leaves analytics unset when nothing declares it', async () => {
    const { state } = await inspectSources({
      'other.ts': `export const notAnalytics = { events: {} }\n`,
    })

    assert.equal(state.analytics, undefined)
  })

  // There is one ingest route, so a second union would silently lose to
  // whichever file happened to be visited first.
  test('refuses a second declaration rather than picking one', async () => {
    const { errors } = await inspectSources({
      'analytics.ts': declaration(),
      'more-analytics.ts': declaration('extra'),
    })

    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /more than one pikkuAnalytics/)
  })
})
