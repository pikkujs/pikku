/**
 * A scenario can declare why it is held out of a default run. The reason has to
 * reach the meta, because the runner reports skips from there — if it were
 * dropped in extraction the scenario would silently run anyway, which is the
 * opposite of what the author asked for.
 */
import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
} as unknown as InspectorLogger

const STEPS = [
  "import { pikkuScenarioStep } from '@pikku/core'",
  'export const buysAnApple = pikkuScenarioStep({',
  "  name: 'buysAnApple',",
  "  description: 'buys an apple',",
  '  func: async ({ logger }, data: { qty: number }) => ({ ok: data.qty > 0 }),',
  '})',
].join('\n')

const scenarioSource = (properties: string[]) =>
  [
    "import { pikkuScenario } from '@pikku/core/workflow'",
    'export const shopFlow = pikkuScenario({',
    ...properties.map((line) => `  ${line}`),
    '  func: async (_services, _input, { scenario }: any) => {',
    "    await scenario.when('buys an apple', 'buysAnApple', { qty: 1 })",
    '    return { ok: true }',
    '  },',
    '})',
  ].join('\n')

async function inspectScenario(properties: string[]) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-scenario-skip-'))
  const stepsFile = join(rootDir, 'shop.steps.ts')
  const scenarioFile = join(rootDir, 'shop.scenario.ts')
  await writeFile(stepsFile, STEPS)
  await writeFile(scenarioFile, scenarioSource(properties))
  const state = await inspect(logger, [stepsFile, scenarioFile], { rootDir })
  return {
    meta: state.workflows.meta['shopFlow'] as any,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  }
}

describe('scenario skip', () => {
  test('a declared skip reason reaches the meta', async () => {
    const { meta, cleanup } = await inspectScenario([
      "title: 'Installs an addon',",
      "skip: 'mutates the project — needs a fresh server',",
    ])
    try {
      assert.equal(meta.skip, 'mutates the project — needs a fresh server')
    } finally {
      await cleanup()
    }
  })

  test('a scenario that declares none carries none', async () => {
    const { meta, cleanup } = await inspectScenario([
      "title: 'Installs an addon',",
    ])
    try {
      assert.equal(meta.skip, undefined)
      assert.equal(meta.scenario, true)
    } finally {
      await cleanup()
    }
  })
})
