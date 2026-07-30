import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'
import {
  SCENARIO_INSTRUMENTATION_FUNCTIONS,
  isScenarioInstrumentationFunction,
} from './scenario-instrumentation.js'

const silentLogger: InspectorLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
}

describe('scenario instrumentation', () => {
  test('recognises the instrumentation names, including versioned ids', () => {
    for (const name of SCENARIO_INSTRUMENTATION_FUNCTIONS) {
      assert.ok(isScenarioInstrumentationFunction(name), name)
      assert.ok(isScenarioInstrumentationFunction(`${name}@v2`), `${name}@v2`)
    }
    assert.ok(!isScenarioInstrumentationFunction('createUser'))
    assert.ok(!isScenarioInstrumentationFunction(undefined))
  })

  test('a project still carrying the retired scaffold registers none of it', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-scenario-instr-'))
    const file = join(rootDir, 'scenarios.gen.ts')

    // What `scaffold.scenarios` used to write into the project. Whatever a
    // project has checked in, none of it may reach the app's meta or RPC surface:
    // `pikku dev` registers the real implementations itself.
    await writeFile(
      file,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const pikkuScenarioTakeLiveCoverage = pikkuFunc({',
        "  tags: ['pikku'],",
        '  expose: true,',
        '  auth: true,',
        '  func: async () => null,',
        '})',
        'export const pikkuScenarioResetStubs = pikkuFunc({',
        "  tags: ['pikku'],",
        '  expose: true,',
        '  auth: true,',
        '  func: async () => ({ enabled: true }),',
        '})',
        'export const createUser = pikkuFunc({',
        '  expose: true,',
        '  func: async () => ({ ok: true }),',
        '})',
      ].join('\n')
    )

    try {
      const state = await inspect(silentLogger, [file], { rootDir })

      for (const name of SCENARIO_INSTRUMENTATION_FUNCTIONS) {
        assert.ok(
          !(name in state.functions.meta),
          `${name} must not be in the app function meta`
        )
        assert.ok(
          !(name in state.rpc.internalMeta),
          `${name} must not be in the internal RPC meta`
        )
        assert.ok(
          !(name in state.rpc.exposedMeta),
          `${name} must not be exposed`
        )
      }

      // The application function in the same file is untouched — the drop is by
      // name, not by file.
      assert.ok(state.functions.meta['createUser'])
      assert.strictEqual(state.rpc.exposedMeta['createUser'], 'createUser')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
