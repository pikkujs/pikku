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

describe('expectEventually is user-flow-only', () => {
  test('pikkuWorkflowFunc calling expectEventually is a critical error', async () => {
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
      assert.ok(
        criticals.some((c) => c.code === 'PKU675'),
        `expected a PKU675 critical, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('pikkuUserFlow calling expectEventually is allowed', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-ee-uf-'))
    const wfFile = join(rootDir, 'my.userflow.ts')
    await writeFile(stepFile(rootDir), stepSource)
    await writeFile(
      wfFile,
      [
        "import { pikkuUserFlow } from '@pikku/core/workflow'",
        'declare const actors: Record<string, any>',
        'export const goodFlow = pikkuUserFlow(async (_, _input, { workflow }) => {',
        "  await workflow.expectEventually('Wait', 'getTodos', {}, (todos: any) => todos.length > 0, { actor: actors.pm })",
        '  return { ok: true }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [stepFile(rootDir), wfFile], {
        rootDir,
      })
      assert.ok(
        !criticals.some((c) => c.code === 'PKU675'),
        `user flows may use expectEventually; got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
