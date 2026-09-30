import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'
import { deserializeDslWorkflow } from '../utils/workflow/dsl/deserialize-dsl-workflow.js'

const STEP_FILE = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const chargeCard = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'c' }),",
  '  compensate: async (_services, _data, { workflow }) => {',
  '    void workflow?.compensatingFor',
  '  },',
  '})',
  'export const sendReceipt = pikkuSessionlessFunc({',
  "  func: async () => ({ id: 'r' }),",
  '})',
].join('\n')

async function inspectWorkflow(body: string) {
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  } as unknown as InspectorLogger

  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-comp-'))
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
    const state: any = await inspect(logger, [stepFile, wfFile], { rootDir })
    const gm = state.workflows.graphMeta
    const graph = (
      gm instanceof Map ? [...gm.values()] : Object.values(gm)
    )[0] as any
    assert.ok(graph, 'a graph should have been produced')
    return {
      state,
      nodes: graph.nodes as Record<string, any>,
      code: deserializeDslWorkflow(graph),
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('compensate — the inspector', () => {
  test('a function declaring compensate is marked so in its meta', async () => {
    const { state } = await inspectWorkflow(
      "  await workflow.do('Charge', 'chargeCard', {})\n  return { ok: true }"
    )
    assert.equal(state.functions.meta['chargeCard'].compensate, true)
    assert.ok(!state.functions.meta['sendReceipt'].compensate)
  })

  test('a call site can opt out with compensate: false, and it round-trips', async () => {
    const { nodes, code } = await inspectWorkflow(
      [
        "  await workflow.do('Charge', 'chargeCard', {}, { compensate: false })",
        '  return { ok: true }',
      ].join('\n')
    )
    const charge = Object.values(nodes).find((n) => n.rpcName === 'chargeCard')
    assert.equal(charge?.compensate, false)
    assert.ok(code.includes('compensate: false'), code)
  })

  test('workflow.milestone becomes a milestone flow node and round-trips', async () => {
    const { nodes, code } = await inspectWorkflow(
      [
        "  await workflow.do('Charge', 'chargeCard', {})",
        "  await workflow.milestone('paid')",
        "  await workflow.do('Receipt', 'sendReceipt', {})",
        '  return { ok: true }',
      ].join('\n')
    )
    const milestone = Object.values(nodes).find((n) => n.flow === 'milestone')
    assert.ok(milestone, JSON.stringify(nodes))
    assert.equal(milestone.reason, 'paid')
    assert.ok(code.includes("workflow.milestone('paid')"), code)
  })

  test('the removed onError option no longer produces an error route', async () => {
    const { nodes } = await inspectWorkflow(
      [
        "  await workflow.do('Charge', 'chargeCard', {}, { retries: 2 })",
        '  return { ok: true }',
      ].join('\n')
    )
    const charge = Object.values(nodes).find((n) => n.rpcName === 'chargeCard')
    assert.ok(!('onError' in (charge ?? {})))
  })
})
