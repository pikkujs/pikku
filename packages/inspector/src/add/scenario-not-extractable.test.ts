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

const STEPS = [
  "import { pikkuScenarioStep } from '@pikku/core'",
  'export const buysAnApple = pikkuScenarioStep({',
  "  name: 'buysAnApple',",
  "  description: 'buys an apple',",
  '  func: async ({ logger }, data: { qty: number }) => ({ ok: data.qty > 0 }),',
  '})',
].join('\n')

const source = (wrapper: string, body: string[]) =>
  [
    `import { ${wrapper} } from '@pikku/core/workflow'`,
    'declare const actors: Record<string, any>',
    `export const shopFlow = ${wrapper}(async (_services, _input, { scenario, workflow }: any) => {`,
    ...body.map((line) => `  ${line}`),
    '  return { ok: true }',
    '})',
  ].join('\n')

async function run(wrapper: string, body: string[]) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-scenario-extract-'))
  const stepsFile = join(rootDir, 'shop.steps.ts')
  const scenarioFile = join(rootDir, 'shop.scenario.ts')
  await writeFile(stepsFile, STEPS)
  await writeFile(scenarioFile, source(wrapper, body))
  const criticals: Array<{ code: string; message: string }> = []
  const state = await inspect(
    makeLogger(criticals),
    [stepsFile, scenarioFile],
    {
      rootDir,
    }
  )
  return {
    state,
    criticals,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  }
}

/**
 * A scenario that fails DSL extraction silently registers with zero steps,
 * because the fallback path (`getWorkflowInvocations`) understands `do`/`sleep`
 * but not `step`/`given`/`when`/`then`. That is the PKU678 silent-drop class,
 * and for scenarios it must be loud.
 */
describe('a scenario that cannot be extracted', () => {
  test('a top-level try/catch is a PKU679 critical, not a silent zero-step scenario', async () => {
    const { state, criticals, cleanup } = await run('pikkuScenario', [
      'try {',
      "  await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
      '} catch {}',
    ])
    try {
      assert.equal(
        state.workflows.meta.shopFlow,
        undefined,
        'an unextractable scenario must not register at all, rather than register empty'
      )
      assert.ok(
        criticals.find((c) => c.code === 'PKU679'),
        `expected a PKU679 critical for an unextractable scenario, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('an extractable scenario raises no PKU679', async () => {
    const { criticals, cleanup } = await run('pikkuScenario', [
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
    ])
    try {
      assert.equal(
        criticals.filter((c) => c.code === 'PKU679').length,
        0,
        `a valid scenario must not raise PKU679, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a scenario that declares no input parameter is still extractable', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-scenario-noinput-'))
    const scenarioFile = join(rootDir, 'fails.scenario.ts')
    await writeFile(
      scenarioFile,
      [
        "import { pikkuScenario } from '@pikku/core/workflow'",
        'export const alwaysFails = pikkuScenario({',
        "  title: 'Always fails (test fixture)',",
        "  tags: ['scenario'],",
        "  func: async () => { throw new Error('always fails') },",
        '})',
      ].join('\n')
    )
    const criticals: Array<{ code: string; message: string }> = []
    const state = await inspect(makeLogger(criticals), [scenarioFile], {
      rootDir,
    })
    try {
      assert.ok(
        state.workflows.meta.alwaysFails,
        `a scenario that ignores its input must still register, got criticals: ${JSON.stringify(criticals)}`
      )
      assert.equal(
        criticals.filter((c) => c.code === 'PKU679').length,
        0,
        `declaring no input parameter is legitimate, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('a complex workflow still falls back quietly — only scenarios are strict', async () => {
    const { criticals, cleanup } = await run('pikkuWorkflowComplexFunc', [
      'try {',
      "  await workflow.do('buy', 'buysAnApple', { qty: 1 })",
      '} catch {}',
    ])
    try {
      assert.equal(
        criticals.filter((c) => c.code === 'PKU679').length,
        0,
        `pikkuWorkflowComplexFunc legitimately falls back to basic extraction, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })
})
