import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../../../inspector.js'
import type { InspectorLogger } from '../../../types.js'
import { deserializeDslWorkflow } from './deserialize-dsl-workflow.js'

function makeLogger(): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  } as any
}

const STEP_FILE = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const discount = pikkuSessionlessFunc({',
  '  func: async () => ({ amount: 1 }),',
  '})',
  'export const notifySales = pikkuSessionlessFunc({',
  '  func: async () => ({ ok: true }),',
  '})',
  'export const provision = pikkuSessionlessFunc({',
  '  func: async () => ({ ok: true }),',
  '})',
  'export const auditLog = pikkuSessionlessFunc({',
  '  func: async () => ({ ok: true }),',
  '})',
].join('\n')

/** Extract a workflow from source, then regenerate its code from the graph. */
async function roundTrip(body: string): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-rt-'))
  const stepFile = join(rootDir, 'w.steps.ts')
  const wfFile = join(rootDir, 'w.workflow.ts')
  await writeFile(stepFile, STEP_FILE)
  await writeFile(
    wfFile,
    [
      "import { pikkuWorkflowFunc } from '@pikku/core/workflow'",
      'export const wf = pikkuWorkflowFunc(async (_, data: any, { workflow }) => {',
      body,
      '})',
    ].join('\n')
  )
  try {
    const state: any = await inspect(makeLogger(), [stepFile, wfFile], {
      rootDir,
    })
    const gm = state.workflows.graphMeta
    const graph = (
      gm instanceof Map ? [...gm.values()] : Object.values(gm)
    )[0] as any
    assert.ok(graph, 'a graph should have been produced')
    return deserializeDslWorkflow(graph)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('DSL round-trip — code must survive graph regeneration', () => {
  test('every step inside an if-branch survives', async () => {
    const code = await roundTrip(
      [
        '  if (data.total > 100) {',
        "    await workflow.do('Apply discount', 'discount', {})",
        "    await workflow.do('Notify sales', 'notifySales', {})",
        '  }',
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(code.includes("'discount'"), 'first branch step should survive')
    assert.ok(
      code.includes("'notifySales'"),
      `second branch step must not be deleted, got:\n${code}`
    )
  })

  test('every step inside a switch case survives', async () => {
    const code = await roundTrip(
      [
        '  switch (data.kind) {',
        "    case 'premium':",
        "      await workflow.do('Provision premium', 'provision', {})",
        "      await workflow.do('Audit premium', 'auditLog', {})",
        '      break',
        '  }',
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(code.includes("'provision'"), 'first case step should survive')
    assert.ok(
      code.includes("'auditLog'"),
      `second case step must not be deleted, got:\n${code}`
    )
  })

  test('step names survive — they are the durable replay cache key', async () => {
    const code = await roundTrip(
      [
        "  await workflow.do('Apply discount', 'discount', {})",
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(
      code.includes("'Apply discount'"),
      `the authored step name must be preserved, got:\n${code}`
    )
    assert.ok(
      !code.includes("'Call discount'"),
      'the step must not be renamed to the Call <rpc> fallback'
    )
  })

  test('a suspend does not dead-end the graph and delete the steps after it', async () => {
    const code = await roundTrip(
      [
        "  await workflow.do('Create draft', 'discount', {})",
        "  await workflow.suspend('await legal review')",
        "  await workflow.do('Publish', 'notifySales', {})",
        '  return { ok: true }',
      ].join('\n')
    )

    assert.ok(code.includes("'discount'"), 'step before suspend should survive')
    assert.ok(
      code.includes("workflow.suspend('await legal review')"),
      `the suspend itself must be regenerated, got:\n${code}`
    )
    assert.ok(
      code.includes("'notifySales'"),
      `steps after a suspend must not be deleted, got:\n${code}`
    )
  })
})
