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
    diagnostic: ({ code, message }) => {
      criticals.push({ code, message })
    },
    critical: (code: any, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }
}

const stepFile = (dir: string) => join(dir, 'my.steps.ts')
const stepSource = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const getTodos = pikkuSessionlessFunc({',
  '  func: async ({ logger }) => [{ done: true }],',
  '})',
].join('\n')

describe('scenarios may only destructure logger/config', () => {
  test('a scenario destructuring a real service is a PKU673 critical', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-sc-svc-'))
    const scenarioFile = join(rootDir, 'my.scenario.ts')
    await writeFile(stepFile(rootDir), stepSource)
    await writeFile(
      scenarioFile,
      [
        "import { pikkuScenario } from '@pikku/core/workflow'",
        'declare const actors: Record<string, any>',
        'export const badFlow = pikkuScenario(async ({ kysely }: any, _input, { workflow }) => {',
        "  await workflow.do('Read todos', 'getTodos', {}, { actor: actors.pm })",
        '  return { ok: true }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [stepFile(rootDir), scenarioFile], {
        rootDir,
      })
      const pku673 = criticals.find((c) => c.code === 'PKU673')
      assert.ok(
        pku673,
        `expected a PKU673 critical for a scenario destructuring 'kysely', got: ${JSON.stringify(criticals)}`
      )
      assert.ok(
        pku673.message.includes('kysely'),
        `PKU673 should name the offending service, got: ${pku673.message}`
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('a scenario destructuring only logger is allowed', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-sc-ok-'))
    const scenarioFile = join(rootDir, 'my.scenario.ts')
    await writeFile(stepFile(rootDir), stepSource)
    await writeFile(
      scenarioFile,
      [
        "import { pikkuScenario } from '@pikku/core/workflow'",
        'declare const actors: Record<string, any>',
        'export const goodFlow = pikkuScenario(async ({ logger }, _input, { workflow }) => {',
        "  await workflow.do('Read todos', 'getTodos', {}, { actor: actors.pm })",
        '  return { ok: true }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      const state = await inspect(
        makeLogger(criticals),
        [stepFile(rootDir), scenarioFile],
        { rootDir }
      )
      assert.ok(
        !criticals.some((c) => c.code === 'PKU673'),
        `logger is allowed in a scenario; got: ${JSON.stringify(criticals)}`
      )
      assert.equal((state.workflows.meta as any).goodFlow?.scenario, true)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
