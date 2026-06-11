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
    critical: (code: any, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }
}

describe('addWorkflow — workflow.do RPC detection', () => {
  test('detects RPC step when result is assigned to a const', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-workflow-'))
    const wfFile = join(rootDir, 'my.workflow.ts')
    const stepFile = join(rootDir, 'my.steps.ts')

    await writeFile(
      stepFile,
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        'export const doThing = pikkuSessionlessFunc({',
        '  func: async ({ logger }) => ({ ok: true }),',
        '})',
      ].join('\n')
    )

    await writeFile(
      wfFile,
      [
        "import { pikkuWorkflowFunc } from '@pikku/core/workflow'",
        'export const myWorkflow = pikkuWorkflowFunc(async (_, _input, { workflow }) => {',
        "  const result = await workflow.do('Do thing', 'doThing', {})",
        '  return { id: result.ok }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [stepFile, wfFile], {
        rootDir,
      })
      assert.ok(
        state.rpc.invokedFunctions.has('doThing'),
        'doThing should be in invokedFunctions'
      )
      assert.ok(
        state.rpc.internalFiles.has('doThing'),
        'doThing should be in internalFiles'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('detects RPC step when result is reassigned to a pre-declared null variable', async () => {
    // Regression: `let x = null; x = await workflow.do(...)` was treated as a
    // set-step instead of an RPC step, so the referenced function was never registered.
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-workflow-reassign-'))
    const wfFile = join(rootDir, 'project.workflow.ts')
    const stepFile = join(rootDir, 'project.steps.ts')

    await writeFile(
      stepFile,
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        'export const launchSandbox = pikkuSessionlessFunc({',
        '  func: async ({ logger }) => ({ sandboxId: "abc" }),',
        '})',
      ].join('\n')
    )

    await writeFile(
      wfFile,
      [
        "import { pikkuWorkflowFunc } from '@pikku/core/workflow'",
        'export const createProjectWorkflow = pikkuWorkflowFunc(async (_, input, { workflow }) => {',
        '  let launched: { sandboxId: string } | null = null',
        '  if (input.createSandbox) {',
        "    launched = await workflow.do('Launch sandbox', 'launchSandbox', { projectId: input.projectId })",
        '  }',
        '  return { sandboxId: launched?.sandboxId ?? null }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [stepFile, wfFile], {
        rootDir,
      })
      assert.ok(
        state.rpc.invokedFunctions.has('launchSandbox'),
        'launchSandbox should be in invokedFunctions even when assigned to a pre-declared null variable'
      )
      assert.ok(
        state.rpc.internalFiles.has('launchSandbox'),
        'launchSandbox should be in internalFiles so it gets registered in pikku-functions.gen.ts'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('still treats plain reassignment to context var as a set step', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-workflow-set-'))
    const wfFile = join(rootDir, 'set.workflow.ts')

    await writeFile(
      wfFile,
      [
        "import { pikkuWorkflowFunc } from '@pikku/core/workflow'",
        'export const setWorkflow = pikkuWorkflowFunc(async (_, input, { workflow }) => {',
        '  let status = "pending"',
        '  status = "done"',
        "  await workflow.do('No-op', 'noopStep', {})",
        '  return { status }',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [wfFile], { rootDir })
      const meta = state.workflows.meta['setWorkflow']
      assert.ok(meta, 'workflow should be registered')
      const steps = meta.steps ?? []
      const setStep = steps.find(
        (s: any) => s.type === 'set' && s.variable === 'status'
      )
      assert.ok(
        setStep,
        'plain string reassignment should still produce a set step'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
