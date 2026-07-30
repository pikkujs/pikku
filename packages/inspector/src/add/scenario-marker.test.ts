/**
 * The `scenario` / `scenarioStep` markers in the *function* meta are what every
 * deployment boundary downstream reads: the codegen partition, the RPC meta
 * filter, the schema split and the deploy analyzer. Asserting them on a real
 * `pikkuScenario(...)` is what makes those filters mean anything — filters tested
 * against hand-written meta would keep passing if extraction stopped setting it.
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

const APP = [
  "import { pikkuFunc } from '@pikku/core'",
  'export const createTodo = pikkuFunc({',
  '  expose: true,',
  '  func: async (_services, data: { title: string }) => ({ id: data.title }),',
  '})',
].join('\n')

const SCENARIO = [
  "import { pikkuScenario } from '@pikku/core/workflow'",
  'export const shopFlow = pikkuScenario({',
  "  title: 'Buys an apple',",
  '  func: async (_services, _input, { scenario }: any) => {',
  "    await scenario.when('buys an apple', 'buysAnApple', { qty: 1 })",
  '    return { ok: true }',
  '  },',
  '})',
].join('\n')

describe('scenario markers in the function meta', () => {
  test('a real pikkuScenario and pikkuScenarioStep are marked, an application function is not', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-scenario-marker-'))
    const files = [
      [join(rootDir, 'shop.steps.ts'), STEPS],
      [join(rootDir, 'shop.scenario.ts'), SCENARIO],
      [join(rootDir, 'todo.function.ts'), APP],
    ] as const
    await Promise.all(files.map(([path, source]) => writeFile(path, source)))

    try {
      const state = await inspect(
        logger,
        files.map(([path]) => path),
        { rootDir }
      )

      const scenario = state.functions.meta['shopFlow']
      assert.ok(scenario, 'the scenario body is a function and must have meta')
      assert.equal(scenario.scenario, true)
      assert.equal(scenario.scenarioStep, undefined)

      const step = state.functions.meta['buysAnApple']
      assert.ok(step)
      assert.equal(step.scenarioStep, true)
      assert.equal(step.scenario, undefined)

      const app = state.functions.meta['createTodo']
      assert.ok(app)
      assert.equal(app.scenario, undefined)
      assert.equal(app.scenarioStep, undefined)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
