import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

function makeLogger(
  criticals: Array<{ code: string; message: string }>
): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }: any) => {
      criticals.push({ code, message })
    },
    critical: (code: any, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  } as InspectorLogger
}

const SCENARIOS = [
  "import { pikkuScenario } from '@pikku/core/workflow'",
  'export const lazyLoadScenario = pikkuScenario({',
  "  title: 'A credential is loaded on first use',",
  "  tags: ['credential'],",
  '  func: async () => ({ ok: true }),',
  '})',
  'export const roundTripScenario = pikkuScenario({',
  "  title: 'A credential round-trips',",
  '  func: async (_services, _data: { name: string }) => ({ ok: true }),',
  '})',
].join('\n')

async function run(featureSource: string) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-feature-'))
  const scenarioFile = join(rootDir, 'credential.scenario.ts')
  const featureFile = join(rootDir, 'credential.feature.ts')
  await writeFile(scenarioFile, SCENARIOS)
  await writeFile(featureFile, featureSource)
  const criticals: Array<{ code: string; message: string }> = []
  const state = await inspect(
    makeLogger(criticals),
    [scenarioFile, featureFile],
    { rootDir }
  )
  return {
    state,
    criticals,
    featureFile,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  }
}

describe('addFeature', () => {
  test('records where a feature is exported from', async () => {
    const { state, criticals, featureFile, cleanup } = await run(
      [
        "import { pikkuFeature } from '@pikku/core/workflow'",
        "import { lazyLoadScenario } from './credential.scenario.js'",
        'export const credentialFeature = pikkuFeature({',
        "  name: 'Credential API',",
        "  tags: ['credential'],",
        '  scenarios: [lazyLoadScenario],',
        '})',
      ].join('\n')
    )
    try {
      assert.deepEqual(criticals, [])
      assert.deepEqual(
        [...state.workflows.featureFiles.entries()],
        [
          [
            'credentialFeature',
            { path: featureFile, exportedName: 'credentialFeature' },
          ],
        ]
      )
    } finally {
      await cleanup()
    }
  })

  test('a feature built by a loop is recorded like any other', async () => {
    // The reason membership is resolved at runtime: this scenarios array cannot
    // be enumerated statically, and recording the feature must not depend on it.
    const { state, criticals, cleanup } = await run(
      [
        "import { pikkuFeature } from '@pikku/core/workflow'",
        "import { lazyLoadScenario, roundTripScenario } from './credential.scenario.js'",
        'export const credentialFeature = pikkuFeature({',
        "  name: 'Credential API',",
        '  scenarios: [',
        '    lazyLoadScenario,',
        "    ...['stripe', 'google'].map((name) => ({",
        '      scenario: roundTripScenario,',
        '      data: { name },',
        '    })),',
        '  ],',
        '})',
      ].join('\n')
    )
    try {
      assert.deepEqual(criticals, [])
      assert.deepEqual(
        [...state.workflows.featureFiles.keys()],
        ['credentialFeature']
      )
    } finally {
      await cleanup()
    }
  })

  test('several features in one file are all recorded', async () => {
    const { state, criticals, cleanup } = await run(
      [
        "import { pikkuFeature } from '@pikku/core/workflow'",
        "import { lazyLoadScenario, roundTripScenario } from './credential.scenario.js'",
        "export const readFeature = pikkuFeature({ name: 'Read', scenarios: [lazyLoadScenario] })",
        "export const writeFeature = pikkuFeature({ name: 'Write', scenarios: [roundTripScenario] })",
      ].join('\n')
    )
    try {
      assert.deepEqual(criticals, [])
      assert.deepEqual(
        [...state.workflows.featureFiles.keys()],
        ['readFeature', 'writeFeature']
      )
    } finally {
      await cleanup()
    }
  })

  test('a feature that is not exported is a critical error', async () => {
    const { state, criticals, cleanup } = await run(
      [
        "import { pikkuFeature } from '@pikku/core/workflow'",
        "import { lazyLoadScenario } from './credential.scenario.js'",
        "const credentialFeature = pikkuFeature({ name: 'Credential API', scenarios: [lazyLoadScenario] })",
        'void credentialFeature',
      ].join('\n')
    )
    try {
      assert.equal(state.workflows.featureFiles.size, 0)
      assert.equal(criticals.length, 1)
      assert.match(criticals[0]!.message, /must be assigned to an export/)
    } finally {
      await cleanup()
    }
  })

  test('a project with no features records none', async () => {
    const { state, criticals, cleanup } = await run(
      "export const nothing = 'here'\n"
    )
    try {
      assert.deepEqual(criticals, [])
      assert.equal(state.workflows.featureFiles.size, 0)
    } finally {
      await cleanup()
    }
  })
})
