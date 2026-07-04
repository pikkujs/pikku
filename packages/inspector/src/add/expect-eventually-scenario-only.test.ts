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

describe('expectEventually is scenario-only', () => {
  test('pikkuWorkflowFunc calling expectEventually is a critical error pointing at pikkuScenario', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-ee-wf-'))
    const wfFile = join(rootDir, 'my.workflow.ts')
    await writeFile(stepFile(rootDir), stepSource)
    await writeFile(
      wfFile,
      [
        "import { pikkuWorkflowFunc } from '@pikku/core/workflow'",
        'export const badWorkflow = pikkuWorkflowFunc(async (_, _input, { workflow }) => {',
        "  await workflow.expectEventually('Wait', 'getTodos', {}, (todos: any) => todos.length > 0)",
        '  return { ok: true }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [stepFile(rootDir), wfFile], {
        rootDir,
      })
      const pku675 = criticals.find((c) => c.code === 'PKU675')
      assert.ok(
        pku675,
        `expected a PKU675 critical, got: ${JSON.stringify(criticals)}`
      )
      assert.ok(
        pku675.message.includes('pikkuScenario'),
        `PKU675 should point users at pikkuScenario, got: ${pku675.message}`
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('pikkuScenario calling expectEventually is allowed and flagged as a scenario', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-ee-sc-'))
    const wfFile = join(rootDir, 'my.scenario.ts')
    await writeFile(stepFile(rootDir), stepSource)
    await writeFile(
      wfFile,
      [
        "import { pikkuScenario } from '@pikku/core/workflow'",
        'declare const actors: Record<string, any>',
        'export const goodFlow = pikkuScenario(async (_, _input, { workflow }) => {',
        "  await workflow.expectEventually('Wait', 'getTodos', {}, (todos: any) => todos.length > 0, { actor: actors.pm })",
        '  return { ok: true }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      const state = await inspect(
        makeLogger(criticals),
        [stepFile(rootDir), wfFile],
        { rootDir }
      )
      assert.ok(
        !criticals.some((c) => c.code === 'PKU675'),
        `scenarios may use expectEventually; got: ${JSON.stringify(criticals)}`
      )
      const meta = (state.workflows.meta as any).goodFlow
      assert.ok(meta, 'pikkuScenario export should register a workflow')
      assert.equal(
        meta.scenario,
        true,
        `scenario meta flag should be true, got: ${JSON.stringify(meta)}`
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
