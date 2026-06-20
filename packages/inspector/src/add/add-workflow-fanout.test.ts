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

const STEP_FILE = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const processEventLeadsStep = pikkuSessionlessFunc({',
  '  func: async ({ logger }) => ({ persistedCount: 1 }),',
  '})',
].join('\n')

describe('addWorkflow — Promise.all fanout RPC detection', () => {
  test('registers fanout RPC when captured with `const x = await Promise.all(map(...))`', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-fanout-const-'))
    const wfFile = join(rootDir, 'leads.workflow.ts')
    const stepFile = join(rootDir, 'leads.steps.ts')

    await writeFile(stepFile, STEP_FILE)
    await writeFile(
      wfFile,
      [
        "import { pikkuWorkflowFunc } from '@pikku/core/workflow'",
        'export const extractLeadsWorkflow = pikkuWorkflowFunc(async (_, data, { workflow }) => {',
        '  const events = [{ id: "a", name: "x" }]',
        '  const processed = await Promise.all(',
        '    events.map((event) =>',
        "      workflow.do(`Enrich event ${event.id ?? event.name}`, 'processEventLeadsStep', { event })",
        '    )',
        '  )',
        '  return { count: processed.length }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [stepFile, wfFile], {
        rootDir,
      })
      assert.ok(
        state.rpc.invokedFunctions.has('processEventLeadsStep'),
        'processEventLeadsStep should be registered when fanout is captured with const'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('registers fanout RPC with string-concatenation (`+`) step name, same as template literal', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-fanout-concat-'))
    const wfFile = join(rootDir, 'leads.workflow.ts')
    const stepFile = join(rootDir, 'leads.steps.ts')

    await writeFile(stepFile, STEP_FILE)
    await writeFile(
      wfFile,
      [
        "import { pikkuWorkflowFunc } from '@pikku/core/workflow'",
        'export const extractLeadsWorkflow = pikkuWorkflowFunc(async (_, data, { workflow }) => {',
        '  const events = [{ id: "a", name: "x" }]',
        '  await Promise.all(',
        '    events.map((event) =>',
        "      workflow.do('Enrich event ' + (event.id ?? event.name), 'processEventLeadsStep', { event })",
        '    )',
        '  )',
        '  return { ok: true }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [stepFile, wfFile], {
        rootDir,
      })
      assert.ok(
        state.rpc.invokedFunctions.has('processEventLeadsStep'),
        'processEventLeadsStep should be registered even when the step name uses `+` concatenation with a non-static operand'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
